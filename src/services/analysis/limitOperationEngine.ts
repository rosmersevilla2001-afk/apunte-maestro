import { MARKET_MAP, formatPrice } from '../../config/markets';
import type {
  DailyAccumulatedStats,
  DailyGoalStatus,
  FeeConfig,
  LimitOperationPlan,
  LimitOperationState,
  LimitPlanConfig,
  MarketDecision,
  MarketOpportunity,
  TrackedLimitOperation,
} from '../../types/market';

const BUY_LIMIT_ATR_CUSHION = 0.35;
const BUY_LIMIT_MAX_GAP_SHARE = 0.45;

function stateLabelFor(
  state: LimitOperationState
): '🟢 COMPRAR LIMIT' | '🟡 ESPERAR' | '🔴 NO COMPRAR' | '🔴 INVALIDADA' {
  if (state === 'COMPRAR LIMIT') return '🟢 COMPRAR LIMIT';
  if (state === 'ESPERAR') return '🟡 ESPERAR';
  if (state === 'INVALIDADA') return '🔴 INVALIDADA';
  return '🔴 NO COMPRAR';
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function getLocalDateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeDailyAccumulatedStats(
  realizedUsdt: number,
  config: LimitPlanConfig,
  dateKey: string = getLocalDateKey()
): DailyAccumulatedStats {
  const targetMin = Math.max(0.5, config.dailyTargetMinUsdt);
  const targetMax = Math.max(targetMin, config.dailyTargetMaxUsdt);
  const realized = Number.isFinite(realizedUsdt) ? realizedUsdt : 0;

  const remainingToMinUsdt = Math.max(0, targetMin - realized);
  const remainingToMaxUsdt = Math.max(0, targetMax - realized);
  const progressToMinPct = targetMin > 0 ? Math.max(0, Math.min(100, (realized / targetMin) * 100)) : 0;
  const progressToMaxPct = targetMax > 0 ? Math.max(0, Math.min(100, (realized / targetMax) * 100)) : 0;

  let status: DailyGoalStatus = 'En progreso';
  if (realized >= targetMax) {
    status = 'Objetivo $10 completado · Adicionales activas';
  } else if (realized >= targetMin) {
    status = 'Rango objetivo alcanzado ($6–$10)';
  }

  return {
    dateKey,
    targetMinUsdt: targetMin,
    targetMaxUsdt: targetMax,
    realizedUsdt: realized,
    remainingToMinUsdt,
    remainingToMaxUsdt,
    progressToMinPct,
    progressToMaxPct,
    status,
    goalCompleted: realized >= targetMax,
  };
}

/**
 * Manual Spot LIMIT Operation Engine (NO Stop Loss, NO R/B, NO auto-execution).
 * - Uses ONLY real Binance data already computed by Opportunity Engine & Decision Engine (10/10 with closed 5M).
 * - Calculates BUY LIMIT structurally from real S1 + ATR(14) (strictly below market price, never just current price).
 * - Calculates SELL LIMIT from real technical resistance R1.
 * - Computes exact NET profit after buy fee (0.10%), sell fee (0.10%), and real live spread.
 * - Sizes recommended capital dynamically for the $6–$10 net daily target within a strict configurable exposure cap.
 * - Never lowers filters to chase the remaining daily goal and never increases exposure after $10 is reached.
 * - Flags INVALIDADA (never auto-sells) if structure / S1 is lost on a tracked LIMIT operation.
 */
export function evaluateLimitOperationPlan(
  opp: MarketOpportunity,
  decision: MarketDecision,
  limitConfig: LimitPlanConfig,
  feeConfig: FeeConfig,
  dailyStats: DailyAccumulatedStats,
  isBinanceLive: boolean,
  trackedOperation?: TrackedLimitOperation | null
): LimitOperationPlan {
  const market = MARKET_MAP[opp.marketId];

  const baseCapitalUsdt =
    Number.isFinite(limitConfig.baseCapitalUsdt) && limitConfig.baseCapitalUsdt > 0
      ? limitConfig.baseCapitalUsdt
      : 0;
  const maxExposurePct =
    Number.isFinite(limitConfig.maxExposurePct) && limitConfig.maxExposurePct > 0
      ? Math.min(100, limitConfig.maxExposurePct)
      : 0;
  const minNetProfitUsdt =
    Number.isFinite(limitConfig.minNetProfitUsdt) && limitConfig.minNetProfitUsdt >= 0
      ? limitConfig.minNetProfitUsdt
      : 0;
  const maxAllowedCapitalUsdt = baseCapitalUsdt * (maxExposurePct / 100);

  const buyFeePct = Math.max(0, feeConfig.buyFeePct);
  const sellFeePct = Math.max(0, feeConfig.sellFeePct);

  const reasons: string[] = [];
  const blockingReasons: string[] = [];

  const baseEmpty: LimitOperationPlan = {
    marketId: opp.marketId,
    state: 'NO COMPRAR',
    stateLabel: stateLabelFor('NO COMPRAR'),
    isRecommended: false,
    isAdditionalOpportunity: false,
    additionalReason: null,
    isStructurallyInvalidated: false,
    invalidationReason: null,
    decisionState: decision.state,
    opportunityScore: opp.score,
    currentPrice: opp.price,
    buyLimitPrice: null,
    buyLimitBasis: null,
    buyLimitDistancePct: null,
    sellLimitPrice: null,
    sellLimitBasis: null,
    s1Price: opp.support?.price ?? null,
    r1Price: opp.resistance?.price ?? null,
    atr14: opp.atr14,
    baseCapitalUsdt,
    maxExposurePct,
    maxAllowedCapitalUsdt,
    capitalNeededForMinGoalUsdt: null,
    capitalNeededForMaxGoalUsdt: null,
    recommendedCapitalUsdt: null,
    recommendedExposurePct: null,
    grossSpreadPct: null,
    grossProfitUsdt: null,
    buyFeePct,
    sellFeePct,
    buyFeeUsdt: null,
    sellFeeUsdt: null,
    spreadPct: opp.spreadPct,
    spreadCostUsdt: null,
    totalCostsUsdt: null,
    netProfitUsdt: null,
    netProfitPct: null,
    dailyGoalContributionMinPct: null,
    dailyGoalContributionMaxPct: null,
    reasons,
    blockingReasons,
    updatedAt: opp.updatedAt,
  };

  // Hard gate 1: Offline or stale/incomplete Binance data
  if (!isBinanceLive || !opp.isValid || opp.price === null || opp.price <= 0) {
    blockingReasons.push(
      !isBinanceLive
        ? 'Binance desconectado: no se generan planes LIMIT sin datos reales en vivo.'
        : (opp.invalidReason ?? 'Datos reales incompletos o desactualizados de Binance.')
    );
    return baseEmpty;
  }

  // Structural invalidation monitor for a manually tracked LIMIT operation (NEVER auto-sells)
  let isStructurallyInvalidated = false;
  let invalidationReason: string | null = null;
  if (trackedOperation && opp.price < trackedOperation.s1InvalidationPrice) {
    isStructurallyInvalidated = true;
    invalidationReason = `Precio real (${formatPrice(opp.price, market.priceDecimals)}) rompió el soporte estructural S1 (${formatPrice(trackedOperation.s1InvalidationPrice, market.priceDecimals)}) de tu operación LIMIT en seguimiento. Revisión manual requerida (no se vende automáticamente).`;
  }

  // Hard gate 2: Capital & exposure limits must be valid
  if (baseCapitalUsdt <= 0 || maxAllowedCapitalUsdt <= 0) {
    blockingReasons.push(
      'Capital base o límite máximo de exposición inválido (deben ser mayores a 0).'
    );
    return {
      ...baseEmpty,
      isStructurallyInvalidated,
      invalidationReason,
      state: isStructurallyInvalidated ? 'INVALIDADA' : 'NO COMPRAR',
      stateLabel: stateLabelFor(isStructurallyInvalidated ? 'INVALIDADA' : 'NO COMPRAR'),
    };
  }

  const price = opp.price;
  const s1 = opp.support?.price ?? null;
  const r1 = opp.resistance?.price ?? null;
  const atr = opp.atr14;
  const spPct = opp.spreadPct;

  const missing: string[] = [];
  if (s1 === null || s1 <= 0) missing.push('soporte S1');
  if (r1 === null || r1 <= 0) missing.push('resistencia R1');
  if (atr === null || atr <= 0) missing.push('ATR(14)');
  if (spPct === null || spPct < 0) missing.push('spread real');

  if (missing.length > 0) {
    if (isStructurallyInvalidated && invalidationReason) {
      blockingReasons.push(invalidationReason);
    }
    blockingReasons.push(
      `Faltan referencias reales de Binance para calcular el plan LIMIT (${missing.join(', ')}).`
    );
    return {
      ...baseEmpty,
      isStructurallyInvalidated,
      invalidationReason,
      state: isStructurallyInvalidated ? 'INVALIDADA' : 'NO COMPRAR',
      stateLabel: stateLabelFor(isStructurallyInvalidated ? 'INVALIDADA' : 'NO COMPRAR'),
    };
  }

  // All real structural levels are present
  const s1Val = s1!;
  const r1Val = r1!;
  const atrVal = atr!;
  const spreadPct = spPct!;

  // Check if current price has already broken below structural S1
  if (price <= s1Val) {
    const structMsg = `Estructura invalidada: el precio actual (${formatPrice(price, market.priceDecimals)}) perdió el soporte S1 (${formatPrice(s1Val, market.priceDecimals)}). No se vende automáticamente; esperar reconstrucción.`;
    blockingReasons.push(structMsg);
    return {
      ...baseEmpty,
      isStructurallyInvalidated: true,
      invalidationReason: structMsg,
      state: 'INVALIDADA',
      stateLabel: stateLabelFor('INVALIDADA'),
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Structural BUY LIMIT Price = S1 + ATR(14) cushion (NEVER simply current price)
  // ---------------------------------------------------------------------------
  const gapToS1 = price - s1Val;
  const atrCushion = Math.min(atrVal * BUY_LIMIT_ATR_CUSHION, gapToS1 * BUY_LIMIT_MAX_GAP_SHARE);
  const rawBuyLimit = s1Val + Math.max(0, atrCushion);
  // Keep strictly below current market price by at least 1 tick when space permits
  const maxLimitBelowMarket = Math.max(s1Val, price - market.tickSize);
  const buyLimitPrice = roundToDecimals(
    Math.min(rawBuyLimit, maxLimitBelowMarket),
    market.priceDecimals
  );
  const buyLimitDistancePct = ((price - buyLimitPrice) / price) * 100;
  const buyLimitBasis = `S1 (${formatPrice(s1Val, market.priceDecimals)}) + margen ATR(14)`;

  // ---------------------------------------------------------------------------
  // 2. Technical SELL LIMIT Price = real R1 resistance
  // ---------------------------------------------------------------------------
  const sellLimitPrice = roundToDecimals(r1Val, market.priceDecimals);
  const sellLimitBasis = `Resistencia técnica R1 (${opp.resistance?.source ?? 'Estructura'})`;

  if (sellLimitPrice <= buyLimitPrice) {
    blockingReasons.push(
      'La resistencia técnica R1 no supera el nivel de entrada BUY LIMIT calculado.'
    );
    return {
      ...baseEmpty,
      isStructurallyInvalidated,
      invalidationReason,
      buyLimitPrice,
      buyLimitBasis,
      buyLimitDistancePct,
      sellLimitPrice,
      sellLimitBasis,
      state: isStructurallyInvalidated ? 'INVALIDADA' : 'NO COMPRAR',
      stateLabel: stateLabelFor(isStructurallyInvalidated ? 'INVALIDADA' : 'NO COMPRAR'),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Exact Net Yield per USDT after Buy Fee (0.10%), Sell Fee (0.10%), and Real Spread
  // ---------------------------------------------------------------------------
  const grossSpreadPct = ((sellLimitPrice - buyLimitPrice) / buyLimitPrice) * 100;
  const grossRate = grossSpreadPct / 100;
  const netRatePerUsdt =
    grossRate -
    buyFeePct / 100 -
    (1 + grossRate) * (sellFeePct / 100) -
    spreadPct / 100;
  const netProfitPct = netRatePerUsdt * 100;

  // Dynamic capital required for $6–$10 daily target
  const capitalNeededForMinGoalUsdt =
    netRatePerUsdt > 0 ? dailyStats.targetMinUsdt / netRatePerUsdt : null;
  const capitalNeededForMaxGoalUsdt =
    netRatePerUsdt > 0 ? dailyStats.targetMaxUsdt / netRatePerUsdt : null;

  // Recommended capital (strictly capped by configurable exposure limit; NEVER uses 100% automatically
  // and NEVER increases exposure automatically after the $10 goal is met)
  let recommendedCapitalUsdt: number | null = null;
  if (netRatePerUsdt > 0) {
    const midGoal = (dailyStats.targetMinUsdt + dailyStats.targetMaxUsdt) / 2; // $8 default
    const desiredContributionUsdt = dailyStats.goalCompleted
      ? Math.max(minNetProfitUsdt, dailyStats.targetMinUsdt) // Keep disciplined standard sizing after $10
      : Math.max(
          minNetProfitUsdt,
          Math.min(dailyStats.targetMaxUsdt, Math.max(midGoal, dailyStats.remainingToMinUsdt))
        );
    const idealCapital = desiredContributionUsdt / netRatePerUsdt;
    recommendedCapitalUsdt = Math.min(idealCapital, maxAllowedCapitalUsdt);
  } else {
    recommendedCapitalUsdt = maxAllowedCapitalUsdt;
  }

  const recommendedExposurePct =
    baseCapitalUsdt > 0 && recommendedCapitalUsdt !== null
      ? (recommendedCapitalUsdt / baseCapitalUsdt) * 100
      : null;

  // Compute exact USDT profit & costs at recommended capital
  const deployed = recommendedCapitalUsdt ?? 0;
  const grossProfitUsdt = deployed * grossRate;
  const buyFeeUsdt = deployed * (buyFeePct / 100);
  const sellFeeUsdt = (deployed + grossProfitUsdt) * (sellFeePct / 100);
  const spreadCostUsdt = deployed * (spreadPct / 100);
  const totalCostsUsdt = buyFeeUsdt + sellFeeUsdt + spreadCostUsdt;
  const netProfitUsdt = grossProfitUsdt - totalCostsUsdt;

  // Potential net profit at max allowed exposure (checks if high-confluence opportunity exceeds $10 net)
  const maxExposureNetProfitUsdt = maxAllowedCapitalUsdt * netRatePerUsdt;

  const dailyGoalContributionMinPct =
    dailyStats.targetMinUsdt > 0 ? (netProfitUsdt / dailyStats.targetMinUsdt) * 100 : null;
  const dailyGoalContributionMaxPct =
    dailyStats.targetMaxUsdt > 0 ? (netProfitUsdt / dailyStats.targetMaxUsdt) * 100 : null;

  // ---------------------------------------------------------------------------
  // 4. Final LIMIT State Resolution (strict 10/10 rules — NEVER lowered for daily goal)
  // ---------------------------------------------------------------------------
  let state: LimitOperationState = 'ESPERAR';
  let isAdditionalOpportunity = false;
  let additionalReason: string | null = null;

  if (isStructurallyInvalidated && invalidationReason) {
    state = 'INVALIDADA';
    blockingReasons.push(invalidationReason);
  } else if (decision.state === 'NO TRADE') {
    state = 'NO COMPRAR';
    blockingReasons.push(
      decision.blockingConditions[0] ??
        'Motor de Decisión en 🔴 NO COMPRAR: condición estructural, liquidez o datos 5M impiden operar.'
    );
  } else if (decision.state === 'WAIT') {
    state = 'ESPERAR';
    blockingReasons.push(
      ...decision.blockingConditions.slice(0, 3)
    );
  } else {
    // Decision Engine is 10/10 (4H context + 1H trend + 15M setup + 5M closed-candle confirmation)
    if (netProfitUsdt <= 0) {
      state = 'NO COMPRAR';
      blockingReasons.push(
        `Beneficio neto estimado negativo o nulo (${netProfitUsdt.toFixed(2)} USDT) tras comisión de compra (${buyFeePct.toFixed(2)}%), venta (${sellFeePct.toFixed(2)}%) y spread real (${spreadPct.toFixed(3)}%).`
      );
    } else if (netProfitUsdt < minNetProfitUsdt) {
      state = 'ESPERAR';
      blockingReasons.push(
        `Ganancia neta estimada (+${netProfitUsdt.toFixed(2)} USDT con hasta ${maxAllowedCapitalUsdt.toFixed(0)} USDT de exposición máx.) por debajo del beneficio neto mínimo configurable ($${minNetProfitUsdt.toFixed(2)} USDT).`
      );
    } else {
      state = 'COMPRAR LIMIT';
      reasons.push(
        `Confluencia 10/10 confirmada (4H/1H/15M + Confirmación 5M en última vela cerrada).`
      );
      reasons.push(
        `Entrada BUY LIMIT en ${formatPrice(buyLimitPrice, market.priceDecimals)} (${buyLimitDistancePct.toFixed(2)}% bajo precio actual, anclada a S1 + ATR) hacia VENTA LIMIT R1 en ${formatPrice(sellLimitPrice, market.priceDecimals)}.`
      );
      reasons.push(
        `Ganancia neta estimada de +${netProfitUsdt.toFixed(2)} USDT (+${netProfitPct.toFixed(2)}%) tras comisiones (${(buyFeePct + sellFeePct).toFixed(2)}%) y spread real (${spreadPct.toFixed(3)}%); no garantiza resultados.`
      );

      if (dailyStats.goalCompleted) {
        isAdditionalOpportunity = true;
        additionalReason =
          'Meta diaria de $10 alcanzada: oportunidad adicional de alta confluencia manteniendo el mismo límite de exposición sin elevar riesgo.';
      } else if (maxExposureNetProfitUsdt > dailyStats.targetMaxUsdt) {
        isAdditionalOpportunity = true;
        additionalReason = `Oportunidad adicional de alta calidad: puede superar $10 netos (hasta +${maxExposureNetProfitUsdt.toFixed(2)} USDT dentro del límite de exposición de ${maxExposurePct}%).`;
      }
    }
  }

  return {
    marketId: opp.marketId,
    state,
    stateLabel: stateLabelFor(state),
    isRecommended: state === 'COMPRAR LIMIT',
    isAdditionalOpportunity,
    additionalReason,
    isStructurallyInvalidated,
    invalidationReason,
    decisionState: decision.state,
    opportunityScore: opp.score,
    currentPrice: price,
    buyLimitPrice,
    buyLimitBasis,
    buyLimitDistancePct,
    sellLimitPrice,
    sellLimitBasis,
    s1Price: s1Val,
    r1Price: r1Val,
    atr14: atrVal,
    baseCapitalUsdt,
    maxExposurePct,
    maxAllowedCapitalUsdt,
    capitalNeededForMinGoalUsdt,
    capitalNeededForMaxGoalUsdt,
    recommendedCapitalUsdt,
    recommendedExposurePct,
    grossSpreadPct,
    grossProfitUsdt,
    buyFeePct,
    sellFeePct,
    buyFeeUsdt,
    sellFeeUsdt,
    spreadPct,
    spreadCostUsdt,
    totalCostsUsdt,
    netProfitUsdt,
    netProfitPct,
    dailyGoalContributionMinPct,
    dailyGoalContributionMaxPct,
    reasons,
    blockingReasons,
    updatedAt: opp.updatedAt,
  };
}
