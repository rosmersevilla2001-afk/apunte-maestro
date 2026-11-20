import { MARKET_MAP, NO_DATA_LABEL, formatPrice } from '../../config/markets';
import type {
  DecisionCheck,
  DecisionState,
  MarketDecision,
  MarketOpportunity,
  TechnicalEntryZone,
} from '../../types/market';

const MIN_OPPORTUNITY_SCORE_FOR_BUY = 68;
const MIN_R1_DISTANCE_PCT_FOR_BUY = 0.3;
const MIN_RR_FOR_BUY = 1.25;
const MAX_BAND_POSITION_FOR_BUY = 0.72;
const MIN_NET_POTENTIAL_PCT_FOR_BUY = 0.2;
const MAX_SPREAD_PCT_FOR_BUY = 0.18;
const MAX_SPREAD_PCT_NO_TRADE = 0.3;
const MIN_DEPTH_USDT_FOR_BUY = 10_000;
const MIN_DEPTH_USDT_NO_TRADE = 3_000;
const MIN_REL_VOL_FOR_BUY = 0.85;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function evaluateMarketDecision(
  opp: MarketOpportunity,
  isBinanceLive: boolean
): MarketDecision {
  const market = MARKET_MAP[opp.marketId];
  const checks: DecisionCheck[] = [];
  const blockingConditions: string[] = [];
  const activationReasons: string[] = [];

  // Hard invalid / offline gate -> immediate NO TRADE
  if (!isBinanceLive || !opp.isValid || opp.score === null || opp.price === null) {
    const reason = !isBinanceLive
      ? 'Binance desconectado: no se permite evaluar ni activar BUY sin datos en vivo.'
      : (opp.invalidReason ?? 'Datos incompletos o desactualizados de Binance.');

    const offlineChecks: DecisionCheck[] = [
      { id: 'score', label: 'Opportunity Score', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'trend', label: 'Tendencia 4H/1H/15M', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'sr', label: 'Distancia S1 / R1', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'momentum', label: 'RSI + ROC', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'volume', label: 'Volumen relativo', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'liquidity', label: 'Spread y liquidez', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'volatility', label: 'ATR y volatilidad', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'prev_day', label: 'Día anterior', status: 'no_data', detail: NO_DATA_LABEL },
      { id: 'net_pot', label: 'Potencial neto', status: 'no_data', detail: NO_DATA_LABEL },
    ];

    return {
      marketId: opp.marketId,
      state: 'NO TRADE',
      opportunityScore: opp.score,
      confidence: null,
      price: opp.price,
      entryZone: null,
      s1: opp.support,
      r1: opp.resistance,
      netPotentialAfterFeesPct: opp.netPotentialAfterFeesPct,
      primaryRisk: reason,
      activationReasons: [],
      blockingConditions: [reason],
      checks: offlineChecks,
      passedCount: 0,
      totalChecks: 9,
      updatedAt: opp.updatedAt,
    };
  }

  let hasHardNoTrade = false;
  let hasContradictionOrWait = false;

  // ---------------------------------------------------------------------------
  // 1. Opportunity Score (required baseline, NEVER sufficient alone)
  // ---------------------------------------------------------------------------
  if (opp.score >= MIN_OPPORTUNITY_SCORE_FOR_BUY) {
    checks.push({
      id: 'score',
      label: 'Opportunity Score',
      status: 'pass',
      detail: `${opp.score}/100 (≥ ${MIN_OPPORTUNITY_SCORE_FOR_BUY})`,
    });
    activationReasons.push(`Opportunity Score sólido de ${opp.score}/100 respaldado por confluencia.`);
  } else if (opp.score >= 52) {
    hasContradictionOrWait = true;
    checks.push({
      id: 'score',
      label: 'Opportunity Score',
      status: 'warn',
      detail: `${opp.score}/100 (< ${MIN_OPPORTUNITY_SCORE_FOR_BUY})`,
    });
    blockingConditions.push(
      `Opportunity Score (${opp.score}/100) por debajo del umbral de confluencia (${MIN_OPPORTUNITY_SCORE_FOR_BUY}/100).`
    );
  } else {
    hasHardNoTrade = true;
    checks.push({
      id: 'score',
      label: 'Opportunity Score',
      status: 'block',
      detail: `${opp.score}/100 (débil)`,
    });
    blockingConditions.push(
      `Opportunity Score bajo (${opp.score}/100): condiciones globales desfavorables.`
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Tendencia 4H + 1H + 15M
  // ---------------------------------------------------------------------------
  const t4 = opp.trend4h!;
  const t1 = opp.trend1h!;
  const t15 = opp.trend15m!;
  const trendStr = `${t4} / ${t1} / ${t15}`;

  if (t4 === 'Bajista' && t1 === 'Bajista') {
    hasHardNoTrade = true;
    checks.push({
      id: 'trend',
      label: 'Tendencia 4H/1H/15M',
      status: 'block',
      detail: trendStr,
    });
    blockingConditions.push(
      `Estructura bajista dominante en 4H y 1H (${trendStr}): riesgo estructural en contra.`
    );
  } else if (
    (t4 === 'Alcista' && t1 === 'Alcista' && t15 !== 'Bajista') ||
    (t4 !== 'Bajista' && t1 === 'Alcista' && t15 === 'Alcista')
  ) {
    checks.push({
      id: 'trend',
      label: 'Tendencia 4H/1H/15M',
      status: 'pass',
      detail: trendStr,
    });
    activationReasons.push(`Confluencia de tendencia favorable en 4H/1H/15M (${trendStr}).`);
  } else {
    hasContradictionOrWait = true;
    checks.push({
      id: 'trend',
      label: 'Tendencia 4H/1H/15M',
      status: 'warn',
      detail: trendStr,
    });
    blockingConditions.push(
      `Tendencia contradictoria o lateral entre temporalidades (${trendStr}).`
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Distancia al soporte S1 y resistencia R1
  // ---------------------------------------------------------------------------
  let rrRatio: number | null = null;
  let bandPosition: number | null = null;

  if (!opp.support || !opp.resistance) {
    hasContradictionOrWait = true;
    const missingSr = !opp.support && !opp.resistance
      ? 'S1 y R1'
      : !opp.support
        ? 'soporte S1'
        : 'resistencia R1';
    checks.push({
      id: 'sr',
      label: 'Distancia S1 / R1',
      status: !opp.support ? 'block' : 'warn',
      detail: `Sin ${missingSr}`,
    });
    if (!opp.support) hasHardNoTrade = true;
    blockingConditions.push(
      `Falta referencia estructural (${missingSr}) para validar riesgo y recorrido.`
    );
  } else {
    const sDist = opp.support.distancePct;
    const rDist = opp.resistance.distancePct;
    rrRatio = rDist / Math.max(sDist, 0.05);
    const totalBand = sDist + rDist;
    bandPosition = totalBand > 0 ? sDist / totalBand : 0.5;

    if (rDist < MIN_R1_DISTANCE_PCT_FOR_BUY) {
      hasContradictionOrWait = true;
      if (rDist < 0.12 && rrRatio < 0.5) hasHardNoTrade = true;
      checks.push({
        id: 'sr',
        label: 'Distancia S1 / R1',
        status: rDist < 0.12 && rrRatio < 0.5 ? 'block' : 'warn',
        detail: `R1 a +${rDist.toFixed(2)}% (muy cerca)`,
      });
      blockingConditions.push(
        `Precio demasiado cerca de resistencia R1 (${formatPrice(opp.resistance.price, market.priceDecimals)}, +${rDist.toFixed(2)}%; mínimo +${MIN_R1_DISTANCE_PCT_FOR_BUY.toFixed(2)}%).`
      );
    } else if (rrRatio < MIN_RR_FOR_BUY || bandPosition > MAX_BAND_POSITION_FOR_BUY) {
      hasContradictionOrWait = true;
      checks.push({
        id: 'sr',
        label: 'Distancia S1 / R1',
        status: 'warn',
        detail: `R/B ${rrRatio.toFixed(2)}x · R1 +${rDist.toFixed(2)}%`,
      });
      blockingConditions.push(
        `Ubicación técnica desfavorable entre S1 (-${sDist.toFixed(2)}%) y R1 (+${rDist.toFixed(2)}%, R/B ${rrRatio.toFixed(2)}x < ${MIN_RR_FOR_BUY.toFixed(2)}x).`
      );
    } else {
      checks.push({
        id: 'sr',
        label: 'Distancia S1 / R1',
        status: 'pass',
        detail: `S1 -${sDist.toFixed(2)}% · R1 +${rDist.toFixed(2)}% (R/B ${rrRatio.toFixed(2)}x)`,
      });
      activationReasons.push(
        `Buena ubicación respecto a S1 (-${sDist.toFixed(2)}%) con recorrido libre hacia R1 (+${rDist.toFixed(2)}%, R/B ${rrRatio.toFixed(2)}x).`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 4. RSI + ROC (High RSI alone NEVER generates BUY; overbought blocks BUY)
  // ---------------------------------------------------------------------------
  const rsi = opp.rsi14!;
  const roc = opp.roc10!;

  if (rsi >= 68) {
    hasContradictionOrWait = true;
    checks.push({
      id: 'momentum',
      label: 'RSI + ROC',
      status: 'warn',
      detail: `RSI ${rsi.toFixed(1)} (sobrecompra)`,
    });
    blockingConditions.push(
      `RSI(14) elevado en ${rsi.toFixed(1)} (≥ 68): sobrecompra impide BUY; esperar retroceso.`
    );
  } else if (rsi < 40 && roc < 0) {
    hasContradictionOrWait = true;
    checks.push({
      id: 'momentum',
      label: 'RSI + ROC',
      status: 'block',
      detail: `RSI ${rsi.toFixed(1)} · ROC ${roc.toFixed(2)}%`,
    });
    blockingConditions.push(
      `Momentum bajista activo (RSI ${rsi.toFixed(1)}, ROC ${roc.toFixed(2)}%).`
    );
  } else if ((rsi >= 42 && rsi <= 66 && roc >= 0) || (rsi >= 38 && rsi < 45 && roc >= -0.05)) {
    checks.push({
      id: 'momentum',
      label: 'RSI + ROC',
      status: 'pass',
      detail: `RSI ${rsi.toFixed(1)} · ROC ${roc >= 0 ? '+' : ''}${roc.toFixed(2)}%`,
    });
    activationReasons.push(
      `Momentum constructivo sin sobrecompra (RSI ${rsi.toFixed(1)}, ROC ${roc >= 0 ? '+' : ''}${roc.toFixed(2)}%).`
    );
  } else {
    hasContradictionOrWait = true;
    checks.push({
      id: 'momentum',
      label: 'RSI + ROC',
      status: 'warn',
      detail: `RSI ${rsi.toFixed(1)} · ROC ${roc >= 0 ? '+' : ''}${roc.toFixed(2)}%`,
    });
    blockingConditions.push(
      `Momentum sin confirmación alcista clara (RSI ${rsi.toFixed(1)}, ROC ${roc.toFixed(2)}%).`
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Volumen relativo
  // ---------------------------------------------------------------------------
  const relVol = opp.relativeVolume!;

  if (relVol >= MIN_REL_VOL_FOR_BUY) {
    checks.push({
      id: 'volume',
      label: 'Volumen relativo',
      status: 'pass',
      detail: `${relVol.toFixed(2)}x (${opp.volumeRating ?? 'Activo'})`,
    });
    activationReasons.push(`Volumen relativo saludable (${relVol.toFixed(2)}x sobre media de 20 velas).`);
  } else if (relVol >= 0.6) {
    hasContradictionOrWait = true;
    checks.push({
      id: 'volume',
      label: 'Volumen relativo',
      status: 'warn',
      detail: `${relVol.toFixed(2)}x (< ${MIN_REL_VOL_FOR_BUY}x)`,
    });
    blockingConditions.push(
      `Volumen relativo insuficiente (${relVol.toFixed(2)}x; mínimo requerido ${MIN_REL_VOL_FOR_BUY}x).`
    );
  } else {
    hasHardNoTrade = true;
    checks.push({
      id: 'volume',
      label: 'Volumen relativo',
      status: 'block',
      detail: `${relVol.toFixed(2)}x (muy bajo)`,
    });
    blockingConditions.push(
      `Volumen relativo extremadamente bajo (${relVol.toFixed(2)}x): poca participación del mercado.`
    );
  }

  // ---------------------------------------------------------------------------
  // 6. Spread y liquidez
  // ---------------------------------------------------------------------------
  const spPct = opp.spreadPct!;
  const depth = opp.orderBookDepthUsdt!;
  const bidPct = opp.bidPressurePct;

  if (spPct > MAX_SPREAD_PCT_NO_TRADE || depth < MIN_DEPTH_USDT_NO_TRADE) {
    hasHardNoTrade = true;
    checks.push({
      id: 'liquidity',
      label: 'Spread y liquidez',
      status: 'block',
      detail: `Spread ${spPct.toFixed(3)}% · Libro ${Math.round(depth).toLocaleString('en-US')} USDT`,
    });
    blockingConditions.push(
      spPct > MAX_SPREAD_PCT_NO_TRADE
        ? `Spread excesivo (${spPct.toFixed(3)}% > ${MAX_SPREAD_PCT_NO_TRADE}%): alto costo operativo.`
        : `Falta de liquidez en el libro (${Math.round(depth).toLocaleString('en-US')} USDT < ${MIN_DEPTH_USDT_NO_TRADE.toLocaleString('en-US')} USDT).`
    );
  } else if (
    spPct <= MAX_SPREAD_PCT_FOR_BUY &&
    depth >= MIN_DEPTH_USDT_FOR_BUY &&
    (bidPct === null || bidPct >= 45)
  ) {
    checks.push({
      id: 'liquidity',
      label: 'Spread y liquidez',
      status: 'pass',
      detail: `Spread ${spPct.toFixed(3)}% · Bids ${bidPct !== null ? `${bidPct.toFixed(0)}%` : NO_DATA_LABEL}`,
    });
    activationReasons.push(
      `Liquidez sólida y spread ajustado (${spPct.toFixed(3)}%) con soporte comprador en el libro.`
    );
  } else {
    hasContradictionOrWait = true;
    checks.push({
      id: 'liquidity',
      label: 'Spread y liquidez',
      status: 'warn',
      detail: `Spread ${spPct.toFixed(3)}% · Bids ${bidPct !== null ? `${bidPct.toFixed(0)}%` : NO_DATA_LABEL}`,
    });
    blockingConditions.push(
      bidPct !== null && bidPct < 45
        ? `Presión vendedora elevada en el libro de órdenes (Bids ${bidPct.toFixed(0)}%).`
        : `Spread (${spPct.toFixed(3)}%) o profundidad (${Math.round(depth).toLocaleString('en-US')} USDT) fuera del rango óptimo.`
    );
  }

  // ---------------------------------------------------------------------------
  // 7. ATR y volatilidad
  // ---------------------------------------------------------------------------
  const volPct = opp.volatilityPct!;
  const frictionPct = opp.totalFeesPct + spPct;
  const clearsCosts = volPct * 3 >= frictionPct;

  if (opp.volatilityRating === 'Moderada' && clearsCosts) {
    checks.push({
      id: 'volatility',
      label: 'ATR y volatilidad',
      status: 'pass',
      detail: `Moderada (${volPct.toFixed(3)}%)`,
    });
  } else if (opp.volatilityRating === 'Alta' && volPct > 0.75) {
    hasHardNoTrade = true;
    checks.push({
      id: 'volatility',
      label: 'ATR y volatilidad',
      status: 'block',
      detail: `Alta (${volPct.toFixed(3)}%)`,
    });
    blockingConditions.push(
      `Volatilidad ATR excesiva (${volPct.toFixed(3)}%): alto riesgo estructural de barridos.`
    );
  } else if (!clearsCosts || opp.volatilityRating === 'Baja') {
    hasContradictionOrWait = true;
    checks.push({
      id: 'volatility',
      label: 'ATR y volatilidad',
      status: 'warn',
      detail: `${opp.volatilityRating ?? 'Baja'} (${volPct.toFixed(3)}%)`,
    });
    blockingConditions.push(
      `Volatilidad ATR (${volPct.toFixed(3)}%) estrecha frente a comisiones + spread (${frictionPct.toFixed(2)}%).`
    );
  } else {
    hasContradictionOrWait = true;
    checks.push({
      id: 'volatility',
      label: 'ATR y volatilidad',
      status: 'warn',
      detail: `Alta (${volPct.toFixed(3)}%)`,
    });
    blockingConditions.push(
      `Volatilidad elevada (ATR ${volPct.toFixed(3)}%): conviene esperar estabilización.`
    );
  }

  // ---------------------------------------------------------------------------
  // 8. Contexto del día anterior
  // ---------------------------------------------------------------------------
  const pd = opp.previousDay!;

  if (pd.positionLabel === 'Bajo mín. día ant.') {
    if (pd.changePct < -0.4 || t1 === 'Bajista') {
      hasHardNoTrade = true;
    } else {
      hasContradictionOrWait = true;
    }
    checks.push({
      id: 'prev_day',
      label: 'Día anterior',
      status: pd.changePct < -0.4 || t1 === 'Bajista' ? 'block' : 'warn',
      detail: `Bajo mín. (${formatPrice(pd.low, market.priceDecimals)})`,
    });
    blockingConditions.push(
      `Precio por debajo del mínimo del día anterior (${formatPrice(pd.low, market.priceDecimals)}).`
    );
  } else {
    checks.push({
      id: 'prev_day',
      label: 'Día anterior',
      status: 'pass',
      detail: `${pd.positionLabel} (${pd.changePct >= 0 ? '+' : ''}${pd.changePct.toFixed(2)}%)`,
    });
  }

  // ---------------------------------------------------------------------------
  // 9. Potencial técnico neto después de comisión y spread
  // ---------------------------------------------------------------------------
  const netPot = opp.netPotentialAfterFeesPct;

  if (netPot === null) {
    hasContradictionOrWait = true;
    checks.push({
      id: 'net_pot',
      label: 'Potencial neto',
      status: 'warn',
      detail: NO_DATA_LABEL,
    });
    blockingConditions.push(
      'Sin resistencia R1 definida para cuantificar el potencial técnico neto tras comisiones y spread.'
    );
  } else if (netPot < MIN_NET_POTENTIAL_PCT_FOR_BUY) {
    if (netPot <= 0 && (t1 === 'Bajista' || rsi >= 70)) {
      hasHardNoTrade = true;
    } else {
      hasContradictionOrWait = true;
    }
    checks.push({
      id: 'net_pot',
      label: 'Potencial neto',
      status: netPot <= 0 ? 'block' : 'warn',
      detail: `${netPot >= 0 ? '+' : ''}${netPot.toFixed(2)}% (< +${MIN_NET_POTENTIAL_PCT_FOR_BUY.toFixed(2)}%)`,
    });
    blockingConditions.push(
      `Potencial neto estimado tras comisiones (${opp.totalFeesPct.toFixed(2)}%) y spread (${spPct.toFixed(3)}%) insuficiente: ${netPot >= 0 ? '+' : ''}${netPot.toFixed(2)}% (mínimo +${MIN_NET_POTENTIAL_PCT_FOR_BUY.toFixed(2)}%).`
    );
  } else {
    checks.push({
      id: 'net_pot',
      label: 'Potencial neto',
      status: 'pass',
      detail: `+${netPot.toFixed(2)}% estimado`,
    });
    activationReasons.push(
      `Potencial técnico neto estimado de +${netPot.toFixed(2)}% hasta R1 tras comisiones y spread.`
    );
  }

  // ---------------------------------------------------------------------------
  // Final State Resolution (strictly audited & independent of raw score)
  // ---------------------------------------------------------------------------
  const passedCount = checks.filter((c) => c.status === 'pass').length;
  const allPassed = passedCount === checks.length;

  let state: DecisionState = 'WAIT';
  if (hasHardNoTrade) {
    state = 'NO TRADE';
  } else if (allPassed && !hasContradictionOrWait) {
    state = 'BUY';
  } else {
    state = 'WAIT';
  }

  // Technical Entry Zone (strictly bounded between real S1 and current price using real ATR)
  let entryZone: TechnicalEntryZone | null = null;
  if (state === 'BUY' && opp.support && opp.atr14 !== null) {
    const buffer = Math.min(opp.atr14 * 0.35, (opp.price - opp.support.price) * 0.45);
    const low = Math.max(opp.support.price, opp.price - Math.max(buffer, 0));
    const high = opp.price;
    entryZone = { low: Math.min(low, high), high };
  }

  // Confidence level 0–100 (only computed when BUY confluence is active)
  let confidence: number | null = null;
  if (state === 'BUY' && netPot !== null) {
    const scoreBase = opp.score * 0.65; // up to 65
    const rrBonus = rrRatio !== null ? clamp((rrRatio - 1.25) * 8, 0, 12) : 0;
    const netBonus = clamp((netPot - 0.2) * 15, 0, 10);
    const fullTrendBonus = t4 === 'Alcista' && t1 === 'Alcista' && t15 === 'Alcista' ? 8 : 4;
    const spreadBonus = spPct <= 0.05 ? 5 : 2;
    confidence = Math.round(
      clamp(scoreBase + rrBonus + netBonus + fullTrendBonus + spreadBonus, 55, 96)
    );
  }

  const primaryRisk =
    opp.risks[0] ??
    'Riesgo de mercado Spot: pérdida del soporte S1 o cambio súbito de volumen y liquidez.';

  return {
    marketId: opp.marketId,
    state,
    opportunityScore: opp.score,
    confidence,
    price: opp.price,
    entryZone,
    s1: opp.support,
    r1: opp.resistance,
    netPotentialAfterFeesPct: opp.netPotentialAfterFeesPct,
    primaryRisk,
    activationReasons: state === 'BUY' ? activationReasons.slice(0, 4) : [],
    blockingConditions: state === 'BUY' ? [] : blockingConditions,
    checks,
    passedCount,
    totalChecks: checks.length,
    updatedAt: opp.updatedAt,
  };
}
