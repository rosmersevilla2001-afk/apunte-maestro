import { MARKET_MAP, formatPrice } from '../../config/markets';
import type {
  Candle,
  FeeConfig,
  MarketId,
  MarketOpportunity,
  OpportunityScoreBreakdown,
  OrderBookData,
  Ticker24h,
  Timeframe,
  TrendDirection,
} from '../../types/market';
import { computeTechnicalAnalysis } from './technicalAnalysis';

export interface MarketEvaluationInput {
  marketId: MarketId;
  ticker: Ticker24h | null;
  orderBook: OrderBookData | null;
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  lastUpdatedAt: number | null;
}

const STALE_DATA_THRESHOLD_MS = 120_000; // 2 minutes without fresh Binance data -> invalid

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function trendLabelSummary(
  t4h: TrendDirection | null,
  t1h: TrendDirection | null,
  t15m: TrendDirection | null
): string | null {
  if (!t4h && !t1h && !t15m) return null;
  if (t4h === 'Alcista' && t1h === 'Alcista' && t15m === 'Alcista') {
    return 'Alcista alineada (4H/1H/15M)';
  }
  if (t4h === 'Bajista' && t1h === 'Bajista' && t15m === 'Bajista') {
    return 'Bajista alineada (4H/1H/15M)';
  }
  const bullCount = [t4h, t1h, t15m].filter((t) => t === 'Alcista').length;
  const bearCount = [t4h, t1h, t15m].filter((t) => t === 'Bajista').length;
  if (bullCount >= 2) return 'Sesgo alcista (mayoría TF)';
  if (bearCount >= 2) return 'Sesgo bajista (mayoría TF)';
  return 'Mixta / Lateral';
}

export function evaluateMarketOpportunity(
  input: MarketEvaluationInput,
  feeConfig: FeeConfig,
  isBinanceLive: boolean,
  nowMs: number = Date.now()
): MarketOpportunity {
  const { marketId, ticker, orderBook, candlesByTimeframe, lastUpdatedAt } = input;
  const market = MARKET_MAP[marketId];
  const buyFee = Math.max(0, Number.isFinite(feeConfig.buyFeePct) ? feeConfig.buyFeePct : 0.1);
  const sellFee = Math.max(0, Number.isFinite(feeConfig.sellFeePct) ? feeConfig.sellFeePct : 0.1);
  const totalFeesPct = round1((buyFee + sellFee) * 100) / 100;

  // Compute real technical analyses on 15M (execution timeframe), 1H, and 4H using existing engine
  const analysis15m = computeTechnicalAnalysis('15m', candlesByTimeframe, ticker, orderBook, nowMs);
  const analysis1h = computeTechnicalAnalysis('1h', candlesByTimeframe, ticker, orderBook, nowMs);
  const analysis4h = computeTechnicalAnalysis('4h', candlesByTimeframe, ticker, orderBook, nowMs);

  const price = ticker?.price ?? null;
  const bestBid = orderBook?.bids[0]?.price ?? ticker?.bidPrice ?? null;
  const bestAsk = orderBook?.asks[0]?.price ?? ticker?.askPrice ?? null;
  const spreadAbs =
    bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? bestAsk - bestBid : null;
  const spreadPct =
    spreadAbs !== null && bestAsk !== null && bestAsk > 0 ? (spreadAbs / bestAsk) * 100 : null;

  let orderBookDepthUsdt: number | null = null;
  if (orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0) {
    const bidsSum = orderBook.bids.slice(0, 15).reduce((s, l) => s + l.quantity, 0);
    const asksSum = orderBook.asks.slice(0, 15).reduce((s, l) => s + l.quantity, 0);
    orderBookDepthUsdt = bidsSum + asksSum;
  }

  const trend4h = analysis4h?.trend ?? null;
  const trend1h = analysis1h?.trend ?? null;
  const trend15m = analysis15m?.trend ?? null;
  const trendSummary = trendLabelSummary(trend4h, trend1h, trend15m);

  // Relevant Support & Resistance (prefer 15M structural levels, fallback to 1H if 15M lacks one)
  const support = analysis15m?.supports[0] ?? analysis1h?.supports[0] ?? null;
  const resistance = analysis15m?.resistances[0] ?? analysis1h?.resistances[0] ?? null;

  const rsi14 = analysis15m?.rsi14 ?? null;
  const roc10 = analysis15m?.roc10 ?? null;
  const momentumState = analysis15m?.momentumState ?? null;
  const volumeRating = analysis15m?.volumeRating ?? null;
  const relativeVolume = analysis15m?.relativeVolume ?? null;
  const bidPressurePct = analysis15m?.bidPressurePct ?? null;
  const atr14 = analysis15m?.atr14 ?? null;
  const volatilityPct = analysis15m?.volatilityPct ?? null;
  const volatilityRating = analysis15m?.volatilityRating ?? null;
  const previousDay = analysis15m?.previousDay ?? analysis1h?.previousDay ?? null;

  // Estimated gross & post-fee potential to nearest real resistance R1
  let grossPotentialPct: number | null = null;
  let netPotentialAfterFeesPct: number | null = null;
  if (price !== null && price > 0 && resistance !== null && resistance.price > price) {
    grossPotentialPct = ((resistance.price - price) / price) * 100;
    const effectiveSpread = spreadPct ?? 0;
    netPotentialAfterFeesPct = grossPotentialPct - totalFeesPct - effectiveSpread;
  }

  const baseResult: MarketOpportunity = {
    marketId,
    rank: null,
    isValid: false,
    invalidReason: null,
    score: null,
    breakdown: null,
    price,
    trend4h,
    trend1h,
    trend15m,
    trendSummary,
    support,
    resistance,
    momentumState,
    rsi14,
    roc10,
    volumeRating,
    relativeVolume,
    spreadAbs,
    spreadPct,
    bidPressurePct,
    orderBookDepthUsdt,
    volatilityRating,
    atr14,
    volatilityPct,
    previousDay,
    grossPotentialPct,
    totalFeesPct,
    netPotentialAfterFeesPct,
    reasonsFor: [],
    risks: [],
    updatedAt: lastUpdatedAt,
  };

  // Strict validity checks: never score offline, stale, or incomplete real data
  if (!isBinanceLive) {
    return {
      ...baseResult,
      invalidReason: 'Binance sin conexión: evaluación suspendida hasta recuperar datos en vivo.',
    };
  }

  if (lastUpdatedAt === null || nowMs - lastUpdatedAt > STALE_DATA_THRESHOLD_MS) {
    return {
      ...baseResult,
      invalidReason: 'Datos desactualizados: sin confirmación reciente de Binance.',
    };
  }

  const missingParts: string[] = [];
  if (price === null) missingParts.push('precio');
  if (spreadPct === null || orderBookDepthUsdt === null) missingParts.push('libro/spread');
  if (trend4h === null || trend1h === null || trend15m === null) {
    missingParts.push('tendencia 4H/1H/15M');
  }
  if (rsi14 === null || roc10 === null) missingParts.push('momentum');
  if (relativeVolume === null) missingParts.push('volumen');
  if (atr14 === null || volatilityPct === null) missingParts.push('volatilidad ATR');
  if (previousDay === null) missingParts.push('día anterior');

  if (missingParts.length > 0) {
    return {
      ...baseResult,
      invalidReason: `Faltan datos reales de Binance (${missingParts.join(', ')}).`,
    };
  }

  const reasonsFor: string[] = [];
  const risks: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. Tendencia 4H / 1H / 15M (max 20 pts)
  // ---------------------------------------------------------------------------
  const scoreTf = (t: TrendDirection, maxPts: number): number => {
    if (t === 'Alcista') return maxPts;
    if (t === 'Lateral') return maxPts * 0.5;
    return maxPts * 0.1;
  };
  const trendScore = round1(
    scoreTf(trend4h!, 8) + scoreTf(trend1h!, 7) + scoreTf(trend15m!, 5)
  );

  if (trend4h === 'Alcista' && trend1h === 'Alcista' && trend15m === 'Alcista') {
    reasonsFor.push('Tendencia alcista alineada en 4H, 1H y 15M.');
  } else if (trend4h === 'Alcista' && trend1h === 'Alcista') {
    reasonsFor.push('Estructura mayor alcista en 4H y 1H.');
  } else if (trend4h === 'Bajista' && trend1h === 'Bajista') {
    risks.push('Tendencia bajista dominante en 4H y 1H.');
  } else if (trend15m === 'Bajista') {
    risks.push('Debilidad de corto plazo en 15M.');
  } else if (trend4h === 'Lateral' && trend1h === 'Lateral') {
    risks.push('Mercado lateral en 4H y 1H sin dirección clara.');
  }

  // ---------------------------------------------------------------------------
  // 2. Ubicación respecto a Soportes / Resistencias (max 20 pts)
  // ---------------------------------------------------------------------------
  let srScore = 8; // Neutral base when one side is in price discovery
  if (support && resistance) {
    const rr = resistance.distancePct / Math.max(support.distancePct, 0.05);
    const totalBand = support.distancePct + resistance.distancePct;
    const positionInBand = totalBand > 0 ? support.distancePct / totalBand : 0.5; // 0 = at support, 1 = at resistance

    // Proximity to support (max 10) + Risk/Reward room to resistance (max 10)
    let proximityPts = 5;
    if (positionInBand <= 0.25) proximityPts = 10;
    else if (positionInBand <= 0.42) proximityPts = 8;
    else if (positionInBand <= 0.6) proximityPts = 6;
    else if (positionInBand <= 0.78) proximityPts = 3;
    else proximityPts = 1;

    let rrPts = 5;
    if (rr >= 2.2) rrPts = 10;
    else if (rr >= 1.5) rrPts = 8;
    else if (rr >= 1.0) rrPts = 5.5;
    else if (rr >= 0.6) rrPts = 3;
    else rrPts = 1;

    srScore = round1(clamp(proximityPts + rrPts, 0, 20));

    if (positionInBand <= 0.35 && rr >= 1.5) {
      reasonsFor.push(
        `Precio próximo a soporte S1 (${formatPrice(support.price, market.priceDecimals)}) con recorrido favorable hacia R1 (R/B ${rr.toFixed(2)}x).`
      );
    } else if (resistance.distancePct < 0.22 || positionInBand >= 0.78) {
      risks.push(
        `Precio cercano a resistencia R1 (${formatPrice(resistance.price, market.priceDecimals)}, +${resistance.distancePct.toFixed(2)}%) con poco margen.`
      );
    }
  } else if (support && !resistance) {
    // Breaking above period highs (no resistance overhead in loaded window)
    srScore = support.distancePct <= 0.6 ? 13 : 10;
    risks.push('Cotizando en zona máxima del período sin resistencia superior inmediata.');
  } else if (!support && resistance) {
    srScore = 5;
    risks.push('Sin soporte validado por debajo en el período analizado.');
  }

  // ---------------------------------------------------------------------------
  // 3. Momentum RSI + ROC (max 10 pts)
  // ---------------------------------------------------------------------------
  let momentumScore = 5;
  const rsi = rsi14!;
  const roc = roc10!;

  if (rsi >= 45 && rsi <= 64 && roc > 0) {
    momentumScore = 10;
    reasonsFor.push(`Momentum saludable (RSI ${rsi.toFixed(1)}, ROC +${roc.toFixed(2)}%).`);
  } else if (rsi >= 36 && rsi < 45 && roc >= -0.05) {
    momentumScore = 8;
    reasonsFor.push(`RSI en zona de recuperación (${rsi.toFixed(1)}) sin sobrecompra.`);
  } else if (rsi > 64 && rsi < 70 && roc > 0) {
    momentumScore = 7;
  } else if (rsi >= 70) {
    momentumScore = 3;
    risks.push(`RSI(14) en sobrecompra (${rsi.toFixed(1)}), riesgo de retroceso técnico.`);
  } else if (rsi <= 35 && roc < 0) {
    momentumScore = 3;
    risks.push(`Presión bajista en momentum (RSI ${rsi.toFixed(1)}, ROC ${roc.toFixed(2)}%).`);
  } else if (roc < 0) {
    momentumScore = 4;
  } else {
    momentumScore = 6;
  }
  momentumScore = round1(clamp(momentumScore, 0, 10));

  // ---------------------------------------------------------------------------
  // 4. Volumen (max 10 pts)
  // ---------------------------------------------------------------------------
  const relVol = relativeVolume!;
  const vol24h = ticker?.volumeBase ?? 0;
  let relVolPts = 5;
  if (relVol >= 1.45) relVolPts = 7;
  else if (relVol >= 1.15) relVolPts = 6;
  else if (relVol >= 0.85) relVolPts = 4.5;
  else if (relVol >= 0.6) relVolPts = 3;
  else relVolPts = 1.5;

  let absVolPts = 1.5;
  if (vol24h >= 5_000_000) absVolPts = 3;
  else if (vol24h >= 1_000_000) absVolPts = 2.5;
  else if (vol24h >= 300_000) absVolPts = 2;
  else if (vol24h >= 50_000) absVolPts = 1;
  else absVolPts = 0.5;

  const volumeScore = round1(clamp(relVolPts + absVolPts, 0, 10));

  if (relVol >= 1.3) {
    reasonsFor.push(`Volumen relativo activo (${relVol.toFixed(2)}x sobre media de 20 velas).`);
  } else if (relVol < 0.72) {
    risks.push(`Volumen relativo bajo (${relVol.toFixed(2)}x), menor convicción en el movimiento.`);
  }

  // ---------------------------------------------------------------------------
  // 5. Liquidez + Spread + Order Book (max 15 pts)
  // ---------------------------------------------------------------------------
  const spPct = spreadPct!;
  let spreadPts = 0;
  if (spPct <= 0.04) spreadPts = 7;
  else if (spPct <= 0.1) spreadPts = 5.5;
  else if (spPct <= 0.2) spreadPts = 4;
  else if (spPct <= 0.35) spreadPts = 2;
  else spreadPts = 0;

  const depth = orderBookDepthUsdt!;
  let depthPts = 0;
  if (depth >= 100_000) depthPts = 4;
  else if (depth >= 30_000) depthPts = 3;
  else if (depth >= 10_000) depthPts = 2;
  else if (depth >= 2_500) depthPts = 1;
  else depthPts = 0.5;

  const bidPct = bidPressurePct ?? 50;
  let bookBalancePts = 2.5;
  if (bidPct >= 54 && bidPct <= 75) bookBalancePts = 4;
  else if (bidPct >= 48 && bidPct < 54) bookBalancePts = 3;
  else if (bidPct > 75) bookBalancePts = 3;
  else if (bidPct >= 40) bookBalancePts = 2;
  else bookBalancePts = 1;

  const liquidityScore = round1(clamp(spreadPts + depthPts + bookBalancePts, 0, 15));

  if (spPct <= 0.08 && depth >= 25_000) {
    reasonsFor.push(
      `Spread muy ajustado (${spPct.toFixed(3)}%) con buena profundidad en el libro.`
    );
  } else if (spPct > 0.2) {
    risks.push(`Spread amplio (${spPct.toFixed(3)}%), encarece la entrada y salida Spot.`);
  }
  if (bidPct < 42) {
    risks.push(`Presión vendedora superior en el libro (Bids ${bidPct.toFixed(0)}%).`);
  }

  // ---------------------------------------------------------------------------
  // 6. Volatilidad ATR (max 10 pts)
  // ---------------------------------------------------------------------------
  const volPct = volatilityPct!;
  const costFloor = totalFeesPct + spPct;
  // Ideal 15M ATR provides tradable movement relative to friction without chaotic spikes
  const atrToCost = costFloor > 0 ? (volPct * 3) / costFloor : 2;
  let volatilityScore = 5;

  if (volatilityRating === 'Moderada' && atrToCost >= 1.1) {
    volatilityScore = 9.5;
    reasonsFor.push(
      `Volatilidad ATR(14) moderada (${volPct.toFixed(3)}%), amplitud operativa equilibrada.`
    );
  } else if (volatilityRating === 'Moderada') {
    volatilityScore = 7.5;
  } else if (volatilityRating === 'Alta') {
    volatilityScore = atrToCost >= 1.5 ? 6 : 5;
    risks.push(`Volatilidad elevada (ATR ${volPct.toFixed(3)}%), mayor riesgo de barridos.`);
  } else {
    // Baja
    volatilityScore = atrToCost >= 0.9 ? 5 : 3;
    risks.push(
      `Volatilidad baja (ATR ${volPct.toFixed(3)}%), rango estrecho frente a comisiones.`
    );
  }
  volatilityScore = round1(clamp(volatilityScore, 0, 10));

  // ---------------------------------------------------------------------------
  // 7. Contexto del día anterior (max 10 pts)
  // ---------------------------------------------------------------------------
  const pd = previousDay!;
  let prevDayScore = 5;
  if (pd.positionLabel === 'Sobre máx. día ant.' && pd.changePct >= 0) {
    prevDayScore = 9;
    reasonsFor.push(
      `Precio por encima del máximo del día anterior (${formatPrice(pd.high, market.priceDecimals)}).`
    );
  } else if (pd.positionLabel === 'Dentro rango día ant.' && pd.changePct >= 0) {
    prevDayScore = 8;
    reasonsFor.push(
      `Día anterior positivo (+${pd.changePct.toFixed(2)}%) con precio dentro de rango estructurado.`
    );
  } else if (pd.positionLabel === 'Dentro rango día ant.' && pd.changePct < 0) {
    prevDayScore = 5.5;
  } else if (pd.positionLabel === 'Sobre máx. día ant.') {
    prevDayScore = 7.5;
  } else {
    // Bajo mín. día ant.
    prevDayScore = 2.5;
    risks.push(
      `Cotizando por debajo del mínimo del día anterior (${formatPrice(pd.low, market.priceDecimals)}).`
    );
  }
  prevDayScore = round1(clamp(prevDayScore, 0, 10));

  // ---------------------------------------------------------------------------
  // 8. Potencial estimado después de comisiones (max 5 pts)
  // ---------------------------------------------------------------------------
  let postFeeScore = 0;
  if (netPotentialAfterFeesPct !== null) {
    if (netPotentialAfterFeesPct >= 0.8) postFeeScore = 5;
    else if (netPotentialAfterFeesPct >= 0.45) postFeeScore = 4;
    else if (netPotentialAfterFeesPct >= 0.2) postFeeScore = 3;
    else if (netPotentialAfterFeesPct > 0) postFeeScore = 1.5;
    else postFeeScore = 0;

    if (netPotentialAfterFeesPct >= 0.35) {
      reasonsFor.push(
        `Potencial técnico estimado hasta R1 cubre comisiones (${totalFeesPct.toFixed(2)}%) y spread (+${netPotentialAfterFeesPct.toFixed(2)}% neto estimado).`
      );
    } else if (netPotentialAfterFeesPct <= 0) {
      risks.push(
        `Distancia a resistencia R1 (${grossPotentialPct?.toFixed(2)}%) no supera comisiones (${totalFeesPct.toFixed(2)}%) + spread (${spPct.toFixed(3)}%).`
      );
    }
  } else {
    // No R1 detected overhead -> cannot quantify net potential to resistance
    postFeeScore = 1.5;
    risks.push('Sin resistencia R1 cercana para estimar potencial neto después de comisiones.');
  }
  postFeeScore = round1(clamp(postFeeScore, 0, 5));

  const breakdown: OpportunityScoreBreakdown = {
    trend: trendScore,
    supportResistance: srScore,
    momentum: momentumScore,
    volume: volumeScore,
    liquiditySpreadBook: liquidityScore,
    volatilityAtr: volatilityScore,
    previousDay: prevDayScore,
    postFeePotential: postFeeScore,
  };

  const totalScore = Math.round(
    clamp(
      breakdown.trend +
        breakdown.supportResistance +
        breakdown.momentum +
        breakdown.volume +
        breakdown.liquiditySpreadBook +
        breakdown.volatilityAtr +
        breakdown.previousDay +
        breakdown.postFeePotential,
      0,
      100
    )
  );

  // Ensure at least one factual takeaway if a list happens to be empty
  if (reasonsFor.length === 0) {
    reasonsFor.push(
      `Datos en vivo verificados con spread de ${spPct.toFixed(3)}% y liquidez activa en Binance Spot.`
    );
  }
  if (risks.length === 0) {
    risks.push(
      'Riesgo estándar de mercado Spot: el potencial estimado depende de mantener soporte y volumen.'
    );
  }

  return {
    ...baseResult,
    isValid: true,
    invalidReason: null,
    score: totalScore,
    breakdown,
    reasonsFor: reasonsFor.slice(0, 3),
    risks: risks.slice(0, 3),
  };
}

export function rankMarketOpportunities(
  inputs: MarketEvaluationInput[],
  feeConfig: FeeConfig,
  isBinanceLive: boolean,
  nowMs: number = Date.now()
): MarketOpportunity[] {
  const evaluated = inputs.map((item) =>
    evaluateMarketOpportunity(item, feeConfig, isBinanceLive, nowMs)
  );

  evaluated.sort((a, b) => {
    if (a.isValid && !b.isValid) return -1;
    if (!a.isValid && b.isValid) return 1;
    const scoreDiff = (b.score ?? -1) - (a.score ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    const netDiff = (b.netPotentialAfterFeesPct ?? -999) - (a.netPotentialAfterFeesPct ?? -999);
    if (netDiff !== 0) return netDiff;
    return a.marketId.localeCompare(b.marketId);
  });

  let validRank = 0;
  return evaluated.map((item) => {
    if (item.isValid) {
      validRank += 1;
      return { ...item, rank: validRank };
    }
    return { ...item, rank: null };
  });
}
