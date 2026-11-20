import { MARKET_MAP, formatPrice } from '../../config/markets';
import type {
  BacktestOutcome,
  BacktestPeriodPreset,
  BacktestSignalRecord,
  BacktestSummary,
  Candle,
  FeeConfig,
  MarketBacktestResult,
  MarketId,
  OrderBookData,
  SimulationConfig,
  Ticker24h,
  Timeframe,
} from '../../types/market';
import { evaluateMarketDecision } from './decisionEngine';
import { evaluateMarketOpportunity } from './opportunityEngine';
import { simulateMarketTrade } from './tradeSimulator';

const MIN_15M_WARMUP_BARS = 99;
const MIN_15M_TOTAL_FOR_TEST = 110;
const MIN_1H_CANDLES = 48;
const MIN_4H_CANDLES = 26;
const BAR_5M_SECONDS = 300;
const BAR_15M_SECONDS = 900;
const BAR_1H_SECONDS = 3600;
const BAR_4H_SECONDS = 14400;

interface ActiveBacktestTrade {
  recordIndex: number;
  entryTimestampSec: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSizeUsdt: number;
  buyFeeUsdt: number;
  spreadCostUsdt: number;
  sellFeePct: number;
  riskRewardRatio: number | null;
}

/**
 * Builds a strictly causal (point-in-time) higher-timeframe series up to `cutoffCloseSec`.
 * - Includes ONLY completed higher-TF bars whose close time <= cutoffCloseSec.
 * - If `cutoffCloseSec` falls inside an active higher-TF bucket, synthesizes ONLY the
 *   observed partial bar from strictly closed lower-TF candles inside that bucket.
 * - ZERO future candles or future high/low/close values can ever leak into the slice.
 */
function buildCausalHigherTimeframe(
  higherCandles: Candle[],
  lowerCandlesUpToNow: Candle[],
  bucketSeconds: number,
  cutoffCloseSec: number
): Candle[] {
  const completed: Candle[] = [];
  for (let i = 0; i < higherCandles.length; i++) {
    const c = higherCandles[i];
    if (c.time + bucketSeconds <= cutoffCloseSec) {
      completed.push(c);
    } else {
      break;
    }
  }

  const currentBucketStart =
    Math.floor((cutoffCloseSec - 1) / bucketSeconds) * bucketSeconds;
  const lastCompletedTime =
    completed.length > 0 ? completed[completed.length - 1].time : -1;

  if (currentBucketStart > lastCompletedTime) {
    let open = 0;
    let high = -Infinity;
    let low = Infinity;
    let close = 0;
    let volume = 0;
    let count = 0;

    for (let j = lowerCandlesUpToNow.length - 1; j >= 0; j--) {
      const lc = lowerCandlesUpToNow[j];
      if (lc.time < currentBucketStart) break;
      if (lc.time >= currentBucketStart && lc.time + BAR_15M_SECONDS <= cutoffCloseSec) {
        if (count === 0) {
          close = lc.close;
        }
        open = lc.open;
        if (lc.high > high) high = lc.high;
        if (lc.low < low) low = lc.low;
        volume += lc.volume;
        count += 1;
      }
    }

    if (count > 0 && open > 0 && high > 0 && low > 0 && close > 0) {
      completed.push({
        time: currentBucketStart,
        open,
        high,
        low,
        close,
        volume,
        isClosed: false,
      });
    }
  }

  return completed;
}

/**
 * Constructs a strictly causal historical ticker snapshot at bar close using ONLY
 * the historical bar's close price and the real available Binance spread percentage.
 */
function buildHistoricalTicker(
  marketId: MarketId,
  bar: Candle,
  spreadPct: number,
  barCloseMs: number
): Ticker24h {
  const halfSpreadFactor = spreadPct / 200;
  const bidPrice = bar.close * (1 - halfSpreadFactor);
  const askPrice = bar.close * (1 + halfSpreadFactor);

  return {
    marketId,
    price: bar.close,
    priceChange: null,
    priceChangePercent: null,
    highPrice: bar.high,
    lowPrice: bar.low,
    openPrice: bar.open,
    volumeBase: bar.volume,
    volumeQuote: bar.volume * bar.close,
    bidPrice,
    bidQty: null,
    askPrice,
    askQty: null,
    tradeCount: null,
    updatedAt: barCloseMs,
  };
}

/**
 * Anchors the real observed Binance order book depth/structure around the historical bar price
 * while preserving the real available spread percentage and real observed top-of-book depth.
 */
function buildHistoricalOrderBook(
  liveOrderBook: OrderBookData,
  historicalPrice: number,
  spreadPct: number,
  barCloseMs: number
): OrderBookData {
  const halfSpreadFactor = spreadPct / 200;
  const targetBid = historicalPrice * (1 - halfSpreadFactor);
  const targetAsk = historicalPrice * (1 + halfSpreadFactor);
  const liveBid = liveOrderBook.bids[0]?.price ?? historicalPrice;
  const liveAsk = liveOrderBook.asks[0]?.price ?? historicalPrice;

  const bidScale = liveBid > 0 ? targetBid / liveBid : 1;
  const askScale = liveAsk > 0 ? targetAsk / liveAsk : 1;

  return {
    marketId: liveOrderBook.marketId,
    bids: liveOrderBook.bids.map((lvl) => ({
      price: lvl.price * bidScale,
      quantity: lvl.quantity,
      total: lvl.total,
    })),
    asks: liveOrderBook.asks.map((lvl) => ({
      price: lvl.price * askScale,
      quantity: lvl.quantity,
      total: lvl.total,
    })),
    lastUpdateId: liveOrderBook.lastUpdateId,
    updatedAt: barCloseMs,
  };
}

export interface BacktestMarketInput {
  marketId: MarketId;
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  liveTicker: Ticker24h | null;
  liveOrderBook: OrderBookData | null;
}

/**
 * Chronological Historical Backtesting Laboratory Engine.
 * - Uses ONLY real historical Binance candles already loaded by SPOT MASTER.
 * - Strictly ZERO lookahead bias: at every 15M candle `i`, all indicators (MA, S1, R1,
 *   RSI, ROC, ATR, relative volume, 1H/4H trend, previous UTC day) are computed strictly
 *   from candles `<= i`.
 * - Executes the EXACT current Opportunity Engine, Decision Engine, and Risk Management rules
 *   without modifying parameters or optimizing outcomes.
 */
export function runHistoricalBacktest(
  input: BacktestMarketInput,
  periodPreset: BacktestPeriodPreset,
  simulationConfig: SimulationConfig,
  feeConfig: FeeConfig
): MarketBacktestResult {
  const { marketId, candlesByTimeframe, liveTicker, liveOrderBook } = input;
  const market = MARKET_MAP[marketId];

  // Use ONLY strictly closed historical candles (never evaluate an incomplete forming bar)
  const raw5m = candlesByTimeframe['5m'] ?? [];
  const raw15m = candlesByTimeframe['15m'] ?? [];
  const raw1h = candlesByTimeframe['1h'] ?? [];
  const raw4h = candlesByTimeframe['4h'] ?? [];

  const closed5m = raw5m.filter((c) => c.isClosed);
  const closed15m = raw15m.filter((c) => c.isClosed);
  const closed1h = raw1h.filter((c) => c.isClosed);
  const closed4h = raw4h.filter((c) => c.isClosed);

  const insufficient = (reason: string): MarketBacktestResult => ({
    marketId,
    timeframe: '15m',
    periodPreset,
    hasSufficientData: false,
    insufficientReason: reason,
    startTimestampSec: closed15m.length > 0 ? closed15m[0].time : null,
    endTimestampSec:
      closed15m.length > 0 ? closed15m[closed15m.length - 1].time + BAR_15M_SECONDS : null,
    totalLoaded15mCandles: closed15m.length,
    evaluatedCandles: 0,
    spreadPctUsed: null,
    summary: null,
    records: [],
  });

  if (
    closed15m.length < MIN_15M_TOTAL_FOR_TEST ||
    closed1h.length < MIN_1H_CANDLES ||
    closed4h.length < MIN_4H_CANDLES
  ) {
    return insufficient(
      `Datos históricos insuficientes para ${marketId} (15M: ${closed15m.length}/${MIN_15M_TOTAL_FOR_TEST}, 1H: ${closed1h.length}/${MIN_1H_CANDLES}, 4H: ${closed4h.length}/${MIN_4H_CANDLES}).`
    );
  }

  // Real available Binance spread & order book liquidity (never fabricated)
  const bestBid = liveOrderBook?.bids[0]?.price ?? liveTicker?.bidPrice ?? null;
  const bestAsk = liveOrderBook?.asks[0]?.price ?? liveTicker?.askPrice ?? null;
  const spreadPct =
    bestBid !== null && bestAsk !== null && bestBid > 0 && bestAsk >= bestBid
      ? ((bestAsk - bestBid) / bestAsk) * 100
      : null;

  if (
    spreadPct === null ||
    !liveOrderBook ||
    liveOrderBook.bids.length === 0 ||
    liveOrderBook.asks.length === 0
  ) {
    return insufficient(
      `Datos históricos insuficientes: falta spread o libro de órdenes real disponible de Binance para ${marketId}.`
    );
  }

  const initialCapitalUsdt =
    Number.isFinite(simulationConfig.availableCapitalUsdt) &&
    simulationConfig.availableCapitalUsdt > 0
      ? simulationConfig.availableCapitalUsdt
      : 1300;
  const capitalAllocationPct =
    Number.isFinite(simulationConfig.capitalAllocationPct) &&
    simulationConfig.capitalAllocationPct > 0
      ? Math.min(100, simulationConfig.capitalAllocationPct)
      : 10;

  // Determine chronological evaluation start index respecting warm-up (>= 99 bars) + period preset
  const lastIdx = closed15m.length - 1;
  const lastCloseSec = closed15m[lastIdx].time + BAR_15M_SECONDS;

  let presetStartSec = closed15m[MIN_15M_WARMUP_BARS].time;
  if (periodPreset === '48h') {
    presetStartSec = lastCloseSec - 48 * 3600;
  } else if (periodPreset === '24h') {
    presetStartSec = lastCloseSec - 24 * 3600;
  }

  let startIndex = MIN_15M_WARMUP_BARS;
  for (let idx = MIN_15M_WARMUP_BARS; idx <= lastIdx; idx++) {
    if (closed15m[idx].time >= presetStartSec) {
      startIndex = idx;
      break;
    }
  }

  if (lastIdx - startIndex < 4) {
    return insufficient(
      `Datos históricos insuficientes para el período seleccionado en ${marketId}.`
    );
  }

  const records: BacktestSignalRecord[] = [];
  let activeTrade: ActiveBacktestTrade | null = null;

  let equity = initialCapitalUsdt;
  let peakEquity = initialCapitalUsdt;
  let maxDrawdownUsdt = 0;
  let maxDrawdownPct = 0;
  let accumulatedFeesUsdt = 0;
  let accumulatedSpreadUsdt = 0;

  let buySignals = 0;
  let waitSignals = 0;
  let noTradeSignals = 0;
  let executedTrades = 0;
  let skippedBuySignals = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let unresolvedTrades = 0;

  let rrSum = 0;
  let rrCount = 0;
  let bestTradeUsdt: number | null = null;
  let bestTradeTimestampSec: number | null = null;
  let worstTradeUsdt: number | null = null;
  let worstTradeTimestampSec: number | null = null;

  const updateDrawdown = (markedEquity: number) => {
    if (markedEquity > peakEquity) {
      peakEquity = markedEquity;
    }
    const ddUsdt = Math.max(0, peakEquity - markedEquity);
    const ddPct = peakEquity > 0 ? (ddUsdt / peakEquity) * 100 : 0;
    if (ddUsdt > maxDrawdownUsdt) {
      maxDrawdownUsdt = ddUsdt;
    }
    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
    }
  };

  for (let i = startIndex; i <= lastIdx; i++) {
    const bar = closed15m[i];
    const barCloseSec = bar.time + BAR_15M_SECONDS;
    const barCloseMs = barCloseSec * 1000;

    // -------------------------------------------------------------------------
    // Step 1: Monitor any existing open trade strictly on THIS subsequent candle
    // -------------------------------------------------------------------------
    if (activeTrade) {
      const hitStop = bar.low <= activeTrade.stopLoss;
      const hitTarget = bar.high >= activeTrade.takeProfit;

      if (hitStop || hitTarget) {
        // Conservative ordering: if both SL and TP occur in the same candle, assume SL hit first
        const isWin = !hitStop && hitTarget;
        const exitPrice = isWin ? activeTrade.takeProfit : activeTrade.stopLoss;
        const outcome: BacktestOutcome = isWin ? 'ganador' : 'perdedor';

        const priceDeltaPct = (exitPrice - activeTrade.entryPrice) / activeTrade.entryPrice;
        const grossPnlUsdt = activeTrade.positionSizeUsdt * priceDeltaPct;
        const exitNotional = Math.max(activeTrade.positionSizeUsdt + grossPnlUsdt, 0);
        const sellFeeUsdt = exitNotional * (activeTrade.sellFeePct / 100);
        const totalFeesUsdt = activeTrade.buyFeeUsdt + sellFeeUsdt;
        const netResultUsdt = grossPnlUsdt - totalFeesUsdt - activeTrade.spreadCostUsdt;
        const netResultPct = (netResultUsdt / activeTrade.positionSizeUsdt) * 100;
        const durationMinutes = Math.max(
          15,
          Math.round((barCloseSec - activeTrade.entryTimestampSec) / 60)
        );

        equity += netResultUsdt;
        accumulatedFeesUsdt += totalFeesUsdt;
        accumulatedSpreadUsdt += activeTrade.spreadCostUsdt;
        updateDrawdown(equity);

        if (isWin) winningTrades += 1;
        else losingTrades += 1;

        if (bestTradeUsdt === null || netResultUsdt > bestTradeUsdt) {
          bestTradeUsdt = netResultUsdt;
          bestTradeTimestampSec = activeTrade.entryTimestampSec;
        }
        if (worstTradeUsdt === null || netResultUsdt < worstTradeUsdt) {
          worstTradeUsdt = netResultUsdt;
          worstTradeTimestampSec = activeTrade.entryTimestampSec;
        }

        const rec = records[activeTrade.recordIndex];
        rec.exitPrice = exitPrice;
        rec.exitTimestampSec = barCloseSec;
        rec.outcome = outcome;
        rec.feesUsdt = totalFeesUsdt;
        rec.spreadCostUsdt = activeTrade.spreadCostUsdt;
        rec.netResultUsdt = netResultUsdt;
        rec.netResultPct = netResultPct;
        rec.durationMinutes = durationMinutes;

        activeTrade = null;
      } else {
        // Track realistic intrabar unrealized trough while trade remains open
        const worstIntrabarPnl =
          activeTrade.positionSizeUsdt *
            ((bar.low - activeTrade.entryPrice) / activeTrade.entryPrice) -
          activeTrade.buyFeeUsdt -
          activeTrade.spreadCostUsdt;
        updateDrawdown(equity + worstIntrabarPnl);
      }
    }

    // -------------------------------------------------------------------------
    // Step 2: Strictly point-in-time historical slice (ZERO future data)
    // -------------------------------------------------------------------------
    const slice5m = closed5m.filter((c) => c.time + BAR_5M_SECONDS <= barCloseSec);
    const slice15m = closed15m.slice(0, i + 1);
    const slice1h = buildCausalHigherTimeframe(closed1h, slice15m, BAR_1H_SECONDS, barCloseSec);
    const slice4h = buildCausalHigherTimeframe(closed4h, slice15m, BAR_4H_SECONDS, barCloseSec);

    const histTicker = buildHistoricalTicker(marketId, bar, spreadPct, barCloseMs);
    const histBook = buildHistoricalOrderBook(liveOrderBook, bar.close, spreadPct, barCloseMs);

    // Execute EXACT unmodified Opportunity Engine, Decision Engine (with causal 5M timing) & Risk Simulator
    const opp = evaluateMarketOpportunity(
      {
        marketId,
        ticker: histTicker,
        orderBook: histBook,
        candlesByTimeframe: {
          '15m': slice15m,
          '1h': slice1h,
          '4h': slice4h,
        },
        lastUpdatedAt: barCloseMs,
      },
      feeConfig,
      true,
      barCloseMs
    );

    const decision = evaluateMarketDecision(opp, true, slice5m);
    const sim = simulateMarketTrade(
      opp,
      decision,
      {
        availableCapitalUsdt: equity,
        capitalAllocationPct,
      },
      feeConfig,
      true
    );

    if (decision.state === 'BUY') buySignals += 1;
    else if (decision.state === 'WAIT') waitSignals += 1;
    else noTradeSignals += 1;

    let tradeOpened = false;
    let skipReason: string | null = null;
    let auditReason = '';

    if (decision.state === 'BUY') {
      if (activeTrade) {
        skippedBuySignals += 1;
        skipReason = 'Posición previa aún abierta en este mercado.';
        auditReason = `BUY detectado (Score ${opp.score ?? '—'}/100), omitido: ya existe una operación abierta.`;
      } else if (!sim.isAllowed || sim.stopLossPrice === null || sim.takeProfitPrice === null || sim.positionSizeUsdt === null || sim.buyFeeUsdt === null || sim.spreadCostUsdt === null) {
        skippedBuySignals += 1;
        skipReason =
          sim.blockingReasons[0] ?? 'Bloqueado por gestión de riesgo (operación no viable).';
        auditReason = `BUY bloqueado por Gestión de Riesgo (${sim.stateLabel}): ${skipReason}`;
      } else {
        tradeOpened = true;
        executedTrades += 1;
        if (sim.netRiskRewardRatio !== null) {
          rrSum += sim.netRiskRewardRatio;
          rrCount += 1;
        }
        auditReason =
          decision.activationReasons[0] ??
          `Confluencia 9/9 aprobada (Score ${opp.score}/100) · SL ${formatPrice(sim.stopLossPrice, market.priceDecimals)} · TP ${formatPrice(sim.takeProfitPrice, market.priceDecimals)}.`;
      }
    } else {
      auditReason =
        decision.blockingConditions[0] ??
        `Estado ${decision.state} (${decision.passedCount}/${decision.totalChecks} filtros).`;
    }

    const recordIndex = records.length;
    records.push({
      id: `${marketId}-${barCloseSec}-${i}`,
      barIndex: i,
      timestampSec: barCloseSec,
      marketId,
      entryPrice: bar.close,
      decisionState: decision.state,
      opportunityScore: opp.score,
      tradeOpened,
      skipReason,
      stopLoss: sim.stopLossPrice,
      takeProfit: sim.takeProfitPrice,
      exitPrice: null,
      exitTimestampSec: null,
      outcome: 'sin resultado',
      positionSizeUsdt: tradeOpened ? sim.positionSizeUsdt : null,
      feesUsdt: null,
      spreadCostUsdt: null,
      netResultUsdt: null,
      netResultPct: null,
      riskRewardRatio: sim.netRiskRewardRatio,
      durationMinutes: null,
      auditReason,
    });

    if (
      tradeOpened &&
      sim.stopLossPrice !== null &&
      sim.takeProfitPrice !== null &&
      sim.positionSizeUsdt !== null &&
      sim.buyFeeUsdt !== null &&
      sim.spreadCostUsdt !== null
    ) {
      activeTrade = {
        recordIndex,
        entryTimestampSec: barCloseSec,
        entryPrice: bar.close,
        stopLoss: sim.stopLossPrice,
        takeProfit: sim.takeProfitPrice,
        positionSizeUsdt: sim.positionSizeUsdt,
        buyFeeUsdt: sim.buyFeeUsdt,
        spreadCostUsdt: sim.spreadCostUsdt,
        sellFeePct: Math.max(0, feeConfig.sellFeePct),
        riskRewardRatio: sim.netRiskRewardRatio,
      };
    }
  }

  // Any trade still open after the final available historical candle remains "sin resultado"
  if (activeTrade) {
    unresolvedTrades += 1;
    const rec = records[activeTrade.recordIndex];
    rec.outcome = 'sin resultado';
    rec.durationMinutes = Math.max(
      15,
      Math.round((lastCloseSec - activeTrade.entryTimestampSec) / 60)
    );
    rec.auditReason = `${rec.auditReason} · Cierre del histórico alcanzado antes de tocar SL o R1.`;
  }

  const closedTrades = winningTrades + losingTrades;
  const winRatePct = closedTrades > 0 ? (winningTrades / closedTrades) * 100 : null;
  const netResultUsdt = equity - initialCapitalUsdt;
  const netResultPct = initialCapitalUsdt > 0 ? (netResultUsdt / initialCapitalUsdt) * 100 : 0;
  const averageRiskReward = rrCount > 0 ? rrSum / rrCount : null;

  const summary: BacktestSummary = {
    totalSignals: records.length,
    buySignals,
    waitSignals,
    noTradeSignals,
    executedTrades,
    skippedBuySignals,
    winningTrades,
    losingTrades,
    unresolvedTrades,
    winRatePct,
    initialCapitalUsdt,
    finalCapitalUsdt: equity,
    netResultUsdt,
    netResultPct,
    accumulatedFeesUsdt,
    accumulatedSpreadUsdt,
    maxDrawdownUsdt,
    maxDrawdownPct,
    averageRiskReward,
    bestTradeUsdt,
    bestTradeTimestampSec,
    worstTradeUsdt,
    worstTradeTimestampSec,
  };

  return {
    marketId,
    timeframe: '15m',
    periodPreset,
    hasSufficientData: true,
    insufficientReason: null,
    startTimestampSec: closed15m[startIndex].time + BAR_15M_SECONDS,
    endTimestampSec: lastCloseSec,
    totalLoaded15mCandles: closed15m.length,
    evaluatedCandles: records.length,
    spreadPctUsed: spreadPct,
    summary,
    records,
  };
}
