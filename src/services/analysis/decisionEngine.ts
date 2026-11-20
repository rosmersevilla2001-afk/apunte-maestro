import { MARKET_MAP, NO_DATA_LABEL, formatPrice } from '../../config/markets';
import type {
  Candle,
  Confirmation5mAnalysis,
  DecisionCheck,
  DecisionState,
  MarketDecision,
  MarketDirectionAnalysis,
  MarketOpportunity,
  TechnicalEntryZone,
} from '../../types/market';
import { computeTechnicalAnalysis } from './technicalAnalysis';

const MIN_OPPORTUNITY_SCORE_FOR_BUY = 68;
const MIN_R1_DISTANCE_PCT_FOR_BUY = 0.3;
const MAX_BAND_POSITION_FOR_BUY = 0.72;
const MIN_NET_POTENTIAL_PCT_FOR_BUY = 0.2;
const MAX_SPREAD_PCT_FOR_BUY = 0.18;
const MAX_SPREAD_PCT_NO_TRADE = 0.3;
const MIN_DEPTH_USDT_FOR_BUY = 10_000;
const MIN_DEPTH_USDT_NO_TRADE = 3_000;
const MIN_REL_VOL_FOR_BUY = 0.85;

const MIN_5M_CANDLES_REQUIRED = 26;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function inspectLastClosedCandle(candle: Candle): {
  direction: 'Alcista' | 'Bajista' | 'Doji';
  pattern: string;
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
} {
  const range = candle.high - candle.low;
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  const bodyPct = range > 0 ? (body / range) * 100 : 0;
  const upperWickPct = range > 0 ? (upperWick / range) * 100 : 0;
  const lowerWickPct = range > 0 ? (lowerWick / range) * 100 : 0;

  let direction: 'Alcista' | 'Bajista' | 'Doji' = 'Doji';
  if (range > 0 && bodyPct > 15) {
    direction = candle.close >= candle.open ? 'Alcista' : 'Bajista';
  }

  let pattern = 'Sin rango de variación';
  if (range > 0) {
    if (bodyPct <= 18) {
      if (lowerWickPct >= 50) pattern = 'Martillo / Rechazo inferior';
      else if (upperWickPct >= 50) pattern = 'Estrella fugaz / Rechazo superior';
      else pattern = 'Doji / Indecisión';
    } else if (lowerWickPct >= 45 && candle.close >= candle.open) {
      pattern = 'Rechazo inferior comprador';
    } else if (upperWickPct >= 45 && candle.close < candle.open) {
      pattern = 'Rechazo superior vendedor';
    } else if (bodyPct >= 62) {
      pattern =
        candle.close >= candle.open
          ? 'Vela alcista de impulso'
          : 'Vela bajista de impulso';
    } else {
      pattern =
        candle.close >= candle.open ? 'Vela alcista moderada' : 'Vela bajista moderada';
    }
  }

  return { direction, pattern, bodyPct, upperWickPct, lowerWickPct };
}

function evaluateFiveMinuteConfirmation(
  candles5m: Candle[] | undefined
): {
  analysis: Confirmation5mAnalysis;
  check: DecisionCheck;
  activationReason: string | null;
  blockingReason: string | null;
  missingData: boolean;
} {
  if (!candles5m || candles5m.length < MIN_5M_CANDLES_REQUIRED) {
    const missingReason =
      'Faltan datos reales de 5M para confirmar el timing de entrada (velas 5M insuficientes).';
    return {
      analysis: {
        status: 'no_data',
        statusLabel: 'Sin datos',
        trend: null,
        rsi14: null,
        roc10: null,
        lastCandleDirection: null,
        lastCandlePattern: null,
        summary: missingReason,
      },
      check: {
        id: 'confirm_5m',
        label: 'Confirmación 5M',
        status: 'no_data',
        detail: NO_DATA_LABEL,
      },
      activationReason: null,
      blockingReason: missingReason,
      missingData: true,
    };
  }

  const closed5m = candles5m.filter((c) => c.isClosed);
  if (closed5m.length < MIN_5M_CANDLES_REQUIRED) {
    const missingReason =
      'Faltan velas cerradas reales de 5M para confirmar el timing de entrada.';
    return {
      analysis: {
        status: 'no_data',
        statusLabel: 'Sin datos',
        trend: null,
        rsi14: null,
        roc10: null,
        lastCandleDirection: null,
        lastCandlePattern: null,
        summary: missingReason,
      },
      check: {
        id: 'confirm_5m',
        label: 'Confirmación 5M',
        status: 'no_data',
        detail: NO_DATA_LABEL,
      },
      activationReason: null,
      blockingReason: missingReason,
      missingData: true,
    };
  }

  const lastClosedCandle = closed5m[closed5m.length - 1];
  // Strictly closed 5M candles ONLY (never using an unclosed forming 5M bar)
  const tech5m = computeTechnicalAnalysis('5m', { '5m': closed5m }, null, null);

  if (
    !lastClosedCandle ||
    !tech5m ||
    tech5m.trend === null ||
    tech5m.rsi14 === null ||
    tech5m.roc10 === null
  ) {
    const missingReason =
      'Faltan indicadores reales en 5M (tendencia, RSI(14), ROC(10) o última vela cerrada).';
    return {
      analysis: {
        status: 'no_data',
        statusLabel: 'Sin datos',
        trend: tech5m?.trend ?? null,
        rsi14: tech5m?.rsi14 ?? null,
        roc10: tech5m?.roc10 ?? null,
        lastCandleDirection: null,
        lastCandlePattern: null,
        summary: missingReason,
      },
      check: {
        id: 'confirm_5m',
        label: 'Confirmación 5M',
        status: 'no_data',
        detail: NO_DATA_LABEL,
      },
      activationReason: null,
      blockingReason: missingReason,
      missingData: true,
    };
  }

  const trend = tech5m.trend;
  const rsi14 = tech5m.rsi14;
  const roc10 = tech5m.roc10;
  const candleInfo = inspectLastClosedCandle(lastClosedCandle);

  const isBearishTrend = trend === 'Bajista';
  const isOverbought = rsi14 >= 68;
  const hasBearishMomentum = roc10 < 0 || rsi14 < 45;
  const hasBearishOrRejectionCandle =
    candleInfo.direction === 'Bajista' ||
    candleInfo.upperWickPct >= 45 ||
    candleInfo.pattern === 'Estrella fugaz / Rechazo superior' ||
    candleInfo.pattern === 'Rechazo superior vendedor';

  const isFavorableCandle =
    (candleInfo.direction === 'Alcista' && candleInfo.upperWickPct < 45) ||
    candleInfo.pattern === 'Martillo / Rechazo inferior';

  const hasConstructiveMomentum = rsi14 >= 48 && rsi14 < 68 && roc10 >= 0;

  // Confirms BUY only if 5M has bullish trend + constructive momentum + favorable closed candle
  if (trend === 'Alcista' && hasConstructiveMomentum && isFavorableCandle) {
    const summary = `5M Alcista · RSI ${rsi14.toFixed(1)} · ROC ${roc10 >= 0 ? '+' : ''}${roc10.toFixed(2)}% · ${candleInfo.pattern}`;
    return {
      analysis: {
        status: 'pass',
        statusLabel: 'Confirmada',
        trend,
        rsi14,
        roc10,
        lastCandleDirection: candleInfo.direction,
        lastCandlePattern: candleInfo.pattern,
        summary,
      },
      check: {
        id: 'confirm_5m',
        label: 'Confirmación 5M',
        status: 'pass',
        detail: `Alcista · RSI ${rsi14.toFixed(1)} · ${candleInfo.direction}`,
      },
      activationReason: `Confirmación 5M favorable (${summary}).`,
      blockingReason: null,
      missingData: false,
    };
  }

  // Otherwise 5M is bearish, overbought, lateral, or contradictory -> WAIT
  const issues: string[] = [];
  if (isBearishTrend) issues.push('tendencia 5M bajista');
  else if (trend === 'Lateral') issues.push('tendencia 5M lateral sin ruptura');
  if (isOverbought) issues.push(`RSI(14) 5M sobrecomprado (${rsi14.toFixed(1)} ≥ 68)`);
  else if (hasBearishMomentum) {
    issues.push(`momentum 5M débil (RSI ${rsi14.toFixed(1)}, ROC ${roc10.toFixed(2)}%)`);
  }
  if (hasBearishOrRejectionCandle) {
    issues.push(`última vela cerrada 5M desfavorable (${candleInfo.pattern})`);
  } else if (!isFavorableCandle) {
    issues.push(`última vela cerrada 5M sin confirmación alcista (${candleInfo.pattern})`);
  }

  const blockingReason = `Confirmación 5M en espera: ${issues.join('; ')}.`;
  return {
    analysis: {
      status: 'warn',
      statusLabel: 'Esperar',
      trend,
      rsi14,
      roc10,
      lastCandleDirection: candleInfo.direction,
      lastCandlePattern: candleInfo.pattern,
      summary: blockingReason,
    },
    check: {
      id: 'confirm_5m',
      label: 'Confirmación 5M',
      status: 'warn',
      detail: `${trend} · RSI ${rsi14.toFixed(1)} · ${candleInfo.direction}`,
    },
    activationReason: null,
    blockingReason,
    missingData: false,
  };
}

export function evaluateMarketDecision(
  opp: MarketOpportunity,
  isBinanceLive: boolean,
  candles5m?: Candle[],
  marketDirection?: MarketDirectionAnalysis | null
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
      { id: 'confirm_5m', label: 'Confirmación 5M', status: 'no_data', detail: NO_DATA_LABEL },
      ...(marketDirection !== undefined
        ? [
            {
              id: 'market_direction',
              label: 'Dirección de Mercado',
              status: 'no_data' as const,
              detail: 'SIN DATOS',
            },
          ]
        : []),
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
      confirmation5m: {
        status: 'no_data',
        statusLabel: 'Sin datos',
        trend: null,
        rsi14: null,
        roc10: null,
        lastCandleDirection: null,
        lastCandlePattern: null,
        summary: reason,
      },
      checks: offlineChecks,
      passedCount: 0,
      totalChecks: offlineChecks.length,
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
  // 3. Ubicación estructural respecto a S1 y resistencia R1 (sin exigir R/B ni SL)
  // ---------------------------------------------------------------------------
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
      label: 'Estructura S1 / R1',
      status: !opp.support ? 'block' : 'warn',
      detail: `Sin ${missingSr}`,
    });
    if (!opp.support) hasHardNoTrade = true;
    blockingConditions.push(
      `Falta referencia estructural (${missingSr}) para definir COMPRA LIMIT y VENTA LIMIT.`
    );
  } else {
    const sDist = opp.support.distancePct;
    const rDist = opp.resistance.distancePct;
    const totalBand = sDist + rDist;
    bandPosition = totalBand > 0 ? sDist / totalBand : 0.5;

    if (rDist < MIN_R1_DISTANCE_PCT_FOR_BUY) {
      hasContradictionOrWait = true;
      if (rDist < 0.12) hasHardNoTrade = true;
      checks.push({
        id: 'sr',
        label: 'Estructura S1 / R1',
        status: rDist < 0.12 ? 'block' : 'warn',
        detail: `R1 a +${rDist.toFixed(2)}% (muy cerca)`,
      });
      blockingConditions.push(
        `Precio demasiado cerca de resistencia R1 (${formatPrice(opp.resistance.price, market.priceDecimals)}, +${rDist.toFixed(2)}%; mínimo +${MIN_R1_DISTANCE_PCT_FOR_BUY.toFixed(2)}%).`
      );
    } else if (bandPosition > MAX_BAND_POSITION_FOR_BUY) {
      hasContradictionOrWait = true;
      checks.push({
        id: 'sr',
        label: 'Estructura S1 / R1',
        status: 'warn',
        detail: `Zona alta (${(bandPosition * 100).toFixed(0)}%) · R1 +${rDist.toFixed(2)}%`,
      });
      blockingConditions.push(
        `Precio extendido en la parte alta del rango S1–R1 (${(bandPosition * 100).toFixed(0)}% > ${(MAX_BAND_POSITION_FOR_BUY * 100).toFixed(0)}%): esperar retroceso hacia zona LIMIT.`
      );
    } else {
      checks.push({
        id: 'sr',
        label: 'Estructura S1 / R1',
        status: 'pass',
        detail: `S1 -${sDist.toFixed(2)}% · R1 +${rDist.toFixed(2)}%`,
      });
      activationReasons.push(
        `Ubicación estructural favorable entre soporte S1 (-${sDist.toFixed(2)}%) y resistencia R1 (+${rDist.toFixed(2)}%).`
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
  // 10. Confirmación 5M (únicamente confirmación final de timing de entrada)
  // ---------------------------------------------------------------------------
  const confirm5m = evaluateFiveMinuteConfirmation(candles5m);
  checks.push(confirm5m.check);
  if (confirm5m.missingData) {
    hasHardNoTrade = true;
    if (confirm5m.blockingReason) {
      blockingConditions.push(confirm5m.blockingReason);
    }
  } else if (confirm5m.analysis.status === 'pass') {
    if (confirm5m.activationReason) {
      activationReasons.push(confirm5m.activationReason);
    }
  } else {
    hasContradictionOrWait = true;
    if (confirm5m.blockingReason) {
      blockingConditions.push(confirm5m.blockingReason);
    }
  }

  // ---------------------------------------------------------------------------
  // 11. Detector de Dirección de Mercado (filtro adicional 4H/1H/15M cerrado)
  //     Una dirección ALCISTA NO implica compra inmediata: exige zona LIMIT favorable
  //     y confluencia completa. Si faltan datos -> SIN DATOS y sin señal.
  // ---------------------------------------------------------------------------
  if (marketDirection !== undefined) {
    if (
      !marketDirection ||
      !marketDirection.isValid ||
      marketDirection.overallDirection === 'SIN DATOS' ||
      marketDirection.overallConfluence === null ||
      marketDirection.overallStrength === null
    ) {
      hasHardNoTrade = true;
      checks.push({
        id: 'market_direction',
        label: 'Dirección de Mercado',
        status: 'no_data',
        detail: 'SIN DATOS',
      });
      blockingConditions.push(
        marketDirection?.invalidReason ??
          'Detector de Dirección de Mercado en SIN DATOS (4H/1H/15M): no se genera señal.'
      );
    } else if (marketDirection.overallDirection === 'BAJISTA') {
      hasHardNoTrade = true;
      checks.push({
        id: 'market_direction',
        label: 'Dirección de Mercado',
        status: 'block',
        detail: `BAJISTA · ${marketDirection.overallStrength} (${marketDirection.overallConfluence}/100)`,
      });
      blockingConditions.push(
        `Dirección de Mercado BAJISTA (${marketDirection.overallStrength}, confluencia ${marketDirection.overallConfluence}/100 en 4H/1H/15M): bloquea COMPRAR LIMIT.`
      );
    } else if (marketDirection.overallDirection === 'LATERAL') {
      hasContradictionOrWait = true;
      checks.push({
        id: 'market_direction',
        label: 'Dirección de Mercado',
        status: 'warn',
        detail: `LATERAL · ${marketDirection.overallStrength} (${marketDirection.overallConfluence}/100)`,
      });
      blockingConditions.push(
        `Dirección de Mercado LATERAL (confluencia ${marketDirection.overallConfluence}/100): estructura contradictoria o sin confirmación HH/HL suficiente.`
      );
    } else if (marketDirection.overallStrength === 'Débil') {
      hasContradictionOrWait = true;
      checks.push({
        id: 'market_direction',
        label: 'Dirección de Mercado',
        status: 'warn',
        detail: `ALCISTA · Débil (${marketDirection.overallConfluence}/100)`,
      });
      blockingConditions.push(
        `Dirección de Mercado ALCISTA débil (${marketDirection.overallConfluence}/100): esperar mayor confluencia técnica y zona LIMIT favorable.`
      );
    } else {
      checks.push({
        id: 'market_direction',
        label: 'Dirección de Mercado',
        status: 'pass',
        detail: `ALCISTA · ${marketDirection.overallStrength} (${marketDirection.overallConfluence}/100)`,
      });
      activationReasons.push(
        `Dirección de Mercado ALCISTA (${marketDirection.overallStrength} · ${marketDirection.overallConfluence}/100 en 4H/1H/15M), habilitando espera de zona LIMIT favorable.`
      );
    }
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

  // Confidence level 0–100 (only computed when 10/10 confluence is active)
  let confidence: number | null = null;
  if (state === 'BUY' && netPot !== null) {
    const scoreBase = opp.score * 0.65; // up to 65
    const bandBonus = bandPosition !== null ? clamp((0.72 - bandPosition) * 20, 0, 12) : 4;
    const netBonus = clamp((netPot - 0.2) * 15, 0, 10);
    const fullTrendBonus = t4 === 'Alcista' && t1 === 'Alcista' && t15 === 'Alcista' ? 8 : 4;
    const spreadBonus = spPct <= 0.05 ? 5 : 2;
    confidence = Math.round(
      clamp(scoreBase + bandBonus + netBonus + fullTrendBonus + spreadBonus, 55, 96)
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
    activationReasons: state === 'BUY' ? activationReasons.slice(0, 5) : [],
    blockingConditions: state === 'BUY' ? [] : blockingConditions,
    confirmation5m: confirm5m.analysis,
    checks,
    passedCount,
    totalChecks: checks.length,
    updatedAt: opp.updatedAt,
  };
}
