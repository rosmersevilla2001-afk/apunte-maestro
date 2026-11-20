import { useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  MARKET_MAP,
  NO_DATA_LABEL,
  formatPrice,
  formatSignedPercent,
} from '../config/markets';
import type {
  DailyAccumulatedStats,
  FeeConfig,
  LimitOperationPlan,
  LimitOperationState,
  LimitPlanConfig,
  MarketId,
  MarketOpportunity,
  TrackedLimitOperation,
} from '../types/market';

interface LimitOperationPanelProps {
  selectedMarketId: MarketId;
  onSelectMarket: (id: MarketId) => void;
  opportunities: MarketOpportunity[];
  limitPlansByMarket: Record<MarketId, LimitOperationPlan>;
  activePlan: LimitOperationPlan | null;
  limitConfig: LimitPlanConfig;
  onChangeLimitConfig: (next: LimitPlanConfig) => void;
  feeConfig: FeeConfig;
  onChangeFees: (next: FeeConfig) => void;
  dailyStats: DailyAccumulatedStats;
  onRecordDailyProfit: (deltaUsdt: number) => void;
  onResetDailyProfit: () => void;
  trackedLimitsByMarket: Partial<Record<MarketId, TrackedLimitOperation>>;
  onTrackManualLimit: (plan: LimitOperationPlan) => void;
  onClearTrackedLimit: (id: MarketId) => void;
  isBinanceLive: boolean;
}

function limitStateStyle(state: LimitOperationState): {
  text: string;
  border: string;
  bg: string;
} {
  if (state === 'COMPRAR LIMIT') {
    return {
      text: 'text-[#0ECB81]',
      border: 'border-[#0ECB81]/35',
      bg: 'bg-[#0ECB81]/10',
    };
  }
  if (state === 'ESPERAR') {
    return {
      text: 'text-[#F0B90B]',
      border: 'border-[#F0B90B]/35',
      bg: 'bg-[#F0B90B]/10',
    };
  }
  return {
    text: 'text-[#F6465D]',
    border: 'border-[#F6465D]/35',
    bg: 'bg-[#F6465D]/10',
  };
}

function formatUsdt(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA_LABEL;
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return `$${formatted} USDT`;
  if (value > 0) return `+$${formatted} USDT`;
  if (value < 0) return `-$${formatted} USDT`;
  return `$0.00 USDT`;
}

export function LimitOperationPanel({
  selectedMarketId,
  onSelectMarket,
  opportunities,
  limitPlansByMarket,
  activePlan,
  limitConfig,
  onChangeLimitConfig,
  feeConfig,
  onChangeFees,
  dailyStats,
  onRecordDailyProfit,
  onResetDailyProfit,
  trackedLimitsByMarket,
  onTrackManualLimit,
  onClearTrackedLimit,
  isBinanceLive,
}: LimitOperationPanelProps) {
  const [manualProfitInput, setManualProfitInput] = useState<string>('');
  const activeMarket = MARKET_MAP[selectedMarketId];
  const activeStyle = activePlan ? limitStateStyle(activePlan.state) : null;
  const activeTracked = trackedLimitsByMarket[selectedMarketId] ?? null;

  const isModified =
    Math.abs(limitConfig.baseCapitalUsdt - 1300) > 0.0001 ||
    Math.abs(limitConfig.maxExposurePct - 35) > 0.0001 ||
    Math.abs(limitConfig.minNetProfitUsdt - 2) > 0.0001 ||
    Math.abs(feeConfig.buyFeePct - 0.1) > 0.0001 ||
    Math.abs(feeConfig.sellFeePct - 0.1) > 0.0001;

  const handleNumberInput = (
    field: 'baseCapitalUsdt' | 'maxExposurePct' | 'minNetProfitUsdt',
    raw: string,
    maxVal: number
  ) => {
    const normalized = raw.replace(',', '.');
    if (normalized === '') {
      onChangeLimitConfig({ ...limitConfig, [field]: 0 });
      return;
    }
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return;
    onChangeLimitConfig({
      ...limitConfig,
      [field]: Math.max(0, Math.min(maxVal, parsed)),
    });
  };

  const handleFeeChange = (field: 'buyFeePct' | 'sellFeePct', raw: string) => {
    const normalized = raw.replace(',', '.');
    if (normalized === '') {
      onChangeFees({ ...feeConfig, [field]: 0 });
      return;
    }
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return;
    onChangeFees({
      ...feeConfig,
      [field]: Math.max(0, Math.min(5, parsed)),
    });
  };

  const handleResetDefaults = () => {
    onChangeLimitConfig({
      baseCapitalUsdt: 1300,
      maxExposurePct: 35,
      dailyTargetMinUsdt: 6,
      dailyTargetMaxUsdt: 10,
      minNetProfitUsdt: 2,
    });
    onChangeFees({
      buyFeePct: 0.1,
      sellFeePct: 0.1,
    });
  };

  const handleAddDailyResult = () => {
    const parsed = parseFloat(manualProfitInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed === 0) return;
    onRecordDailyProfit(parsed);
    setManualProfitInput('');
  };

  return (
    <section
      aria-label="Motor de Operación LIMIT Manual"
      className="mt-4 border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      {/* Header + Configurable Capital, Max Exposure, Min Net Profit, Fees */}
      <div className="flex flex-col gap-3 border-b border-[#1F2735] px-4 py-3.5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Target className="h-4 w-4 shrink-0 text-[#F0B90B]" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-[#EAECEF]">
              Plan de Operación LIMIT Manual
            </h2>
            <span className="text-xs text-[#848E9C]">
              · Objetivo diario $6–$10 USDT netos · {selectedMarketId}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Solo COMPRA LIMIT (S1 + ATR) y VENTA LIMIT (R1) manuales. Sin órdenes de mercado, sin Stop Loss obligatorio y sin ejecución automática.
          </p>
        </div>

        {/* Editable Parameters */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>Capital</span>
            <input
              type="number"
              min="0"
              max="10000000"
              step="50"
              value={limitConfig.baseCapitalUsdt}
              onChange={(e) => handleNumberInput('baseCapitalUsdt', e.target.value, 10_000_000)}
              aria-label="Capital base configurable en USDT"
              className="w-24 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">USDT</span>
          </label>

          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>Expos. máx.</span>
            <input
              type="number"
              min="1"
              max="100"
              step="5"
              value={limitConfig.maxExposurePct}
              onChange={(e) => handleNumberInput('maxExposurePct', e.target.value, 100)}
              aria-label="Límite máximo de exposición por operación en porcentaje"
              className="w-16 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">%</span>
          </label>

          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>Neto mín.</span>
            <input
              type="number"
              min="0"
              max="500"
              step="0.5"
              value={limitConfig.minNetProfitUsdt}
              onChange={(e) => handleNumberInput('minNetProfitUsdt', e.target.value, 500)}
              aria-label="Beneficio neto mínimo por operación en USDT"
              className="w-16 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">USDT</span>
          </label>

          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>Compra</span>
            <input
              type="number"
              min="0"
              max="5"
              step="0.01"
              value={feeConfig.buyFeePct}
              onChange={(e) => handleFeeChange('buyFeePct', e.target.value)}
              aria-label="Comisión de compra en porcentaje"
              className="w-16 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">%</span>
          </label>

          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>Venta</span>
            <input
              type="number"
              min="0"
              max="5"
              step="0.01"
              value={feeConfig.sellFeePct}
              onChange={(e) => handleFeeChange('sellFeePct', e.target.value)}
              aria-label="Comisión de venta en porcentaje"
              className="w-16 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">%</span>
          </label>

          {isModified && (
            <button
              type="button"
              onClick={handleResetDefaults}
              title="Restablecer valores iniciales (1.300 USDT · 35% máx · $2 mín · 0,10% / 0,10%)"
              className="flex items-center gap-1 rounded border border-[#242D3D] bg-[#0E131B] px-2 py-1 text-[11px] text-[#B7BDC6] transition-colors hover:border-[#364359] hover:text-[#EAECEF] cursor-pointer"
            >
              <RotateCcw className="h-3 w-3 text-[#F0B90B]" />
              <span>Restablecer</span>
            </button>
          )}
        </div>
      </div>

      {/* Daily Accumulated Goal Strip ($6–$10 USDT Net) */}
      <div className="border-b border-[#1F2735] bg-[#0E131B] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono tabular-nums text-xs sm:grid-cols-4">
            <div>
              <div className="font-sans text-[11px] text-[#848E9C]">Objetivo diario</div>
              <div className="mt-0.5 font-bold text-[#F0B90B]">
                ${dailyStats.targetMinUsdt.toFixed(0)}–${dailyStats.targetMaxUsdt.toFixed(0)} USDT
              </div>
            </div>

            <div>
              <div className="font-sans text-[11px] text-[#848E9C]">Ganancia registrada hoy</div>
              <div
                className={`mt-0.5 font-bold ${
                  dailyStats.realizedUsdt > 0
                    ? 'text-[#0ECB81]'
                    : dailyStats.realizedUsdt < 0
                      ? 'text-[#F6465D]'
                      : 'text-[#EAECEF]'
                }`}
              >
                {formatUsdt(dailyStats.realizedUsdt, true)}
              </div>
            </div>

            <div>
              <div className="font-sans text-[11px] text-[#848E9C]">Restante ($6 / $10)</div>
              <div className="mt-0.5 font-semibold text-[#EAECEF]">
                ${dailyStats.remainingToMinUsdt.toFixed(2)} / ${dailyStats.remainingToMaxUsdt.toFixed(2)}
              </div>
            </div>

            <div>
              <div className="font-sans text-[11px] text-[#848E9C]">Estado del objetivo</div>
              <div
                className={`mt-0.5 font-sans text-xs font-semibold ${
                  dailyStats.goalCompleted
                    ? 'text-[#0ECB81]'
                    : dailyStats.realizedUsdt >= dailyStats.targetMinUsdt
                      ? 'text-[#0ECB81]'
                      : 'text-[#B7BDC6]'
                }`}
              >
                {dailyStats.status}
              </div>
            </div>
          </div>

          {/* Manual daily realized profit recorder (100% local, zero exchange API) */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="number"
              step="0.5"
              placeholder="Ej: 4.50"
              value={manualProfitInput}
              onChange={(e) => setManualProfitInput(e.target.value)}
              aria-label="Registrar ganancia neta manual del día en USDT"
              className="w-24 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] placeholder:text-[#4B5565] focus:border-[#F0B90B] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddDailyResult}
              className="flex items-center gap-1 rounded border border-[#242D3D] bg-[#141B26] px-2.5 py-1 text-[11px] font-medium text-[#EAECEF] transition-colors hover:border-[#364359] hover:text-[#F0B90B] cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span>Registrar neto</span>
            </button>
            {dailyStats.realizedUsdt !== 0 && (
              <button
                type="button"
                onClick={onResetDailyProfit}
                className="rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-[11px] text-[#848E9C] transition-colors hover:text-[#EAECEF] cursor-pointer"
              >
                Reiniciar día
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar toward $10 daily goal + strict discipline note */}
        <div className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-1.5 w-full max-w-md overflow-hidden rounded-sm bg-[#1A212E]">
            <div
              className="h-full bg-[#0ECB81] transition-[width] duration-200"
              style={{ width: `${dailyStats.progressToMaxPct}%` }}
            />
          </div>
          <span className="text-[11px] text-[#848E9C]">
            Nunca se bajan los filtros 11/11 para completar la meta ni se aumenta exposición tras alcanzar $10.
          </span>
        </div>
      </div>

      {/* Active Market LIMIT Plan Banner */}
      {activePlan && activeStyle && (
        <div className="flex flex-col justify-between gap-2 border-b border-[#1F2735] bg-[#11161F] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded border px-2.5 py-0.5 font-display text-xs font-bold tracking-wide ${activeStyle.border} ${activeStyle.bg} ${activeStyle.text}`}
            >
              {activePlan.stateLabel}
            </span>

            {activePlan.isAdditionalOpportunity && (
              <span className="flex items-center gap-1 rounded border border-[#F0B90B]/35 bg-[#F0B90B]/10 px-2 py-0.5 font-display text-[11px] font-semibold text-[#F0B90B]">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>Oportunidad adicional</span>
              </span>
            )}

            <span className="text-xs text-[#EAECEF]">
              Mercado: <strong>{activePlan.marketId}</strong>
            </span>

            <span className="font-mono tabular-nums text-xs text-[#848E9C]">
              · Exposición máx.: ${activePlan.maxAllowedCapitalUsdt.toFixed(0)} USDT ({activePlan.maxExposurePct}%)
            </span>
          </div>

          {/* Read-only manual LIMIT structure tracker (monitors S1 invalidation without selling) */}
          <div className="flex items-center gap-2">
            {activeTracked ? (
              <button
                type="button"
                onClick={() => onClearTrackedLimit(selectedMarketId)}
                className="flex items-center gap-1.5 rounded border border-[#F0B90B]/40 bg-[#F0B90B]/10 px-2.5 py-1 text-[11px] font-medium text-[#F0B90B] transition-colors hover:bg-[#F0B90B]/15 cursor-pointer"
              >
                <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>En seguimiento S1 ({formatPrice(activeTracked.s1InvalidationPrice, activeMarket.priceDecimals)}) · Quitar</span>
              </button>
            ) : (
              activePlan.buyLimitPrice !== null &&
              activePlan.sellLimitPrice !== null &&
              activePlan.s1Price !== null && (
                <button
                  type="button"
                  onClick={() => onTrackManualLimit(activePlan)}
                  className="flex items-center gap-1.5 rounded border border-[#242D3D] bg-[#0E131B] px-2.5 py-1 text-[11px] font-medium text-[#B7BDC6] transition-colors hover:border-[#364359] hover:text-[#EAECEF] cursor-pointer"
                  title="Seguimiento local solo lectura para alertar si el precio rompe S1 (no envía órdenes)"
                >
                  <BookmarkPlus className="h-3.5 w-3.5 text-[#F0B90B]" aria-hidden="true" />
                  <span>Seguir LIMIT manual (alerta S1)</span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      {!isBinanceLive ? (
        <div className="px-4 py-6 text-xs text-[#F6465D] flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>🔴 NO COMPRAR:</strong> Binance está sin conexión. No se generan niveles BUY LIMIT ni VENTA LIMIT hasta recibir datos reales en vivo.
          </span>
        </div>
      ) : !activePlan ? (
        <div className="px-4 py-6 text-center text-xs text-[#848E9C]">
          {NO_DATA_LABEL} · Esperando indicadores reales de Binance para {selectedMarketId}.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Status / Invalidation / Additional Opportunity Callout */}
          {activePlan.state === 'INVALIDADA' ? (
            <div className="rounded border border-[#F6465D]/40 bg-[#F6465D]/10 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F6465D]">
                <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>OPERACIÓN LIMIT INVALIDADA — Pérdida de estructura / soporte S1</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#EAECEF]">
                {activePlan.invalidationReason ??
                  'El precio perdió la referencia estructural S1. No se vende automáticamente; revisar manualmente en Binance.'}
              </p>
            </div>
          ) : activePlan.blockingReasons.length > 0 ? (
            <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
              <div
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  activePlan.state === 'NO COMPRAR' ? 'text-[#F6465D]' : 'text-[#F0B90B]'
                }`}
              >
                {activePlan.state === 'NO COMPRAR' ? (
                  <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {activePlan.state === 'NO COMPRAR'
                    ? 'No recomendada (🔴 NO COMPRAR)'
                    : 'En espera (🟡 ESPERAR — no forzar operación)'}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-[#B7BDC6]">
                {activePlan.blockingReasons.map((reason, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded border border-[#0ECB81]/30 bg-[#0ECB81]/10 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0ECB81]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Plan LIMIT manual habilitado (11/11 · 4H/1H/15M + Confirmación 5M cerrada + Dirección de Mercado)
                </span>
              </div>
              {activePlan.additionalReason && (
                <p className="text-xs text-[#F0B90B]">{activePlan.additionalReason}</p>
              )}
              <ul className="space-y-0.5 text-xs text-[#EAECEF]">
                {activePlan.reasons.map((r, idx) => (
                  <li key={idx}>• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Core LIMIT Plan Parameters Grid */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#1A212E] py-3 font-mono tabular-nums text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Entrada BUY LIMIT</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#0ECB81]">
                {activePlan.buyLimitPrice !== null
                  ? formatPrice(activePlan.buyLimitPrice, activeMarket.priceDecimals)
                  : NO_DATA_LABEL}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">
                {activePlan.buyLimitDistancePct !== null
                  ? `-${activePlan.buyLimitDistancePct.toFixed(2)}% bajo mercado (S1+ATR)`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">VENTA LIMIT (R1)</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#F0B90B]">
                {activePlan.sellLimitPrice !== null
                  ? formatPrice(activePlan.sellLimitPrice, activeMarket.priceDecimals)
                  : NO_DATA_LABEL}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">
                {activePlan.grossSpreadPct !== null
                  ? `Recorrido bruto +${activePlan.grossSpreadPct.toFixed(2)}%`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Capital recomendado</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#EAECEF]">
                {formatUsdt(activePlan.recommendedCapitalUsdt)}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">
                {activePlan.recommendedExposurePct !== null
                  ? `${activePlan.recommendedExposurePct.toFixed(1)}% de $${activePlan.baseCapitalUsdt.toFixed(0)} (máx ${activePlan.maxExposurePct}%)`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Ganancia neta est.</dt>
              <dd
                className={`mt-0.5 text-sm font-bold ${
                  activePlan.netProfitUsdt !== null
                    ? activePlan.netProfitUsdt >= limitConfig.minNetProfitUsdt
                      ? 'text-[#0ECB81]'
                      : activePlan.netProfitUsdt > 0
                        ? 'text-[#F0B90B]'
                        : 'text-[#F6465D]'
                    : 'text-[#848E9C]'
                }`}
              >
                {formatUsdt(activePlan.netProfitUsdt, true)}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">No es ganancia garantizada</p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Porcentaje neto</dt>
              <dd
                className={`mt-0.5 text-sm font-bold ${
                  activePlan.netProfitPct !== null
                    ? activePlan.netProfitPct > 0
                      ? 'text-[#0ECB81]'
                      : 'text-[#F6465D]'
                    : 'text-[#848E9C]'
                }`}
              >
                {activePlan.netProfitPct !== null
                  ? formatSignedPercent(activePlan.netProfitPct)
                  : NO_DATA_LABEL}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">
                Tras comis. + spread real
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Aporte al objetivo diario</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#F0B90B]">
                {activePlan.dailyGoalContributionMinPct !== null &&
                activePlan.netProfitUsdt !== null &&
                activePlan.netProfitUsdt > 0
                  ? `${Math.round(activePlan.dailyGoalContributionMinPct)}% de $6`
                  : NO_DATA_LABEL}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">
                {activePlan.dailyGoalContributionMaxPct !== null &&
                activePlan.netProfitUsdt !== null &&
                activePlan.netProfitUsdt > 0
                  ? `${Math.round(activePlan.dailyGoalContributionMaxPct)}% de $10`
                  : 'Sin aporte positivo'}
              </p>
            </div>
          </dl>

          {/* Secondary Breakdown: Dynamic Capital Needed ($6/$10) + Real Execution Costs */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Capital Sizing & Structural References */}
            <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-[#1A212E] pb-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold text-[#EAECEF]">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[#0ECB81]" aria-hidden="true" />
                  <span>Estructura LIMIT y cálculo dinámico de capital</span>
                </h3>
                <span className="font-mono text-[11px] text-[#848E9C]">Solo manual</span>
              </div>

              <dl className="mt-2.5 space-y-2 font-mono tabular-nums text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Precio actual / Soporte S1</dt>
                  <dd className="text-[#EAECEF]">
                    {activePlan.currentPrice !== null
                      ? formatPrice(activePlan.currentPrice, activeMarket.priceDecimals)
                      : NO_DATA_LABEL}{' '}
                    /{' '}
                    <span className="text-[#0ECB81]">
                      {activePlan.s1Price !== null
                        ? formatPrice(activePlan.s1Price, activeMarket.priceDecimals)
                        : NO_DATA_LABEL}
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Base BUY LIMIT (S1 + ATR)</dt>
                  <dd className="text-[#B7BDC6]">
                    {activePlan.buyLimitBasis ?? NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Capital necesario para $6 netos</dt>
                  <dd className="text-[#EAECEF]">
                    {activePlan.capitalNeededForMinGoalUsdt !== null
                      ? formatUsdt(activePlan.capitalNeededForMinGoalUsdt)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Capital necesario para $10 netos</dt>
                  <dd className="text-[#EAECEF]">
                    {activePlan.capitalNeededForMaxGoalUsdt !== null
                      ? formatUsdt(activePlan.capitalNeededForMaxGoalUsdt)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Real Execution Costs (Buy Fee + Sell Fee + Real Spread) */}
            <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-[#1A212E] pb-2">
                <h3 className="font-display text-xs font-semibold text-[#EAECEF]">
                  Desglose de ganancia neta y costos reales
                </h3>
                <span className="font-mono text-[11px] text-[#848E9C]">Spot Binance</span>
              </div>

              <dl className="mt-2.5 space-y-2 font-mono tabular-nums text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Ganancia bruta estimada</dt>
                  <dd className="text-[#0ECB81]">
                    {formatUsdt(activePlan.grossProfitUsdt, true)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">
                    Comisión compra ({activePlan.buyFeePct.toFixed(2).replace('.', ',')}%) + venta (
                    {activePlan.sellFeePct.toFixed(2).replace('.', ',')}%)
                  </dt>
                  <dd className="text-[#B7BDC6]">
                    {activePlan.buyFeeUsdt !== null && activePlan.sellFeeUsdt !== null
                      ? formatUsdt(-(activePlan.buyFeeUsdt + activePlan.sellFeeUsdt), true)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">
                    Spread real (
                    {activePlan.spreadPct !== null
                      ? `${activePlan.spreadPct.toFixed(3)}%`
                      : NO_DATA_LABEL}
                    )
                  </dt>
                  <dd className="text-[#F0B90B]">
                    {activePlan.spreadCostUsdt !== null
                      ? formatUsdt(-activePlan.spreadCostUsdt, true)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[#1A212E] pt-2">
                  <dt className="font-sans font-medium text-[#EAECEF]">Ganancia neta tras costos</dt>
                  <dd
                    className={`font-bold ${
                      activePlan.netProfitUsdt !== null
                        ? activePlan.netProfitUsdt > 0
                          ? 'text-[#0ECB81]'
                          : 'text-[#F6465D]'
                        : 'text-[#848E9C]'
                    }`}
                  >
                    {formatUsdt(activePlan.netProfitUsdt, true)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* 4-Market Manual LIMIT Plan Comparison Table */}
          <div className="border-t border-[#1A212E] pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xs font-semibold text-[#EAECEF]">
                Planes LIMIT manuales por mercado (4 mercados Spot)
              </h3>
              <span className="text-[11px] text-[#848E9C]">
                Haz clic en un mercado para auditar su plan LIMIT completo
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left font-mono tabular-nums text-[11px]">
                <thead>
                  <tr className="border-b border-[#1F2735] text-[#848E9C]">
                    <th className="py-2 pr-3 font-sans font-medium">Mercado</th>
                    <th className="py-2 pr-3 font-sans font-medium">Estado LIMIT</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">Entrada LIMIT</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">Venta LIMIT (R1)</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">Capital recom.</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">Ganancia neta</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">% Neto</th>
                    <th className="py-2 text-right font-sans font-medium">Aporte meta $6/$10</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171D29]">
                  {opportunities.map((opp) => {
                    const plan = limitPlansByMarket[opp.marketId];
                    const market = MARKET_MAP[opp.marketId];
                    if (!plan) return null;
                    const rowStyle = limitStateStyle(plan.state);
                    const isRowSelected = opp.marketId === selectedMarketId;

                    return (
                      <tr
                        key={opp.marketId}
                        onClick={() => onSelectMarket(opp.marketId)}
                        className={`cursor-pointer transition-colors ${
                          isRowSelected ? 'bg-[#151C28]' : 'hover:bg-[#131924]'
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-display font-bold text-[#EAECEF]">
                          {opp.marketId}
                          {plan.isAdditionalOpportunity && (
                            <span className="ml-1.5 font-sans text-[10px] font-medium text-[#F0B90B]">
                              · Adicional
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 font-display text-[11px] font-bold ${rowStyle.border} ${rowStyle.bg} ${rowStyle.text}`}
                          >
                            {plan.stateLabel}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#0ECB81]">
                          {plan.buyLimitPrice !== null
                            ? formatPrice(plan.buyLimitPrice, market.priceDecimals)
                            : NO_DATA_LABEL}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#F0B90B]">
                          {plan.sellLimitPrice !== null
                            ? formatPrice(plan.sellLimitPrice, market.priceDecimals)
                            : NO_DATA_LABEL}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#EAECEF]">
                          {plan.recommendedCapitalUsdt !== null
                            ? `$${plan.recommendedCapitalUsdt.toFixed(0)} USDT`
                            : NO_DATA_LABEL}
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right font-semibold ${
                            plan.netProfitUsdt !== null
                              ? plan.netProfitUsdt >= limitConfig.minNetProfitUsdt
                                ? 'text-[#0ECB81]'
                                : plan.netProfitUsdt > 0
                                  ? 'text-[#F0B90B]'
                                  : 'text-[#F6465D]'
                              : 'text-[#848E9C]'
                          }`}
                        >
                          {plan.netProfitUsdt !== null
                            ? `${plan.netProfitUsdt >= 0 ? '+' : ''}$${plan.netProfitUsdt.toFixed(2)}`
                            : NO_DATA_LABEL}
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right ${
                            plan.netProfitPct !== null
                              ? plan.netProfitPct > 0
                                ? 'text-[#0ECB81]'
                                : 'text-[#F6465D]'
                              : 'text-[#848E9C]'
                          }`}
                        >
                          {plan.netProfitPct !== null
                            ? formatSignedPercent(plan.netProfitPct)
                            : NO_DATA_LABEL}
                        </td>
                        <td className="py-2.5 text-right text-[#B7BDC6]">
                          {plan.dailyGoalContributionMinPct !== null &&
                          plan.dailyGoalContributionMaxPct !== null &&
                          plan.netProfitUsdt !== null &&
                          plan.netProfitUsdt > 0
                            ? `${Math.round(plan.dailyGoalContributionMinPct)}% / ${Math.round(plan.dailyGoalContributionMaxPct)}%`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
