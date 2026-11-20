export type MarketId = 'USDT/COP' | 'USDT/BRL' | 'USDT/MXN' | 'USDT/EUR';

export type Timeframe = '5m' | '15m' | '1h' | '4h';

export interface MarketConfig {
  id: MarketId;
  baseAsset: string;
  quoteAsset: string;
  quoteName: string;
  quoteSymbol: string;
  binanceSymbol: string;
  inverted: boolean;
  priceDecimals: number;
  qtyDecimals: number;
  tickSize: number;
}

export interface Ticker24h {
  marketId: MarketId;
  price: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  openPrice: number | null;
  volumeBase: number | null;
  volumeQuote: number | null;
  bidPrice: number | null;
  bidQty: number | null;
  askPrice: number | null;
  askQty: number | null;
  tradeCount: number | null;
  updatedAt: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookData {
  marketId: MarketId;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  updatedAt: number;
}

export interface Candle {
  time: number; // Unix timestamp in seconds (required by lightweight-charts)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export type ConnectionState =
  | 'connecting'
  | 'connected_ws'
  | 'fallback_rest'
  | 'reconnecting'
  | 'error';

export interface ConnectionInfo {
  state: ConnectionState;
  isLive: boolean;
  protocol: 'WebSocket' | 'REST';
  restEndpoint: string;
  wsEndpoint: string;
  activeStreams: string[];
  lastUpdatedAt: number | null;
  lastError: string | null;
  reconnectAttempts: number;
}

export type TrendDirection = 'Alcista' | 'Bajista' | 'Lateral';
export type VolumeRating = 'Alto' | 'Normal' | 'Bajo';
export type VolatilityRating = 'Alta' | 'Moderada' | 'Baja';
export type MomentumState =
  | 'Alcista fuerte'
  | 'Alcista'
  | 'Neutral'
  | 'Bajista'
  | 'Bajista fuerte';

export interface PriceLevel {
  price: number;
  distancePct: number;
  touches: number;
  source: string;
}

export interface PreviousDayAnalysis {
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  rangePct: number;
  volumeBase: number;
  positionLabel: 'Sobre máx. día ant.' | 'Dentro rango día ant.' | 'Bajo mín. día ant.';
  candlesUsed: number;
  sourceTimeframe: Timeframe;
}

export interface CandleStructureAnalysis {
  swingStructure: string;
  lastCandlePattern: string;
  lastCandleDirection: 'Alcista' | 'Bajista' | 'Doji';
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
  bullishCountLast10: number;
  bearishCountLast10: number;
}

export interface TimeframeSnapshot {
  timeframe: Timeframe;
  candleCount: number;
  trend: TrendDirection | null;
  ma7: number | null;
  ma25: number | null;
  ma99: number | null;
  rsi14: number | null;
  relativeVolume: number | null;
}

export interface TechnicalAnalysis {
  // Moving Averages
  ma7: number | null;
  ma25: number | null;
  ma99: number | null;
  ma7Series: Array<{ time: number; value: number }>;
  ma25Series: Array<{ time: number; value: number }>;
  ma99Series: Array<{ time: number; value: number }>;

  // Trend
  trend: TrendDirection | null;
  trendDetail: string | null;

  // Supports & Resistances
  supports: PriceLevel[];
  resistances: PriceLevel[];

  // Volume & Relative Volume
  volumeCurrent: number | null;
  volumeLastClosed: number | null;
  volumeAvg20: number | null;
  relativeVolume: number | null;
  volumeRating: VolumeRating | null;
  bidPressurePct: number | null;

  // Volatility
  atr14: number | null;
  volatilityPct: number | null;
  volatilityRating: VolatilityRating | null;

  // Momentum
  rsi14: number | null;
  roc10: number | null;
  momentumState: MomentumState | null;

  // Candle Structure
  candleStructure: CandleStructureAnalysis | null;

  // Previous Day Context
  previousDay: PreviousDayAnalysis | null;

  // Multi-timeframe overview (5M, 15M, 1H, 4H)
  multiTimeframe: TimeframeSnapshot[];

  // Live spread context
  spreadPct: number | null;
  candlesAnalyzed: number;
}

export interface FeeConfig {
  buyFeePct: number;
  sellFeePct: number;
}

export interface OpportunityScoreBreakdown {
  trend: number; // max 20
  supportResistance: number; // max 20
  momentum: number; // max 10
  volume: number; // max 10
  liquiditySpreadBook: number; // max 15
  volatilityAtr: number; // max 10
  previousDay: number; // max 10
  postFeePotential: number; // max 5
}

export interface MarketOpportunity {
  marketId: MarketId;
  rank: number | null;
  isValid: boolean;
  invalidReason: string | null;
  score: number | null; // 0..100 when valid, null when invalid
  breakdown: OpportunityScoreBreakdown | null;
  price: number | null;
  trend4h: TrendDirection | null;
  trend1h: TrendDirection | null;
  trend15m: TrendDirection | null;
  trendSummary: string | null;
  support: PriceLevel | null;
  resistance: PriceLevel | null;
  momentumState: MomentumState | null;
  rsi14: number | null;
  roc10: number | null;
  volumeRating: VolumeRating | null;
  relativeVolume: number | null;
  spreadAbs: number | null;
  spreadPct: number | null;
  bidPressurePct: number | null;
  orderBookDepthUsdt: number | null;
  volatilityRating: VolatilityRating | null;
  atr14: number | null;
  volatilityPct: number | null;
  previousDay: PreviousDayAnalysis | null;
  grossPotentialPct: number | null;
  totalFeesPct: number;
  netPotentialAfterFeesPct: number | null;
  reasonsFor: string[];
  risks: string[];
  updatedAt: number | null;
}

export type DecisionState = 'BUY' | 'WAIT' | 'NO TRADE';
export type DecisionCheckStatus = 'pass' | 'warn' | 'block' | 'no_data';

export interface DecisionCheck {
  id: string;
  label: string;
  status: DecisionCheckStatus;
  detail: string;
}

export interface TechnicalEntryZone {
  low: number;
  high: number;
}

export type Confirmation5mStatus = 'pass' | 'warn' | 'no_data';

export interface Confirmation5mAnalysis {
  status: Confirmation5mStatus;
  statusLabel: 'Confirmada' | 'Esperar' | 'Sin datos';
  trend: TrendDirection | null;
  rsi14: number | null;
  roc10: number | null;
  lastCandleDirection: 'Alcista' | 'Bajista' | 'Doji' | null;
  lastCandlePattern: string | null;
  summary: string;
}

export interface MarketDecision {
  marketId: MarketId;
  state: DecisionState;
  opportunityScore: number | null; // Audited independently from state
  confidence: number | null; // 0..100 (populated for BUY, null for WAIT/NO TRADE or invalid)
  price: number | null;
  entryZone: TechnicalEntryZone | null;
  s1: PriceLevel | null;
  r1: PriceLevel | null;
  netPotentialAfterFeesPct: number | null;
  primaryRisk: string;
  activationReasons: string[];
  blockingConditions: string[];
  confirmation5m: Confirmation5mAnalysis;
  checks: DecisionCheck[];
  passedCount: number;
  totalChecks: number;
  updatedAt: number | null;
}

export interface SimulationConfig {
  availableCapitalUsdt: number;
  capitalAllocationPct: number;
}

export type SimulationViabilityState = 'VIABLE' | 'RISK_WAIT' | 'NOT_VIABLE';

export interface TradeSimulation {
  marketId: MarketId;
  state: SimulationViabilityState;
  stateLabel: '🟢 OPERACIÓN VIABLE' | '🟡 RIESGO / ESPERAR' | '🔴 NO VIABLE';
  isAllowed: boolean;
  decisionState: DecisionState;
  availableCapitalUsdt: number;
  capitalAllocationPct: number;
  positionSizeUsdt: number | null;
  entryPrice: number | null;
  stopLossPrice: number | null;
  stopLossAtrBuffer: number | null;
  stopLossInAtr: number | null;
  takeProfitPrice: number | null;
  s1Price: number | null;
  r1Price: number | null;
  atr14: number | null;
  slDistanceAbs: number | null;
  slDistancePct: number | null;
  tpDistanceAbs: number | null;
  tpDistancePct: number | null;
  // Costs
  buyFeePct: number;
  sellFeePct: number;
  buyFeeUsdt: number | null;
  sellFeeUsdtTp: number | null;
  sellFeeUsdtSl: number | null;
  totalFeesTpUsdt: number | null;
  spreadAbs: number | null;
  spreadPct: number | null;
  spreadCostUsdt: number | null;
  totalCostsTpUsdt: number | null;
  // Worst-case risk (Stop Loss)
  grossRiskUsdt: number | null;
  estimatedRiskUsdt: number | null;
  estimatedRiskPctOfPosition: number | null;
  estimatedRiskPctOfCapital: number | null;
  // Target scenario (R1)
  grossReturnUsdt: number | null;
  grossReturnPct: number | null;
  netReturnUsdt: number | null;
  netReturnPctOfPosition: number | null;
  netReturnPctOfCapital: number | null;
  // Risk / Reward
  grossRiskRewardRatio: number | null;
  netRiskRewardRatio: number | null;
  // Audit messages
  blockingReasons: string[];
  riskNotes: string[];
  updatedAt: number | null;
}

export type BacktestPeriodPreset = 'all' | '48h' | '24h';

export type BacktestOutcome = 'ganador' | 'perdedor' | 'sin resultado';

export interface BacktestSignalRecord {
  id: string;
  barIndex: number;
  timestampSec: number; // Close timestamp (Unix seconds) of evaluated 15M candle
  marketId: MarketId;
  entryPrice: number;
  decisionState: DecisionState;
  opportunityScore: number | null;
  tradeOpened: boolean;
  skipReason: string | null;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  exitTimestampSec: number | null;
  outcome: BacktestOutcome;
  positionSizeUsdt: number | null;
  feesUsdt: number | null;
  spreadCostUsdt: number | null;
  netResultUsdt: number | null;
  netResultPct: number | null;
  riskRewardRatio: number | null;
  durationMinutes: number | null;
  auditReason: string;
}

export interface BacktestSummary {
  totalSignals: number;
  buySignals: number;
  waitSignals: number;
  noTradeSignals: number;
  executedTrades: number;
  skippedBuySignals: number;
  winningTrades: number;
  losingTrades: number;
  unresolvedTrades: number;
  winRatePct: number | null;
  initialCapitalUsdt: number;
  finalCapitalUsdt: number;
  netResultUsdt: number;
  netResultPct: number;
  accumulatedFeesUsdt: number;
  accumulatedSpreadUsdt: number;
  maxDrawdownUsdt: number;
  maxDrawdownPct: number;
  averageRiskReward: number | null;
  bestTradeUsdt: number | null;
  bestTradeTimestampSec: number | null;
  worstTradeUsdt: number | null;
  worstTradeTimestampSec: number | null;
}

export interface MarketBacktestResult {
  marketId: MarketId;
  timeframe: '15m';
  periodPreset: BacktestPeriodPreset;
  hasSufficientData: boolean;
  insufficientReason: string | null;
  startTimestampSec: number | null;
  endTimestampSec: number | null;
  totalLoaded15mCandles: number;
  evaluatedCandles: number;
  spreadPctUsed: number | null;
  summary: BacktestSummary | null;
  records: BacktestSignalRecord[];
}

export interface LimitPlanConfig {
  baseCapitalUsdt: number; // Default 1300 USDT
  maxExposurePct: number; // Max % of base capital per single LIMIT operation (never 100% automatic)
  dailyTargetMinUsdt: number; // 6 USDT
  dailyTargetMaxUsdt: number; // 10 USDT
  minNetProfitUsdt: number; // Configurable minimum net USDT profit after fees & spread
}

export type LimitOperationState =
  | 'COMPRAR LIMIT'
  | 'ESPERAR'
  | 'NO COMPRAR'
  | 'INVALIDADA';

export interface TrackedLimitOperation {
  marketId: MarketId;
  buyLimitPrice: number;
  sellLimitPrice: number;
  s1InvalidationPrice: number;
  capitalUsdt: number;
  expectedNetUsdt: number;
  trackedAt: number;
}

export type DailyGoalStatus =
  | 'En progreso'
  | 'Rango objetivo alcanzado ($6–$10)'
  | 'Objetivo $10 completado · Adicionales activas';

export interface DailyAccumulatedStats {
  dateKey: string;
  targetMinUsdt: number;
  targetMaxUsdt: number;
  realizedUsdt: number;
  remainingToMinUsdt: number;
  remainingToMaxUsdt: number;
  progressToMinPct: number;
  progressToMaxPct: number;
  status: DailyGoalStatus;
  goalCompleted: boolean;
}

export interface LimitOperationPlan {
  marketId: MarketId;
  state: LimitOperationState;
  stateLabel:
    | '🟢 COMPRAR LIMIT'
    | '🟡 ESPERAR'
    | '🔴 NO COMPRAR'
    | '🔴 INVALIDADA';
  isRecommended: boolean;
  isAdditionalOpportunity: boolean;
  additionalReason: string | null;
  isStructurallyInvalidated: boolean;
  invalidationReason: string | null;
  decisionState: DecisionState;
  opportunityScore: number | null;
  currentPrice: number | null;
  buyLimitPrice: number | null;
  buyLimitBasis: string | null;
  buyLimitDistancePct: number | null;
  sellLimitPrice: number | null;
  sellLimitBasis: string | null;
  s1Price: number | null;
  r1Price: number | null;
  atr14: number | null;
  // Capital sizing (dynamic for $6–$10 goal within max exposure cap)
  baseCapitalUsdt: number;
  maxExposurePct: number;
  maxAllowedCapitalUsdt: number;
  capitalNeededForMinGoalUsdt: number | null;
  capitalNeededForMaxGoalUsdt: number | null;
  recommendedCapitalUsdt: number | null;
  recommendedExposurePct: number | null;
  // Gross, Costs, and Net Profit (strictly after buy fee 0.10%, sell fee 0.10%, real spread)
  grossSpreadPct: number | null;
  grossProfitUsdt: number | null;
  buyFeePct: number;
  sellFeePct: number;
  buyFeeUsdt: number | null;
  sellFeeUsdt: number | null;
  spreadPct: number | null;
  spreadCostUsdt: number | null;
  totalCostsUsdt: number | null;
  netProfitUsdt: number | null;
  netProfitPct: number | null;
  dailyGoalContributionMinPct: number | null;
  dailyGoalContributionMaxPct: number | null;
  // Audit messages
  reasons: string[];
  blockingReasons: string[];
  updatedAt: number | null;
}



