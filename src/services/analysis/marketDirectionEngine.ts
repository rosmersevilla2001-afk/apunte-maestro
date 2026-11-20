import type {
  Candle,
  DirectionTimeframe,
  MarketDirectionAnalysis,
  MarketDirectionLabel,
  MarketDirectionStrength,
  MarketId,
  OrderBookData,
  SwingStructureType,
  TimeframeDirectionResult,
} from '../../types/market';
import { computeTechnicalAnalysis } from './technicalAnalysis';

const MIN_CLOSED_CANDLES_FOR_DIRECTION = 26;
const SLOPE_LOOKBACK_BARS = 5;

const ROLE_LABELS: Record<DirectionTimeframe, 'Contexto' | 'Tendencia' | 'Setup'> = {
  '4h': 'Contexto',
  '1h': 'Tendencia',
  '15m': 'Setup',
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function strengthFromConfluence(confluence: number): MarketDirectionStrength {
  if (confluence >= 75) return 'Fuerte';
  if (confluence >= 50) return 'Moderada';
  return 'Débil';
}

function computeSeriesSlopePct(
  series: Array<{ time: number; value: number }>,
  lookback: number = SLOPE_LOOKBACK_BARS
): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].value;
  const prevIdx = Math.max(0, series.length - 1 - lookback);
  const prev = series[prevIdx].value;
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((last - prev) / prev) * 100;
}

/**
 * Detects real swing structure (HH/HL, LH/LL, LH/HL, HH/LL) strictly over closed candles.
 */
function detectClosedSwingStructure(closedCandles: Candle[]): SwingStructureType {
  if (closedCandles.length < 10) return 'Sin estructura clara';

  const sample = closedCandles.slice(-60);
  const swingHighs: Array<{ idx: number; price: number }> = [];
  const swingLows: Array<{ idx: number; price: number }> = [];

  for (let i = 2; i < sample.length - 2; i++) {
    const cur = sample[i];
    if (
      cur.high >= sample[i - 1].high &&
      cur.high >= sample[i - 2].high &&
      cur.high >= sample[i + 1].high &&
      cur.high >= sample[i + 2].high
    ) {
      const prev = swingHighs[swingHighs.length - 1];
      if (!prev || i - prev.idx >= 3) {
        swingHighs.push({ idx: i, price: cur.high });
      } else if (cur.high > prev.price) {
        prev.idx = i;
        prev.price = cur.high;
      }
    }
    if (
      cur.low <= sample[i - 1].low &&
      cur.low <= sample[i - 2].low &&
      cur.low <= sample[i + 1].low &&
      cur.low <= sample[i + 2].low
    ) {
      const prev = swingLows[swingLows.length - 1];
      if (!prev || i - prev.idx >= 3) {
        swingLows.push({ idx: i, price: cur.low });
      } else if (cur.low < prev.price) {
        prev.idx = i;
        prev.price = cur.low;
      }
    }
  }

  if (swingHighs.length < 2 || swingLows.length < 2) {
    return 'Sin estructura clara';
  }

  const hPrev = swingHighs[swingHighs.length - 2].price;
  const hLast = swingHighs[swingHighs.length - 1].price;
  const lPrev = swingLows[swingLows.length - 2].price;
  const lLast = swingLows[swingLows.length - 1].price;

  const higherHigh = hLast > hPrev;
  const lowerHigh = hLast < hPrev;
  const higherLow = lLast > lPrev;
  const lowerLow = lLast < lPrev;

  if (higherHigh && higherLow) return 'HH/HL';
  if (lowerHigh && lowerLow) return 'LH/LL';
  if (lowerHigh && higherLow) return 'LH/HL';
  if (higherHigh && lowerLow) return 'HH/LL';
  return 'Sin estructura clara';
}

function buildEmptyTimeframeResult(
  timeframe: DirectionTimeframe,
  reason: string,
  closedCount: number
): TimeframeDirectionResult {
  return {
    timeframe,
    roleLabel: ROLE_LABELS[timeframe],
    isValid: false,
    invalidReason: reason,
    direction: 'SIN DATOS',
    strength: null,
    confluence: null,
    swingStructure: null,
    maAlignment: null,
    ma7SlopePct: null,
    ma25SlopePct: null,
    ma99SlopePct: null,
    rsi14: null,
    roc10: null,
    relativeVolume: null,
    atr14: null,
    volatilityPct: null,
    volatilityRating: null,
    s1: null,
    r1: null,
    bidPressurePct: null,
    closedCandlesUsed: closedCount,
    summary: reason,
  };
}

/**
 * Evaluates a single timeframe (4H, 1H, or 15M) using STRICTLY closed candles
 * and real order book pressure (when available). Never uses unclosed 5M price.
 */
function evaluateTimeframeDirection(
  timeframe: DirectionTimeframe,
  rawCandles: Candle[] | undefined,
  orderBook: OrderBookData | null,
  isBinanceLive: boolean
): TimeframeDirectionResult {
  if (!isBinanceLive) {
    return buildEmptyTimeframeResult(
      timeframe,
      'Binance sin conexión: sin datos reales para determinar dirección.',
      0
    );
  }

  const closedCandles = (rawCandles ?? []).filter((c) => c.isClosed);
  if (closedCandles.length < MIN_CLOSED_CANDLES_FOR_DIRECTION) {
    return buildEmptyTimeframeResult(
      timeframe,
      `Velas cerradas ${timeframe.toUpperCase()} insuficientes (${closedCandles.length}/${MIN_CLOSED_CANDLES_FOR_DIRECTION}).`,
      closedCandles.length
    );
  }

  // Pass ticker = null so analysis strictly uses the LAST CLOSED candle close (never unclosed live/5M ticks)
  const tech = computeTechnicalAnalysis(
    timeframe,
    { [timeframe]: closedCandles },
    null,
    orderBook
  );

  if (
    !tech ||
    tech.ma7 === null ||
    tech.ma25 === null ||
    tech.rsi14 === null ||
    tech.roc10 === null ||
    tech.atr14 === null ||
    tech.volatilityPct === null ||
    tech.relativeVolume === null
  ) {
    return buildEmptyTimeframeResult(
      timeframe,
      `Faltan indicadores reales cerrados en ${timeframe.toUpperCase()} (MA, RSI, ROC, ATR o volumen).`,
      closedCandles.length
    );
  }

  const lastClosedPrice = closedCandles[closedCandles.length - 1].close;
  const swingStructure = detectClosedSwingStructure(closedCandles);

  const ma7 = tech.ma7;
  const ma25 = tech.ma25;
  const ma99 = tech.ma99;

  const ma7SlopePct = computeSeriesSlopePct(tech.ma7Series);
  const ma25SlopePct = computeSeriesSlopePct(tech.ma25Series);
  const ma99SlopePct = computeSeriesSlopePct(tech.ma99Series);

  const rsi14 = tech.rsi14;
  const roc10 = tech.roc10;
  const relativeVolume = tech.relativeVolume;
  const atr14 = tech.atr14;
  const volatilityPct = tech.volatilityPct;
  const volatilityRating = tech.volatilityRating;
  const s1 = tech.supports[0] ?? null;
  const r1 = tech.resistances[0] ?? null;
  const bidPressurePct = tech.bidPressurePct;

  // ---------------------------------------------------------------------------
  // 1. Structure HH/HL & LH/LL (25 pts)
  // ---------------------------------------------------------------------------
  let structBull = 0;
  let structBear = 0;
  if (swingStructure === 'HH/HL') structBull = 25;
  else if (swingStructure === 'LH/LL') structBear = 25;

  // ---------------------------------------------------------------------------
  // 2. Moving Averages Alignment MA7 / MA25 / MA99 (20 pts)
  // ---------------------------------------------------------------------------
  let maBull = 0;
  let maBear = 0;
  let maAlignment = 'Medias cruzadas / laterales';

  if (ma99 !== null) {
    if (lastClosedPrice > ma7 && ma7 > ma25 && ma25 > ma99) {
      maBull = 20;
      maAlignment = 'Precio > MA7 > MA25 > MA99';
    } else if (lastClosedPrice < ma7 && ma7 < ma25 && ma25 < ma99) {
      maBear = 20;
      maAlignment = 'Precio < MA7 < MA25 < MA99';
    } else if (ma7 > ma25 && lastClosedPrice >= ma25) {
      maBull = lastClosedPrice >= ma99 ? 15 : 10;
      maAlignment = lastClosedPrice >= ma99 ? 'MA7 > MA25 sobre MA99' : 'MA7 > MA25 bajo MA99';
    } else if (ma7 < ma25 && lastClosedPrice <= ma25) {
      maBear = lastClosedPrice <= ma99 ? 15 : 10;
      maAlignment = lastClosedPrice <= ma99 ? 'MA7 < MA25 bajo MA99' : 'MA7 < MA25 sobre MA99';
    }
  } else {
    if (lastClosedPrice > ma7 && ma7 > ma25) {
      maBull = 18;
      maAlignment = 'Precio > MA7 > MA25 (sin MA99)';
    } else if (lastClosedPrice < ma7 && ma7 < ma25) {
      maBear = 18;
      maAlignment = 'Precio < MA7 < MA25 (sin MA99)';
    } else if (ma7 > ma25) {
      maBull = 10;
      maAlignment = 'MA7 > MA25';
    } else if (ma7 < ma25) {
      maBear = 10;
      maAlignment = 'MA7 < MA25';
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Moving Averages Slopes (15 pts)
  // ---------------------------------------------------------------------------
  const slopeThreshold = Math.max(0.015, volatilityPct * 0.12);
  let slopeBull = 0;
  let slopeBear = 0;

  if (ma7SlopePct !== null) {
    if (ma7SlopePct > slopeThreshold) slopeBull += 5;
    else if (ma7SlopePct < -slopeThreshold) slopeBear += 5;
  }
  if (ma25SlopePct !== null) {
    if (ma25SlopePct > slopeThreshold * 0.7) slopeBull += 6;
    else if (ma25SlopePct < -slopeThreshold * 0.7) slopeBear += 6;
  }
  if (ma99SlopePct !== null) {
    if (ma99SlopePct > slopeThreshold * 0.4) slopeBull += 4;
    else if (ma99SlopePct < -slopeThreshold * 0.4) slopeBear += 4;
  } else {
    // When MA99 is not yet available (e.g. shorter history), scale MA7+MA25 slope proportionally to 15
    slopeBull = Math.round((slopeBull / 11) * 15);
    slopeBear = Math.round((slopeBear / 11) * 15);
  }

  // ---------------------------------------------------------------------------
  // 4. Momentum RSI(14) + ROC(10) (15 pts)
  // ---------------------------------------------------------------------------
  let momBull = 0;
  let momBear = 0;

  if (rsi14 >= 54 && roc10 > 0) momBull = 15;
  else if (rsi14 >= 50 && roc10 >= 0) momBull = 9;
  else if (rsi14 > 52 || roc10 > 0.08) momBull = 5;

  if (rsi14 <= 46 && roc10 < 0) momBear = 15;
  else if (rsi14 <= 50 && roc10 <= 0) momBear = 9;
  else if (rsi14 < 48 || roc10 < -0.08) momBear = 5;

  // ---------------------------------------------------------------------------
  // 5. Relative Volume confirmation (10 pts)
  // ---------------------------------------------------------------------------
  let volScore = 2;
  if (relativeVolume >= 1.2) volScore = 10;
  else if (relativeVolume >= 0.9) volScore = 6;
  else if (relativeVolume >= 0.72) volScore = 4;

  // Volume confirms whichever directional side has core trend+momentum advantage
  const coreBull = structBull + maBull + slopeBull + momBull;
  const coreBear = structBear + maBear + slopeBear + momBear;
  const volBull = coreBull > coreBear ? volScore : Math.round(volScore * 0.3);
  const volBear = coreBear > coreBull ? volScore : Math.round(volScore * 0.3);

  // ---------------------------------------------------------------------------
  // 6. ATR / Volatility support for directional movement (5 pts)
  // ---------------------------------------------------------------------------
  const atrScore =
    volatilityRating === 'Moderada' ? 5 : volatilityRating === 'Alta' ? 3 : 1;
  const atrBull = coreBull >= coreBear ? atrScore : Math.min(2, atrScore);
  const atrBear = coreBear >= coreBull ? atrScore : Math.min(2, atrScore);

  // ---------------------------------------------------------------------------
  // 7. Support S1 & Resistance R1 structural context (5 pts)
  // ---------------------------------------------------------------------------
  let srBull = 0;
  let srBear = 0;
  if (s1 && r1) {
    const totalRange = s1.distancePct + r1.distancePct;
    const posInRange = totalRange > 0 ? s1.distancePct / totalRange : 0.5;
    // Holding above S1 with clear upside room toward R1 favors bullish continuation
    if (posInRange <= 0.65 && r1.distancePct >= 0.25) srBull = 5;
    else if (r1.distancePct >= 0.15) srBull = 2;

    // Pressing below R1 with downside room toward S1 favors bearish continuation
    if (posInRange >= 0.35 && s1.distancePct >= 0.25) srBear = 5;
    else if (s1.distancePct >= 0.15) srBear = 2;
  } else if (s1 && !r1) {
    // Above all recent highs with real support below
    srBull = 5;
  } else if (r1 && !s1) {
    // Below all recent lows with real resistance above
    srBear = 5;
  }

  // ---------------------------------------------------------------------------
  // 8. Order Book Pressure (5 pts ONLY when real order book exists; never fabricated)
  // ---------------------------------------------------------------------------
  let bookBull = 0;
  let bookBear = 0;
  let maxPossiblePoints = 95;

  if (bidPressurePct !== null) {
    maxPossiblePoints = 100;
    if (bidPressurePct >= 56) bookBull = 5;
    else if (bidPressurePct >= 52) bookBull = 3;
    else if (bidPressurePct <= 44) bookBear = 5;
    else if (bidPressurePct <= 48) bookBear = 3;
  }

  const rawBull = structBull + maBull + slopeBull + momBull + volBull + atrBull + srBull + bookBull;
  const rawBear = structBear + maBear + slopeBear + momBear + volBear + atrBear + srBear + bookBear;

  const bullConfluence = Math.round(clamp((rawBull / maxPossiblePoints) * 100, 0, 100));
  const bearConfluence = Math.round(clamp((rawBear / maxPossiblePoints) * 100, 0, 100));

  // ---------------------------------------------------------------------------
  // Strict Classification Rules:
  // - ALCISTA requires real HH/HL + bullish trend/momentum confluence
  // - BAJISTA requires real LH/LL + bearish trend/momentum confluence
  // - LATERAL when structure is contradictory or lacks confirmation
  // ---------------------------------------------------------------------------
  const hasBullishTrendMomentum =
    (maBull > maBear || slopeBull > slopeBear) && momBull > momBear && maBear < 15;
  const hasBearishTrendMomentum =
    (maBear > maBull || slopeBear > slopeBull) && momBear > momBull && maBull < 15;

  let direction: MarketDirectionLabel = 'LATERAL';
  let confluence = Math.min(64, Math.max(bullConfluence, bearConfluence));
  let summary = '';

  if (
    swingStructure === 'HH/HL' &&
    hasBullishTrendMomentum &&
    bullConfluence >= 55 &&
    bullConfluence - bearConfluence >= 20
  ) {
    direction = 'ALCISTA';
    confluence = bullConfluence;
    summary = `${timeframe.toUpperCase()} ALCISTA: estructura HH/HL con medias (${maAlignment}) y momentum favorable (RSI ${rsi14.toFixed(1)}, ROC ${roc10 >= 0 ? '+' : ''}${roc10.toFixed(2)}%).`;
  } else if (
    swingStructure === 'LH/LL' &&
    hasBearishTrendMomentum &&
    bearConfluence >= 55 &&
    bearConfluence - bullConfluence >= 20
  ) {
    direction = 'BAJISTA';
    confluence = bearConfluence;
    summary = `${timeframe.toUpperCase()} BAJISTA: estructura LH/LL con sesgo de medias (${maAlignment}) y momentum bajista (RSI ${rsi14.toFixed(1)}, ROC ${roc10.toFixed(2)}%).`;
  } else {
    direction = 'LATERAL';
    // Cap lateral confluence cleanly so contradictory setups never read as high-confluence trends
    const spreadPenalty = Math.abs(bullConfluence - bearConfluence);
    confluence = Math.round(clamp(Math.min(54, Math.max(bullConfluence, bearConfluence) * 0.75 + spreadPenalty * 0.1), 10, 54));

    if (swingStructure === 'HH/HL') {
      summary = `${timeframe.toUpperCase()} LATERAL: estructura HH/HL sin confirmación suficiente de tendencia/momentum.`;
    } else if (swingStructure === 'LH/LL') {
      summary = `${timeframe.toUpperCase()} LATERAL: estructura LH/LL sin confluencia bajista suficiente.`;
    } else {
      summary = `${timeframe.toUpperCase()} LATERAL: estructura ${swingStructure} sin dirección dominante confirmada.`;
    }
  }

  return {
    timeframe,
    roleLabel: ROLE_LABELS[timeframe],
    isValid: true,
    invalidReason: null,
    direction,
    strength: strengthFromConfluence(confluence),
    confluence,
    swingStructure,
    maAlignment,
    ma7SlopePct,
    ma25SlopePct,
    ma99SlopePct,
    rsi14,
    roc10,
    relativeVolume,
    atr14,
    volatilityPct,
    volatilityRating,
    s1,
    r1,
    bidPressurePct,
    closedCandlesUsed: closedCandles.length,
    summary,
  };
}

/**
 * Real Market Direction Detector (4H, 1H, 15M analyzed separately).
 * - Uses ONLY real closed candles (4H, 1H, 15M) and real order book pressure when present.
 * - NEVER uses an unclosed 5M candle to determine direction.
 * - NEVER invents missing data or success probabilities.
 */
export function evaluateMarketDirection(
  marketId: MarketId,
  candlesByTimeframe: Partial<Record<'4h' | '1h' | '15m' | '5m', Candle[]>>,
  orderBook: OrderBookData | null,
  isBinanceLive: boolean
): MarketDirectionAnalysis {
  const tf4h = evaluateTimeframeDirection('4h', candlesByTimeframe['4h'], orderBook, isBinanceLive);
  const tf1h = evaluateTimeframeDirection('1h', candlesByTimeframe['1h'], orderBook, isBinanceLive);
  const tf15m = evaluateTimeframeDirection('15m', candlesByTimeframe['15m'], orderBook, isBinanceLive);

  const timeframes: Record<DirectionTimeframe, TimeframeDirectionResult> = {
    '4h': tf4h,
    '1h': tf1h,
    '15m': tf15m,
  };

  const missingTfs: string[] = [];
  if (!tf4h.isValid) missingTfs.push('4H');
  if (!tf1h.isValid) missingTfs.push('1H');
  if (!tf15m.isValid) missingTfs.push('15M');

  if (!isBinanceLive || missingTfs.length > 0) {
    const reason = !isBinanceLive
      ? 'Binance desconectado: Dirección de Mercado en SIN DATOS.'
      : `Faltan velas cerradas o indicadores reales en ${missingTfs.join(', ')}: SIN DATOS.`;
    return {
      marketId,
      isValid: false,
      invalidReason: reason,
      overallDirection: 'SIN DATOS',
      overallStrength: null,
      overallConfluence: null,
      timeframes,
      summary: reason,
      limitGuidance: 'Sin señal hasta contar con histórico cerrado completo en 4H, 1H y 15M.',
      updatedAt: orderBook?.updatedAt ?? Date.now(),
    };
  }

  const d4 = tf4h.direction;
  const d1 = tf1h.direction;
  const d15 = tf15m.direction;

  const c4 = tf4h.confluence ?? 0;
  const c1 = tf1h.confluence ?? 0;
  const c15 = tf15m.confluence ?? 0;

  // Weighted technical confluence across 4H (40%), 1H (35%), 15M (25%)
  const weightedConfluence = Math.round(clamp(c4 * 0.4 + c1 * 0.35 + c15 * 0.25, 0, 100));

  const isOverallBullish =
    (d4 === 'ALCISTA' && d1 === 'ALCISTA' && d15 !== 'BAJISTA') ||
    (d4 !== 'BAJISTA' && d1 === 'ALCISTA' && d15 === 'ALCISTA');

  const isOverallBearish =
    (d4 === 'BAJISTA' && d1 === 'BAJISTA' && d15 !== 'ALCISTA') ||
    (d4 !== 'ALCISTA' && d1 === 'BAJISTA' && d15 === 'BAJISTA');

  let overallDirection: MarketDirectionLabel = 'LATERAL';
  let overallConfluence = weightedConfluence;
  let summary = '';
  let limitGuidance = '';

  if (isOverallBullish && weightedConfluence >= 52) {
    overallDirection = 'ALCISTA';
    // Bonus alignment clarity when all 3 timeframes agree on ALCISTA
    overallConfluence =
      d4 === 'ALCISTA' && d1 === 'ALCISTA' && d15 === 'ALCISTA'
        ? Math.min(100, Math.round(weightedConfluence * 1.05))
        : weightedConfluence;
    summary = `Dirección ALCISTA confirmada (${d4} 4H · ${d1} 1H · ${d15} 15M) con estructura HH/HL y confluencia técnica ${overallConfluence}/100.`;
    limitGuidance =
      'Dirección alcista no implica compra inmediata: esperar zona BUY LIMIT favorable (S1 + ATR) y confirmación 5M cerrada.';
  } else if (isOverallBearish && weightedConfluence >= 52) {
    overallDirection = 'BAJISTA';
    overallConfluence =
      d4 === 'BAJISTA' && d1 === 'BAJISTA' && d15 === 'BAJISTA'
        ? Math.min(100, Math.round(weightedConfluence * 1.05))
        : weightedConfluence;
    summary = `Dirección BAJISTA confirmada (${d4} 4H · ${d1} 1H · ${d15} 15M) con estructura LH/LL y confluencia técnica ${overallConfluence}/100.`;
    limitGuidance = 'Dirección bajista activa: filtro bloquea nuevas compras LIMIT.';
  } else {
    overallDirection = 'LATERAL';
    overallConfluence = Math.min(54, weightedConfluence);
    summary = `Dirección LATERAL (${d4} 4H · ${d1} 1H · ${d15} 15M): estructura contradictoria o sin confirmación direccional suficiente.`;
    limitGuidance = 'Mercado sin dirección confirmada: mantener en ESPERAR hasta alineación HH/HL.';
  }

  return {
    marketId,
    isValid: true,
    invalidReason: null,
    overallDirection,
    overallStrength: strengthFromConfluence(overallConfluence),
    overallConfluence,
    timeframes,
    summary,
    limitGuidance,
    updatedAt: orderBook?.updatedAt ?? Date.now(),
  };
}
