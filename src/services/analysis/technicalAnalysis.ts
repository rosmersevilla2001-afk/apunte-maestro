import type {
  Candle,
  CandleStructureAnalysis,
  MomentumState,
  OrderBookData,
  PreviousDayAnalysis,
  PriceLevel,
  TechnicalAnalysis,
  Ticker24h,
  Timeframe,
  TimeframeSnapshot,
  TrendDirection,
  VolatilityRating,
  VolumeRating,
} from '../../types/market';

const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
};

function calculateSMASeries(
  candles: Candle[],
  period: number
): Array<{ time: number; value: number }> {
  if (candles.length < period) return [];
  const series: Array<{ time: number; value: number }> = [];
  let rollingSum = 0;

  for (let i = 0; i < candles.length; i++) {
    rollingSum += candles[i].close;
    if (i >= period) {
      rollingSum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      series.push({
        time: candles[i].time,
        value: rollingSum / period,
      });
    }
  }

  return series;
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0 && avgGain === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateROC(closes: number[], period = 10): number | null {
  if (closes.length < period + 1) return null;
  const latest = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - period];
  if (!Number.isFinite(latest) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((latest - prev) / prev) * 100;
}

function calculateATR(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;

  // Wilder's smoothing for institutional ATR accuracy
  let atr = trs.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return Number.isFinite(atr) ? atr : null;
}

function classifyTrend(
  currentPrice: number,
  ma7Series: Array<{ time: number; value: number }>,
  ma25Series: Array<{ time: number; value: number }>,
  ma99Series: Array<{ time: number; value: number }>,
  atr14: number | null
): { trend: TrendDirection | null; detail: string | null } {
  if (ma7Series.length === 0 || ma25Series.length === 0) {
    return { trend: null, detail: null };
  }

  const ma7 = ma7Series[ma7Series.length - 1].value;
  const ma25 = ma25Series[ma25Series.length - 1].value;
  const ma99 = ma99Series.length > 0 ? ma99Series[ma99Series.length - 1].value : null;

  const ma25Prev =
    ma25Series.length >= 6
      ? ma25Series[ma25Series.length - 6].value
      : ma25Series[0].value;
  const ma25SlopePct = ma25Prev > 0 ? ((ma25 - ma25Prev) / ma25Prev) * 100 : 0;
  const maSpreadPct = ma25 > 0 ? ((ma7 - ma25) / ma25) * 100 : 0;
  const minBandPct =
    atr14 !== null && currentPrice > 0
      ? Math.max(0.04, (atr14 / currentPrice) * 15)
      : 0.05;

  if (ma99 !== null) {
    if (currentPrice > ma7 && ma7 > ma25 && ma25 > ma99) {
      return {
        trend: 'Alcista',
        detail: 'Alineación alcista completa: Precio > MA7 > MA25 > MA99',
      };
    }
    if (currentPrice < ma7 && ma7 < ma25 && ma25 < ma99) {
      return {
        trend: 'Bajista',
        detail: 'Alineación bajista completa: Precio < MA7 < MA25 < MA99',
      };
    }
    if (ma7 > ma25 && currentPrice >= ma25 && maSpreadPct > minBandPct * 0.6) {
      return {
        trend: 'Alcista',
        detail:
          currentPrice >= ma99
            ? 'Sesgo alcista sobre MA25 y MA99'
            : 'Rebote alcista de corto plazo (MA7 > MA25) bajo MA99',
      };
    }
    if (ma7 < ma25 && currentPrice <= ma25 && maSpreadPct < -minBandPct * 0.6) {
      return {
        trend: 'Bajista',
        detail:
          currentPrice <= ma99
            ? 'Sesgo bajista bajo MA25 y MA99'
            : 'Corrección bajista de corto plazo (MA7 < MA25) sobre MA99',
      };
    }
  } else {
    if (ma7 > ma25 && maSpreadPct > minBandPct * 0.6 && ma25SlopePct >= 0) {
      return {
        trend: 'Alcista',
        detail: 'MA7 por encima de MA25 con pendiente positiva',
      };
    }
    if (ma7 < ma25 && maSpreadPct < -minBandPct * 0.6 && ma25SlopePct <= 0) {
      return {
        trend: 'Bajista',
        detail: 'MA7 por debajo de MA25 con pendiente negativa',
      };
    }
  }

  return {
    trend: 'Lateral',
    detail: 'Medias móviles cruzadas o comprimidas sin dirección dominante',
  };
}

function computePreviousDay(
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>,
  activeTimeframe: Timeframe,
  currentPrice: number | null,
  referenceTimeMs?: number
): PreviousDayAnalysis | null {
  if (currentPrice === null || currentPrice <= 0) return null;

  // Prefer 1H (7 days) or 15M (3 days) so previous UTC day is complete (24h),
  // falling back to 4H or the active timeframe.
  const priorityOrder: Timeframe[] = ['1h', '15m', '4h', activeTimeframe, '5m'];
  const seen = new Set<Timeframe>();

  const now = new Date(referenceTimeMs ?? Date.now());
  const todayUtcStartSec = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000
  );
  const yesterdayUtcStartSec = todayUtcStartSec - 86400;

  for (const tf of priorityOrder) {
    if (seen.has(tf)) continue;
    seen.add(tf);
    const list = candlesByTimeframe[tf];
    if (!list || list.length === 0) continue;

    const prevDayCandles = list.filter(
      (c) => c.time >= yesterdayUtcStartSec && c.time < todayUtcStartSec
    );

    if (prevDayCandles.length === 0) continue;

    const open = prevDayCandles[0].open;
    const close = prevDayCandles[prevDayCandles.length - 1].close;
    const high = Math.max(...prevDayCandles.map((c) => c.high));
    const low = Math.min(...prevDayCandles.map((c) => c.low));
    const volumeBase = prevDayCandles.reduce((sum, c) => sum + c.volume, 0);

    if (!(open > 0 && high > 0 && low > 0 && close > 0)) continue;

    const changePct = ((close - open) / open) * 100;
    const rangePct = ((high - low) / low) * 100;

    let positionLabel: PreviousDayAnalysis['positionLabel'] = 'Dentro rango día ant.';
    if (currentPrice > high) positionLabel = 'Sobre máx. día ant.';
    else if (currentPrice < low) positionLabel = 'Bajo mín. día ant.';

    return {
      open,
      high,
      low,
      close,
      changePct,
      rangePct,
      volumeBase,
      positionLabel,
      candlesUsed: prevDayCandles.length,
      sourceTimeframe: tf,
    };
  }

  return null;
}

function detectSupportsAndResistances(
  candles: Candle[],
  currentPrice: number,
  atr14: number | null,
  previousDay: PreviousDayAnalysis | null
): { supports: PriceLevel[]; resistances: PriceLevel[] } {
  if (candles.length < 15 || currentPrice <= 0) {
    return { supports: [], resistances: [] };
  }

  const wing = 3;
  const pivotLows: number[] = [];
  const pivotHighs: number[] = [];

  for (let i = wing; i < candles.length - wing; i++) {
    const cur = candles[i];
    let isLow = true;
    let isHigh = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (candles[j].low < cur.low) isLow = false;
      if (candles[j].high > cur.high) isHigh = false;
    }
    if (isLow) pivotLows.push(cur.low);
    if (isHigh) pivotHighs.push(cur.high);
  }

  const tolerance = Math.max(
    atr14 !== null ? atr14 * 0.4 : 0,
    currentPrice * 0.0008
  );

  const cluster = (
    rawLevels: Array<{ price: number; source: string }>
  ): Array<{ price: number; touches: number; source: string }> => {
    const sorted = [...rawLevels].sort((a, b) => a.price - b.price);
    const clusters: Array<{
      sum: number;
      count: number;
      anchor: number;
      source: string;
    }> = [];

    for (const item of sorted) {
      const existing = clusters.find(
        (cl) => Math.abs(cl.anchor - item.price) <= tolerance
      );
      if (existing) {
        existing.sum += item.price;
        existing.count += 1;
        existing.anchor = existing.sum / existing.count;
        if (item.source !== 'Pivote') {
          existing.source = item.source;
        }
      } else {
        clusters.push({
          sum: item.price,
          count: 1,
          anchor: item.price,
          source: item.source,
        });
      }
    }

    return clusters.map((c) => ({
      price: c.anchor,
      touches: c.count,
      source: c.source,
    }));
  };

  const supportCandidates: Array<{ price: number; source: string }> = pivotLows
    .filter((p) => p < currentPrice * 0.9999)
    .map((price) => ({ price, source: 'Pivote' }));

  if (previousDay && previousDay.low < currentPrice * 0.9999) {
    supportCandidates.push({ price: previousDay.low, source: 'Mín. día ant.' });
  }

  const resistanceCandidates: Array<{ price: number; source: string }> = pivotHighs
    .filter((p) => p > currentPrice * 1.0001)
    .map((price) => ({ price, source: 'Pivote' }));

  if (previousDay && previousDay.high > currentPrice * 1.0001) {
    resistanceCandidates.push({ price: previousDay.high, source: 'Máx. día ant.' });
  }

  let supports = cluster(supportCandidates)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3)
    .map((c) => ({
      price: c.price,
      distancePct: ((currentPrice - c.price) / currentPrice) * 100,
      touches: c.touches,
      source: c.source,
    }));

  // If no swing pivot below price, check real observed historical floor strictly below price
  if (supports.length === 0) {
    const minLow = Math.min(...candles.map((c) => c.low));
    if (minLow < currentPrice * 0.9999) {
      supports = [
        {
          price: minLow,
          distancePct: ((currentPrice - minLow) / currentPrice) * 100,
          touches: 1,
          source: 'Mín. período',
        },
      ];
    }
  }

  let resistances = cluster(resistanceCandidates)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3)
    .map((c) => ({
      price: c.price,
      distancePct: ((c.price - currentPrice) / currentPrice) * 100,
      touches: c.touches,
      source: c.source,
    }));

  if (resistances.length === 0) {
    const maxHigh = Math.max(...candles.map((c) => c.high));
    if (maxHigh > currentPrice * 1.0001) {
      resistances = [
        {
          price: maxHigh,
          distancePct: ((maxHigh - currentPrice) / currentPrice) * 100,
          touches: 1,
          source: 'Máx. período',
        },
      ];
    }
  }

  return { supports, resistances };
}

function analyzeCandleStructure(candles: Candle[]): CandleStructureAnalysis | null {
  // Require at least 6 candles so we have a closed candle + recent structure context
  if (candles.length < 6) return null;

  const closed = candles.slice(0, -1);
  const lastClosed = closed[closed.length - 1];
  const range = lastClosed.high - lastClosed.low;
  const body = Math.abs(lastClosed.close - lastClosed.open);
  const upperWick = lastClosed.high - Math.max(lastClosed.open, lastClosed.close);
  const lowerWick = Math.min(lastClosed.open, lastClosed.close) - lastClosed.low;

  const bodyPct = range > 0 ? (body / range) * 100 : 0;
  const upperWickPct = range > 0 ? (upperWick / range) * 100 : 0;
  const lowerWickPct = range > 0 ? (lowerWick / range) * 100 : 0;

  let lastCandleDirection: 'Alcista' | 'Bajista' | 'Doji' = 'Doji';
  if (range > 0 && bodyPct > 15) {
    lastCandleDirection = lastClosed.close >= lastClosed.open ? 'Alcista' : 'Bajista';
  }

  let lastCandlePattern = 'Sin rango de variación';
  if (range > 0) {
    if (bodyPct <= 18) {
      if (lowerWickPct >= 50) lastCandlePattern = 'Martillo / Rechazo inferior';
      else if (upperWickPct >= 50) lastCandlePattern = 'Estrella fugaz / Rechazo superior';
      else lastCandlePattern = 'Doji / Indecisión';
    } else if (lowerWickPct >= 45 && lastClosed.close >= lastClosed.open) {
      lastCandlePattern = 'Rechazo inferior comprador';
    } else if (upperWickPct >= 45 && lastClosed.close < lastClosed.open) {
      lastCandlePattern = 'Rechazo superior vendedor';
    } else if (bodyPct >= 62) {
      lastCandlePattern =
        lastClosed.close >= lastClosed.open
          ? 'Vela alcista de impulso'
          : 'Vela bajista de impulso';
    } else {
      lastCandlePattern =
        lastClosed.close >= lastClosed.open
          ? 'Cuerpo alcista moderado'
          : 'Cuerpo bajista moderado';
    }
  }

  // Last 10 closed candles bullish vs bearish balance
  const recent10 = closed.slice(-10);
  let bullishCountLast10 = 0;
  let bearishCountLast10 = 0;
  for (const c of recent10) {
    if (c.close > c.open) bullishCountLast10 += 1;
    else if (c.close < c.open) bearishCountLast10 += 1;
  }

  // Swing Highs / Swing Lows across recent closed candles (wing = 2)
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  const sample = closed.slice(-45);
  for (let i = 2; i < sample.length - 2; i++) {
    const cur = sample[i];
    if (
      cur.high >= sample[i - 1].high &&
      cur.high >= sample[i - 2].high &&
      cur.high >= sample[i + 1].high &&
      cur.high >= sample[i + 2].high
    ) {
      swingHighs.push(cur.high);
    }
    if (
      cur.low <= sample[i - 1].low &&
      cur.low <= sample[i - 2].low &&
      cur.low <= sample[i + 1].low &&
      cur.low <= sample[i + 2].low
    ) {
      swingLows.push(cur.low);
    }
  }

  let swingStructure = 'Rango en consolidación';
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const hPrev = swingHighs[swingHighs.length - 2];
    const hLast = swingHighs[swingHighs.length - 1];
    const lPrev = swingLows[swingLows.length - 2];
    const lLast = swingLows[swingLows.length - 1];

    const higherHigh = hLast > hPrev;
    const lowerHigh = hLast < hPrev;
    const higherLow = lLast > lPrev;
    const lowerLow = lLast < lPrev;

    if (higherHigh && higherLow) swingStructure = 'HH / HL (Estructura alcista)';
    else if (lowerHigh && lowerLow) swingStructure = 'LH / LL (Estructura bajista)';
    else if (lowerHigh && higherLow) swingStructure = 'LH / HL (Compresión de rango)';
    else if (higherHigh && lowerLow) swingStructure = 'HH / LL (Expansión volátil)';
  }

  return {
    swingStructure,
    lastCandlePattern,
    lastCandleDirection,
    bodyPct,
    upperWickPct,
    lowerWickPct,
    bullishCountLast10,
    bearishCountLast10,
  };
}

function buildTimeframeSnapshot(
  timeframe: Timeframe,
  candles: Candle[] | undefined
): TimeframeSnapshot {
  if (!candles || candles.length === 0) {
    return {
      timeframe,
      candleCount: 0,
      trend: null,
      ma7: null,
      ma25: null,
      ma99: null,
      rsi14: null,
      relativeVolume: null,
    };
  }

  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];
  const ma7Series = calculateSMASeries(candles, 7);
  const ma25Series = calculateSMASeries(candles, 25);
  const ma99Series = calculateSMASeries(candles, 99);
  const atr14 = calculateATR(candles, 14);
  const rsi14 = calculateRSI(closes, 14);
  const { trend } = classifyTrend(currentPrice, ma7Series, ma25Series, ma99Series, atr14);

  let relativeVolume: number | null = null;
  if (candles.length >= 21) {
    const completed = candles.slice(0, -1);
    const avg20 =
      completed.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    const recent3 =
      completed.slice(-3).reduce((s, c) => s + c.volume, 0) /
      Math.max(1, Math.min(3, completed.length));
    if (avg20 > 0) {
      relativeVolume = recent3 / avg20;
    }
  }

  return {
    timeframe,
    candleCount: candles.length,
    trend,
    ma7: ma7Series.length > 0 ? ma7Series[ma7Series.length - 1].value : null,
    ma25: ma25Series.length > 0 ? ma25Series[ma25Series.length - 1].value : null,
    ma99: ma99Series.length > 0 ? ma99Series[ma99Series.length - 1].value : null,
    rsi14,
    relativeVolume,
  };
}

export function computeTechnicalAnalysis(
  activeTimeframe: Timeframe,
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>,
  ticker: Ticker24h | null,
  orderBook: OrderBookData | null,
  referenceTimeMs?: number
): TechnicalAnalysis | null {
  const candles = candlesByTimeframe[activeTimeframe] ?? [];
  if (candles.length === 0) return null;

  const closes = candles.map((c) => c.close);
  const currentPrice =
    ticker?.price !== null && ticker?.price !== undefined && ticker.price > 0
      ? ticker.price
      : closes[closes.length - 1];

  // 1. Moving Averages (strictly null if insufficient candles)
  const ma7Series = calculateSMASeries(candles, 7);
  const ma25Series = calculateSMASeries(candles, 25);
  const ma99Series = calculateSMASeries(candles, 99);

  const ma7 = ma7Series.length > 0 ? ma7Series[ma7Series.length - 1].value : null;
  const ma25 = ma25Series.length > 0 ? ma25Series[ma25Series.length - 1].value : null;
  const ma99 = ma99Series.length > 0 ? ma99Series[ma99Series.length - 1].value : null;

  // 2. Volatility (ATR 14)
  const atr14 = calculateATR(candles, 14);
  const volatilityPct =
    atr14 !== null && currentPrice > 0 ? (atr14 / currentPrice) * 100 : null;

  let volatilityRating: VolatilityRating | null = null;
  if (volatilityPct !== null) {
    // Scale expected per-candle volatility by sqrt(timeframe / 15m)
    const scale = Math.sqrt(TIMEFRAME_MINUTES[activeTimeframe] / 15);
    const lowCut = 0.1 * scale;
    const highCut = 0.35 * scale;
    if (volatilityPct >= highCut) volatilityRating = 'Alta';
    else if (volatilityPct >= lowCut) volatilityRating = 'Moderada';
    else volatilityRating = 'Baja';
  }

  // 3. Trend
  const { trend, detail: trendDetail } = classifyTrend(
    currentPrice,
    ma7Series,
    ma25Series,
    ma99Series,
    atr14
  );

  // 4. Previous Day Context (computed from available multi-timeframe history)
  const previousDay = computePreviousDay(
    candlesByTimeframe,
    activeTimeframe,
    currentPrice,
    referenceTimeMs
  );

  // 5. Supports & Resistances
  const { supports, resistances } = detectSupportsAndResistances(
    candles,
    currentPrice,
    atr14,
    previousDay
  );

  // 6. Volume & Relative Volume
  const volumeCurrent = candles[candles.length - 1]?.volume ?? null;
  const volumeLastClosed = candles.length >= 2 ? candles[candles.length - 2].volume : null;
  let volumeAvg20: number | null = null;
  let relativeVolume: number | null = null;
  let volumeRating: VolumeRating | null = null;

  if (candles.length >= 21) {
    const completed = candles.slice(0, -1);
    const slice20 = completed.slice(-20);
    const avg20 = slice20.reduce((sum, c) => sum + c.volume, 0) / slice20.length;
    volumeAvg20 = avg20;

    if (avg20 > 0) {
      const recent3 = completed.slice(-3);
      const avg3 = recent3.reduce((sum, c) => sum + c.volume, 0) / recent3.length;
      relativeVolume = avg3 / avg20;

      if (relativeVolume >= 1.3) volumeRating = 'Alto';
      else if (relativeVolume < 0.72) volumeRating = 'Bajo';
      else volumeRating = 'Normal';
    }
  }

  // Order book imbalance (null if order book absent)
  let bidPressurePct: number | null = null;
  if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
    const topBids = orderBook.bids.slice(0, 15).reduce((s, l) => s + l.quantity, 0);
    const topAsks = orderBook.asks.slice(0, 15).reduce((s, l) => s + l.quantity, 0);
    const totalDepth = topBids + topAsks;
    if (totalDepth > 0) {
      bidPressurePct = (topBids / totalDepth) * 100;
    }
  }

  // Spread % (null if live bid/ask absent)
  const bid = ticker?.bidPrice ?? orderBook?.bids[0]?.price ?? null;
  const ask = ticker?.askPrice ?? orderBook?.asks[0]?.price ?? null;
  const spreadPct =
    bid !== null && ask !== null && bid > 0 && ask >= bid
      ? ((ask - bid) / ask) * 100
      : null;

  // 7. Momentum (RSI 14 + ROC 10)
  const rsi14 = calculateRSI(closes, 14);
  const roc10 = calculateROC(closes, 10);
  let momentumState: MomentumState | null = null;
  if (rsi14 !== null) {
    if (rsi14 >= 62 && (roc10 === null || roc10 > 0)) momentumState = 'Alcista fuerte';
    else if (rsi14 >= 53 && (roc10 === null || roc10 >= 0)) momentumState = 'Alcista';
    else if (rsi14 <= 38 && (roc10 === null || roc10 < 0)) momentumState = 'Bajista fuerte';
    else if (rsi14 <= 47 && (roc10 === null || roc10 <= 0)) momentumState = 'Bajista';
    else momentumState = 'Neutral';
  }

  // 8. Candle Structure
  const candleStructure = analyzeCandleStructure(candles);

  // 9. Multi-timeframe summary (5M, 15M, 1H, 4H)
  const orderedTimeframes: Timeframe[] = ['5m', '15m', '1h', '4h'];
  const multiTimeframe = orderedTimeframes.map((tf) =>
    buildTimeframeSnapshot(tf, candlesByTimeframe[tf])
  );

  return {
    ma7,
    ma25,
    ma99,
    ma7Series,
    ma25Series,
    ma99Series,
    trend,
    trendDetail,
    supports,
    resistances,
    volumeCurrent,
    volumeLastClosed,
    volumeAvg20,
    relativeVolume,
    volumeRating,
    bidPressurePct,
    atr14,
    volatilityPct,
    volatilityRating,
    rsi14,
    roc10,
    momentumState,
    candleStructure,
    previousDay,
    multiTimeframe,
    spreadPct,
    candlesAnalyzed: candles.length,
  };
}
