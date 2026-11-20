import { MARKET_MAP, formatPrice } from '../../config/markets';
import type {
  FeeConfig,
  MarketDecision,
  MarketOpportunity,
  SimulationConfig,
  SimulationViabilityState,
  TradeSimulation,
} from '../../types/market';

const SL_ATR_CUSHION_MULTIPLIER = 0.5;
const MIN_SL_ATR_MULTIPLE_HARD = 1.2;
const MIN_SL_ATR_MULTIPLE_VIABLE = 1.5;
const MIN_NET_RR_HARD = 1.0;
const MIN_NET_RR_VIABLE = 1.35;
const MAX_CAPITAL_RISK_PCT_VIABLE = 3.0;

function stateLabelFor(
  state: SimulationViabilityState
): '🟢 OPERACIÓN VIABLE' | '🟡 RIESGO / ESPERAR' | '🔴 NO VIABLE' {
  if (state === 'VIABLE') return '🟢 OPERACIÓN VIABLE';
  if (state === 'RISK_WAIT') return '🟡 RIESGO / ESPERAR';
  return '🔴 NO VIABLE';
}

/**
 * Deterministic Spot Trade Simulator & Risk Management engine.
 * - Uses ONLY real live Binance data already computed by Opportunity Engine & Decision Engine.
 * - Never modifies Opportunity Score or Decision Engine state.
 * - Never executes orders or guarantees returns.
 */
export function simulateMarketTrade(
  opp: MarketOpportunity,
  decision: MarketDecision,
  simConfig: SimulationConfig,
  feeConfig: FeeConfig,
  isBinanceLive: boolean
): TradeSimulation {
  const market = MARKET_MAP[opp.marketId];
  const availableCapitalUsdt =
    Number.isFinite(simConfig.availableCapitalUsdt) && simConfig.availableCapitalUsdt > 0
      ? simConfig.availableCapitalUsdt
      : 0;
  const capitalAllocationPct =
    Number.isFinite(simConfig.capitalAllocationPct) && simConfig.capitalAllocationPct > 0
      ? Math.min(100, simConfig.capitalAllocationPct)
      : 0;
  const positionSizeUsdt =
    availableCapitalUsdt > 0 && capitalAllocationPct > 0
      ? availableCapitalUsdt * (capitalAllocationPct / 100)
      : null;

  const buyFeePct = Math.max(0, feeConfig.buyFeePct);
  const sellFeePct = Math.max(0, feeConfig.sellFeePct);

  const blockingReasons: string[] = [];
  const riskNotes: string[] = [];

  const baseEmpty: TradeSimulation = {
    marketId: opp.marketId,
    state: 'NOT_VIABLE',
    stateLabel: stateLabelFor('NOT_VIABLE'),
    isAllowed: false,
    decisionState: decision.state,
    availableCapitalUsdt,
    capitalAllocationPct,
    positionSizeUsdt,
    entryPrice: null,
    stopLossPrice: null,
    stopLossAtrBuffer: null,
    stopLossInAtr: null,
    takeProfitPrice: null,
    s1Price: opp.support?.price ?? null,
    r1Price: opp.resistance?.price ?? null,
    atr14: opp.atr14,
    slDistanceAbs: null,
    slDistancePct: null,
    tpDistanceAbs: null,
    tpDistancePct: null,
    buyFeePct,
    sellFeePct,
    buyFeeUsdt: null,
    sellFeeUsdtTp: null,
    sellFeeUsdtSl: null,
    totalFeesTpUsdt: null,
    spreadAbs: opp.spreadAbs,
    spreadPct: opp.spreadPct,
    spreadCostUsdt: null,
    totalCostsTpUsdt: null,
    grossRiskUsdt: null,
    estimatedRiskUsdt: null,
    estimatedRiskPctOfPosition: null,
    estimatedRiskPctOfCapital: null,
    grossReturnUsdt: null,
    grossReturnPct: null,
    netReturnUsdt: null,
    netReturnPctOfPosition: null,
    netReturnPctOfCapital: null,
    grossRiskRewardRatio: null,
    netRiskRewardRatio: null,
    blockingReasons,
    riskNotes,
    updatedAt: opp.updatedAt,
  };

  // Hard gate 1: Binance offline or stale/invalid opportunity data
  if (!isBinanceLive || !opp.isValid) {
    blockingReasons.push(
      !isBinanceLive
        ? 'Binance desconectado: simulación bloqueada hasta recuperar datos reales en vivo.'
        : (opp.invalidReason ?? 'Datos reales incompletos o desactualizados de Binance.')
    );
    return baseEmpty;
  }

  // Hard gate 2: Capital / allocation parameters must be positive
  if (positionSizeUsdt === null || positionSizeUsdt <= 0) {
    blockingReasons.push(
      'Capital disponible o porcentaje por operación inválido (deben ser mayores a 0).'
    );
    return baseEmpty;
  }

  // Real technical anchors from Binance + Opportunity Engine (never invented)
  const entryPrice = opp.price;
  const s1Price = opp.support?.price ?? null;
  const r1Price = opp.resistance?.price ?? null;
  const atr14 = opp.atr14;
  const spreadPct = opp.spreadPct;
  const spreadAbs = opp.spreadAbs;

  const missingFields: string[] = [];
  if (entryPrice === null || entryPrice <= 0) missingFields.push('precio actual');
  if (s1Price === null || s1Price <= 0) missingFields.push('soporte S1');
  if (r1Price === null || r1Price <= 0) missingFields.push('resistencia R1');
  if (atr14 === null || atr14 <= 0) missingFields.push('ATR(14)');
  if (spreadPct === null || spreadPct < 0) missingFields.push('spread real');

  if (missingFields.length > 0) {
    if (decision.state !== 'BUY') {
      blockingReasons.push(
        `Motor de Decisión en ${decision.state}: la operación simulada solo se permite en 🟢 BUY.`
      );
    }
    blockingReasons.push(
      `Faltan datos técnicos reales de Binance para calcular el plan completo (${missingFields.join(', ')}).`
    );
    return {
      ...baseEmpty,
      entryPrice,
    };
  }

  // All real values are verified non-null here
  const entry = entryPrice!;
  const s1 = s1Price!;
  const r1 = r1Price!;
  const atr = atr14!;
  const spPct = spreadPct!;

  // Technical Stop Loss anchored to real S1 + 0.5 * ATR(14) cushion below S1
  const stopLossAtrBuffer = atr * SL_ATR_CUSHION_MULTIPLIER;
  const rawStopLoss = s1 - stopLossAtrBuffer;
  const stopLossPrice = rawStopLoss > 0 && rawStopLoss < entry ? rawStopLoss : null;

  // Technical Take Profit anchored strictly to real R1
  const takeProfitPrice = r1 > entry ? r1 : null;

  if (stopLossPrice === null || takeProfitPrice === null) {
    if (decision.state !== 'BUY') {
      blockingReasons.push(
        `Motor de Decisión en ${decision.state}: la operación simulada solo se permite en 🟢 BUY.`
      );
    }
    if (stopLossPrice === null) {
      blockingReasons.push(
        'No se puede ubicar un Stop Loss técnico válido por debajo del precio de entrada con S1 + ATR(14).'
      );
    }
    if (takeProfitPrice === null) {
      blockingReasons.push(
        'La resistencia R1 no ofrece recorrido técnico por encima del precio actual.'
      );
    }
    return {
      ...baseEmpty,
      entryPrice: entry,
      stopLossPrice,
      stopLossAtrBuffer,
      takeProfitPrice,
    };
  }

  // Exact structural distances
  const slDistanceAbs = entry - stopLossPrice;
  const slDistancePct = (slDistanceAbs / entry) * 100;
  const stopLossInAtr = slDistanceAbs / atr;

  const tpDistanceAbs = takeProfitPrice - entry;
  const tpDistancePct = (tpDistanceAbs / entry) * 100;

  // Explicit Spot execution costs (buy fee + exit fee + real spread)
  const buyFeeUsdt = positionSizeUsdt * (buyFeePct / 100);
  const spreadCostUsdt = positionSizeUsdt * (spPct / 100);

  // Worst-case scenario (Stop Loss hit)
  const grossRiskUsdt = positionSizeUsdt * (slDistancePct / 100);
  const exitNotionalSl = Math.max(positionSizeUsdt - grossRiskUsdt, 0);
  const sellFeeUsdtSl = exitNotionalSl * (sellFeePct / 100);
  const estimatedRiskUsdt = grossRiskUsdt + buyFeeUsdt + sellFeeUsdtSl + spreadCostUsdt;
  const estimatedRiskPctOfPosition = (estimatedRiskUsdt / positionSizeUsdt) * 100;
  const estimatedRiskPctOfCapital = (estimatedRiskUsdt / availableCapitalUsdt) * 100;

  // Target scenario (R1 reached)
  const grossReturnUsdt = positionSizeUsdt * (tpDistancePct / 100);
  const grossReturnPct = tpDistancePct;
  const exitNotionalTp = positionSizeUsdt + grossReturnUsdt;
  const sellFeeUsdtTp = exitNotionalTp * (sellFeePct / 100);
  const totalFeesTpUsdt = buyFeeUsdt + sellFeeUsdtTp;
  const totalCostsTpUsdt = totalFeesTpUsdt + spreadCostUsdt;
  const netReturnUsdt = grossReturnUsdt - totalCostsTpUsdt;
  const netReturnPctOfPosition = (netReturnUsdt / positionSizeUsdt) * 100;
  const netReturnPctOfCapital = (netReturnUsdt / availableCapitalUsdt) * 100;

  // Risk / Reward ratios (both gross reference and net post-costs)
  const grossRiskRewardRatio = slDistancePct > 0 ? tpDistancePct / slDistancePct : null;
  const netRiskRewardRatio = estimatedRiskUsdt > 0 ? netReturnUsdt / estimatedRiskUsdt : null;

  // ---------------------------------------------------------------------------
  // Strict Viability Rules Evaluation
  // ---------------------------------------------------------------------------
  let hasHardNoViable = false;
  let hasRiskWait = false;

  // Rule A: Decision Engine MUST be 🟢 BUY
  if (decision.state === 'NO TRADE') {
    hasHardNoViable = true;
    blockingReasons.push(
      'Motor de Decisión en 🔴 NO TRADE: operación simulada prohibida mientras exista bloqueo estructural o de liquidez.'
    );
  } else if (decision.state === 'WAIT') {
    hasRiskWait = true;
    blockingReasons.push(
      'Motor de Decisión en 🟡 WAIT: no se permite operar hasta obtener confirmación 🟢 BUY.'
    );
  }

  // Rule B: Stop Loss must not sit too close to entry relative to ATR noise or spread
  if (stopLossInAtr < MIN_SL_ATR_MULTIPLE_HARD || slDistancePct <= spPct * 2) {
    hasHardNoViable = true;
    blockingReasons.push(
      `Stop Loss demasiado cerca de la entrada (${stopLossInAtr.toFixed(2)}x ATR(14) / -${slDistancePct.toFixed(2)}%): alto riesgo de barrido por ruido normal o spread (${spPct.toFixed(3)}%).`
    );
  } else if (stopLossInAtr < MIN_SL_ATR_MULTIPLE_VIABLE) {
    hasRiskWait = true;
    blockingReasons.push(
      `Margen de Stop Loss ajustado frente al ruido de mercado (${stopLossInAtr.toFixed(2)}x ATR(14); óptimo ≥ ${MIN_SL_ATR_MULTIPLE_VIABLE.toFixed(1)}x ATR).`
    );
  }

  // Rule C: Net return after fees & spread must adequately compensate worst-case risk
  if (netReturnUsdt <= 0) {
    hasHardNoViable = true;
    blockingReasons.push(
      `Retorno neto estimado negativo o nulo (${netReturnUsdt.toFixed(2)} USDT / ${netReturnPctOfPosition.toFixed(2)}%) tras descontar comisiones (${totalFeesTpUsdt.toFixed(2)} USDT) y spread (${spreadCostUsdt.toFixed(2)} USDT).`
    );
  } else if (netRiskRewardRatio === null || netRiskRewardRatio < MIN_NET_RR_HARD) {
    hasHardNoViable = true;
    blockingReasons.push(
      `Relación Riesgo/Beneficio neta insuficiente (1 : ${netRiskRewardRatio !== null ? netRiskRewardRatio.toFixed(2) : '0.00'}; mínimo estructural 1 : ${MIN_NET_RR_HARD.toFixed(2)}).`
    );
  } else if (netRiskRewardRatio < MIN_NET_RR_VIABLE) {
    hasRiskWait = true;
    blockingReasons.push(
      `Relación Riesgo/Beneficio neta justa (1 : ${netRiskRewardRatio.toFixed(2)}; objetivo recomendado ≥ 1 : ${MIN_NET_RR_VIABLE.toFixed(2)}).`
    );
  }

  // Rule D: Capital exposure / risk discipline
  if (estimatedRiskPctOfCapital > MAX_CAPITAL_RISK_PCT_VIABLE) {
    hasRiskWait = true;
    blockingReasons.push(
      `Riesgo sobre capital total elevado (${estimatedRiskPctOfCapital.toFixed(2)}% > ${MAX_CAPITAL_RISK_PCT_VIABLE.toFixed(1)}%): considere reducir el % de capital por operación.`
    );
  }

  // Informative technical risk notes (always auditable)
  riskNotes.push(
    `Stop Loss técnico calculado en ${formatPrice(stopLossPrice, market.priceDecimals)} = S1 (${formatPrice(s1, market.priceDecimals)}) − 0,5×ATR(14) (${formatPrice(stopLossAtrBuffer, market.priceDecimals)}).`
  );
  riskNotes.push(
    `Peor escenario (SL): pérdida estimada de -${estimatedRiskUsdt.toFixed(2)} USDT (-${estimatedRiskPctOfCapital.toFixed(2)}% del capital total), incluyendo comisiones y spread.`
  );
  riskNotes.push(
    `Escenario objetivo (R1 en ${formatPrice(takeProfitPrice, market.priceDecimals)}): retorno neto estimado de ${netReturnUsdt >= 0 ? '+' : ''}${netReturnUsdt.toFixed(2)} USDT tras costos; nunca representa ganancia garantizada.`
  );

  let state: SimulationViabilityState = 'VIABLE';
  if (hasHardNoViable) {
    state = 'NOT_VIABLE';
  } else if (hasRiskWait) {
    state = 'RISK_WAIT';
  } else {
    state = 'VIABLE';
  }

  return {
    marketId: opp.marketId,
    state,
    stateLabel: stateLabelFor(state),
    isAllowed: state === 'VIABLE' && decision.state === 'BUY',
    decisionState: decision.state,
    availableCapitalUsdt,
    capitalAllocationPct,
    positionSizeUsdt,
    entryPrice: entry,
    stopLossPrice,
    stopLossAtrBuffer,
    stopLossInAtr,
    takeProfitPrice,
    s1Price: s1,
    r1Price: r1,
    atr14: atr,
    slDistanceAbs,
    slDistancePct,
    tpDistanceAbs,
    tpDistancePct,
    buyFeePct,
    sellFeePct,
    buyFeeUsdt,
    sellFeeUsdtTp,
    sellFeeUsdtSl,
    totalFeesTpUsdt,
    spreadAbs,
    spreadPct: spPct,
    spreadCostUsdt,
    totalCostsTpUsdt,
    grossRiskUsdt,
    estimatedRiskUsdt,
    estimatedRiskPctOfPosition,
    estimatedRiskPctOfCapital,
    grossReturnUsdt,
    grossReturnPct,
    netReturnUsdt,
    netReturnPctOfPosition,
    netReturnPctOfCapital,
    grossRiskRewardRatio,
    netRiskRewardRatio,
    blockingReasons,
    riskNotes,
    updatedAt: opp.updatedAt,
  };
}
