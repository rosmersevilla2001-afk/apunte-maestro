import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
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
  FeeConfig,
  MarketId,
  MarketOpportunity,
  SimulationConfig,
  SimulationViabilityState,
  TradeSimulation,
} from '../types/market';

interface TradeSimulationPanelProps {
  selectedMarketId: MarketId;
  onSelectMarket: (id: MarketId) => void;
  opportunities: MarketOpportunity[];
  simulationsByMarket: Record<MarketId, TradeSimulation>;
  activeSimulation: TradeSimulation | null;
  simulationConfig: SimulationConfig;
  onChangeSimulationConfig: (next: SimulationConfig) => void;
  feeConfig: FeeConfig;
  onChangeFees: (next: FeeConfig) => void;
  isBinanceLive: boolean;
}

function viabilityStyle(state: SimulationViabilityState): {
  text: string;
  border: string;
  bg: string;
} {
  if (state === 'VIABLE') {
    return {
      text: 'text-[#0ECB81]',
      border: 'border-[#0ECB81]/35',
      bg: 'bg-[#0ECB81]/10',
    };
  }
  if (state === 'RISK_WAIT') {
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
  if (!signed) return `${formatted} USDT`;
  if (value > 0) return `+${formatted} USDT`;
  if (value < 0) return `-${formatted} USDT`;
  return `0.00 USDT`;
}

export function TradeSimulationPanel({
  selectedMarketId,
  onSelectMarket,
  opportunities,
  simulationsByMarket,
  activeSimulation,
  simulationConfig,
  onChangeSimulationConfig,
  feeConfig,
  onChangeFees,
  isBinanceLive,
}: TradeSimulationPanelProps) {
  const activeMarket = MARKET_MAP[selectedMarketId];
  const activeStyle = activeSimulation ? viabilityStyle(activeSimulation.state) : null;

  const isModified =
    Math.abs(simulationConfig.availableCapitalUsdt - 1300) > 0.0001 ||
    Math.abs(simulationConfig.capitalAllocationPct - 10) > 0.0001 ||
    Math.abs(feeConfig.buyFeePct - 0.1) > 0.0001 ||
    Math.abs(feeConfig.sellFeePct - 0.1) > 0.0001;

  const handleCapitalChange = (raw: string) => {
    const normalized = raw.replace(',', '.');
    if (normalized === '') {
      onChangeSimulationConfig({ ...simulationConfig, availableCapitalUsdt: 0 });
      return;
    }
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return;
    onChangeSimulationConfig({
      ...simulationConfig,
      availableCapitalUsdt: Math.max(0, Math.min(10_000_000, parsed)),
    });
  };

  const handleAllocationChange = (raw: string) => {
    const normalized = raw.replace(',', '.');
    if (normalized === '') {
      onChangeSimulationConfig({ ...simulationConfig, capitalAllocationPct: 0 });
      return;
    }
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return;
    onChangeSimulationConfig({
      ...simulationConfig,
      capitalAllocationPct: Math.max(0, Math.min(100, parsed)),
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
    onChangeSimulationConfig({
      availableCapitalUsdt: 1300,
      capitalAllocationPct: 10,
    });
    onChangeFees({
      buyFeePct: 0.1,
      sellFeePct: 0.1,
    });
  };

  return (
    <section
      aria-label="Simulación de Operación"
      className="mt-4 border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      {/* Header + Editable Risk & Commission Controls */}
      <div className="flex flex-col gap-3 border-b border-[#1F2735] px-4 py-3.5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Calculator className="h-4 w-4 shrink-0 text-[#F0B90B]" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-[#EAECEF]">
              Simulación de Operación
            </h2>
            <span className="text-xs text-[#848E9C]">
              · Gestión de Riesgo · {selectedMarketId}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Cálculo técnico en vivo basado en S1 + ATR(14), R1, spread y comisiones reales. Solo simulación sin ejecución ni garantía de ganancia.
          </p>
        </div>

        {/* Editable Parameters: Capital, % Capital, Buy Fee, Sell Fee */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>Capital</span>
            <input
              type="number"
              min="0"
              max="10000000"
              step="50"
              value={simulationConfig.availableCapitalUsdt}
              onChange={(e) => handleCapitalChange(e.target.value)}
              aria-label="Capital disponible en USDT"
              className="w-24 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">USDT</span>
          </label>

          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>% Operación</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={simulationConfig.capitalAllocationPct}
              onChange={(e) => handleAllocationChange(e.target.value)}
              aria-label="Porcentaje de capital por operación"
              className="w-16 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">%</span>
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
              title="Restablecer valores iniciales (1.300 USDT · 10% · 0,10% / 0,10%)"
              className="flex items-center gap-1 rounded border border-[#242D3D] bg-[#0E131B] px-2 py-1 text-[11px] text-[#B7BDC6] transition-colors hover:border-[#364359] hover:text-[#EAECEF] cursor-pointer"
            >
              <RotateCcw className="h-3 w-3 text-[#F0B90B]" />
              <span>Restablecer</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Market Viability Banner */}
      {activeSimulation && activeStyle && (
        <div className="flex flex-col justify-between gap-2 border-b border-[#1F2735] bg-[#0E131B] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded border px-2.5 py-0.5 font-display text-xs font-bold tracking-wide ${activeStyle.border} ${activeStyle.bg} ${activeStyle.text}`}
            >
              {activeSimulation.stateLabel}
            </span>
            <span className="text-xs text-[#EAECEF]">
              Mercado seleccionado: <strong>{activeSimulation.marketId}</strong>
            </span>
            <span className="font-mono tabular-nums text-xs text-[#848E9C]">
              · Decisión del Motor: {activeSimulation.decisionState}
            </span>
          </div>

          <span className="text-[11px] text-[#848E9C]">
            Simulación técnica educativa · No ejecuta órdenes ni garantiza ganancias
          </span>
        </div>
      )}

      {/* Detailed Active Market Simulation Breakdown */}
      {!isBinanceLive ? (
        <div className="px-4 py-6 text-xs text-[#F6465D] flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>🔴 NO VIABLE:</strong> Binance está sin conexión. La simulación permanece bloqueada hasta recibir precios, libro y velas reales en vivo.
          </span>
        </div>
      ) : !activeSimulation ? (
        <div className="px-4 py-6 text-center text-xs text-[#848E9C]">
          {NO_DATA_LABEL} · Esperando indicadores reales de Binance para {selectedMarketId}.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Blocking Reasons or Viability Confirmation */}
          {activeSimulation.blockingReasons.length > 0 ? (
            <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
              <div
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  activeSimulation.state === 'NOT_VIABLE' ? 'text-[#F6465D]' : 'text-[#F0B90B]'
                }`}
              >
                {activeSimulation.state === 'NOT_VIABLE' ? (
                  <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {activeSimulation.state === 'NOT_VIABLE'
                    ? 'Simulación no permitida / No viable'
                    : 'Operación pausada — Condiciones de riesgo / espera'}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-[#B7BDC6]">
                {activeSimulation.blockingReasons.map((reason, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded border border-[#0ECB81]/25 bg-[#0ECB81]/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#0ECB81]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Parámetros de gestión de riesgo alineados con Motor de Decisión 🟢 BUY (solo simulación)
                </span>
              </div>
            </div>
          )}

          {/* Core Position & Technical Price Anchors */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#1A212E] py-3 font-mono tabular-nums text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Capital disponible</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#EAECEF]">
                {formatUsdt(activeSimulation.availableCapitalUsdt)}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">
                Asignado: {activeSimulation.capitalAllocationPct.toFixed(1)}%
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Monto operación</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#F0B90B]">
                {formatUsdt(activeSimulation.positionSizeUsdt)}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">Tamaño simulado Spot</p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Entrada técnica</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#EAECEF]">
                {activeSimulation.entryPrice !== null
                  ? formatPrice(activeSimulation.entryPrice, activeMarket.priceDecimals)
                  : NO_DATA_LABEL}
              </dd>
              <p className="font-sans text-[11px] text-[#848E9C]">
                Precio real {activeMarket.quoteAsset}
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Stop Loss (S1 + ATR)</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#F6465D]">
                {activeSimulation.stopLossPrice !== null
                  ? formatPrice(activeSimulation.stopLossPrice, activeMarket.priceDecimals)
                  : NO_DATA_LABEL}
              </dd>
              <p className="text-[11px] text-[#848E9C]">
                {activeSimulation.slDistancePct !== null && activeSimulation.stopLossInAtr !== null
                  ? `-${activeSimulation.slDistancePct.toFixed(2)}% · ${activeSimulation.stopLossInAtr.toFixed(2)}x ATR`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Take Profit (R1)</dt>
              <dd className="mt-0.5 text-sm font-bold text-[#0ECB81]">
                {activeSimulation.takeProfitPrice !== null
                  ? formatPrice(activeSimulation.takeProfitPrice, activeMarket.priceDecimals)
                  : NO_DATA_LABEL}
              </dd>
              <p className="text-[11px] text-[#848E9C]">
                {activeSimulation.tpDistancePct !== null
                  ? `+${activeSimulation.tpDistancePct.toFixed(2)}% hasta R1`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div>
              <dt className="font-sans text-[11px] text-[#848E9C]">Relación R/B neta</dt>
              <dd
                className={`mt-0.5 text-sm font-bold ${
                  activeSimulation.netRiskRewardRatio !== null
                    ? activeSimulation.netRiskRewardRatio >= 1.35
                      ? 'text-[#0ECB81]'
                      : activeSimulation.netRiskRewardRatio >= 1.0
                        ? 'text-[#F0B90B]'
                        : 'text-[#F6465D]'
                    : 'text-[#848E9C]'
                }`}
              >
                {activeSimulation.netRiskRewardRatio !== null
                  ? `1 : ${activeSimulation.netRiskRewardRatio.toFixed(2)}`
                  : NO_DATA_LABEL}
              </dd>
              <p className="text-[11px] text-[#848E9C]">
                Bruta:{' '}
                {activeSimulation.grossRiskRewardRatio !== null
                  ? `1 : ${activeSimulation.grossRiskRewardRatio.toFixed(2)}`
                  : NO_DATA_LABEL}
              </p>
            </div>
          </dl>

          {/* Clearly Separated Risk (Worst-Case SL) vs Target Potential (R1) + Execution Costs */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Card 1: Peor Escenario — Riesgo Potencial (Stop Loss) */}
            <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-[#1A212E] pb-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold text-[#F6465D]">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Peor escenario · Riesgo (Stop Loss)</span>
                </h3>
                <span className="font-mono text-[11px] text-[#848E9C]">S1 − 0,5×ATR</span>
              </div>

              <dl className="mt-2.5 space-y-2 font-mono tabular-nums text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Distancia entrada → SL</dt>
                  <dd className="text-[#EAECEF]">
                    {activeSimulation.slDistanceAbs !== null && activeSimulation.slDistancePct !== null
                      ? `-${formatPrice(activeSimulation.slDistanceAbs, activeMarket.priceDecimals)} (-${activeSimulation.slDistancePct.toFixed(2)}%)`
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Referencia S1 / ATR(14)</dt>
                  <dd className="text-[#B7BDC6]">
                    {activeSimulation.s1Price !== null && activeSimulation.atr14 !== null
                      ? `${formatPrice(activeSimulation.s1Price, activeMarket.priceDecimals)} / ${formatPrice(activeSimulation.atr14, activeMarket.priceDecimals)}`
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Pérdida bruta precio</dt>
                  <dd className="text-[#F6465D]">
                    {activeSimulation.grossRiskUsdt !== null
                      ? formatUsdt(-activeSimulation.grossRiskUsdt, true)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[#1A212E] pt-2">
                  <dt className="font-sans font-medium text-[#EAECEF]">Riesgo total estimado</dt>
                  <dd className="text-right font-bold text-[#F6465D]">
                    <div>
                      {activeSimulation.estimatedRiskUsdt !== null
                        ? formatUsdt(-activeSimulation.estimatedRiskUsdt, true)
                        : NO_DATA_LABEL}
                    </div>
                    <div className="text-[11px] font-normal text-[#848E9C]">
                      {activeSimulation.estimatedRiskPctOfPosition !== null &&
                      activeSimulation.estimatedRiskPctOfCapital !== null
                        ? `-${activeSimulation.estimatedRiskPctOfPosition.toFixed(2)}% pos. · -${activeSimulation.estimatedRiskPctOfCapital.toFixed(2)}% cap.`
                        : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Card 2: Escenario Objetivo — Retorno Potencial (R1) */}
            <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-[#1A212E] pb-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold text-[#0ECB81]">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Escenario objetivo · Retorno (R1)</span>
                </h3>
                <span className="font-mono text-[11px] text-[#848E9C]">No garantizado</span>
              </div>

              <dl className="mt-2.5 space-y-2 font-mono tabular-nums text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Distancia entrada → TP</dt>
                  <dd className="text-[#EAECEF]">
                    {activeSimulation.tpDistanceAbs !== null && activeSimulation.tpDistancePct !== null
                      ? `+${formatPrice(activeSimulation.tpDistanceAbs, activeMarket.priceDecimals)} (+${activeSimulation.tpDistancePct.toFixed(2)}%)`
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Retorno bruto estimado</dt>
                  <dd className="text-[#0ECB81]">
                    {activeSimulation.grossReturnUsdt !== null && activeSimulation.grossReturnPct !== null
                      ? `${formatUsdt(activeSimulation.grossReturnUsdt, true)} (${formatSignedPercent(activeSimulation.grossReturnPct)})`
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">Costos totales (TP)</dt>
                  <dd className="text-[#F0B90B]">
                    {activeSimulation.totalCostsTpUsdt !== null
                      ? formatUsdt(-activeSimulation.totalCostsTpUsdt, true)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[#1A212E] pt-2">
                  <dt className="font-sans font-medium text-[#EAECEF]">Retorno neto estimado</dt>
                  <dd
                    className={`text-right font-bold ${
                      activeSimulation.netReturnUsdt !== null
                        ? activeSimulation.netReturnUsdt > 0
                          ? 'text-[#0ECB81]'
                          : 'text-[#F6465D]'
                        : 'text-[#848E9C]'
                    }`}
                  >
                    <div>{formatUsdt(activeSimulation.netReturnUsdt, true)}</div>
                    <div className="text-[11px] font-normal text-[#848E9C]">
                      {activeSimulation.netReturnPctOfPosition !== null &&
                      activeSimulation.netReturnPctOfCapital !== null
                        ? `${formatSignedPercent(activeSimulation.netReturnPctOfPosition)} pos. · ${formatSignedPercent(activeSimulation.netReturnPctOfCapital)} cap.`
                        : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Card 3: Desglose de Costos Reales (Comisiones + Spread) */}
            <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3.5">
              <div className="flex items-center justify-between gap-2 border-b border-[#1A212E] pb-2">
                <h3 className="font-display text-xs font-semibold text-[#EAECEF]">
                  Costos reales de ejecución
                </h3>
                <span className="font-mono text-[11px] text-[#848E9C]">Spot Binance</span>
              </div>

              <dl className="mt-2.5 space-y-2 font-mono tabular-nums text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">
                    Comisión compra ({activeSimulation.buyFeePct.toFixed(2).replace('.', ',')}%)
                  </dt>
                  <dd className="text-[#B7BDC6]">{formatUsdt(activeSimulation.buyFeeUsdt)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">
                    Comisión venta ({activeSimulation.sellFeePct.toFixed(2).replace('.', ',')}%)
                  </dt>
                  <dd className="text-[#B7BDC6]">
                    {activeSimulation.sellFeeUsdtTp !== null
                      ? formatUsdt(activeSimulation.sellFeeUsdtTp)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-sans text-[#848E9C]">
                    Spread real (
                    {activeSimulation.spreadPct !== null
                      ? `${activeSimulation.spreadPct.toFixed(3)}%`
                      : NO_DATA_LABEL}
                    )
                  </dt>
                  <dd className="text-[#F0B90B]">
                    {formatUsdt(activeSimulation.spreadCostUsdt)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[#1A212E] pt-2">
                  <dt className="font-sans font-medium text-[#EAECEF]">Fricción total estimada</dt>
                  <dd className="text-right font-bold text-[#F0B90B]">
                    <div>{formatUsdt(activeSimulation.totalCostsTpUsdt)}</div>
                    <div className="text-[11px] font-normal text-[#848E9C]">
                      {activeSimulation.spreadPct !== null
                        ? `${(
                            activeSimulation.buyFeePct +
                            activeSimulation.sellFeePct +
                            activeSimulation.spreadPct
                          ).toFixed(3)}% ida y vuelta`
                        : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* All 4 Markets Risk & Simulation Comparison Table */}
          <div className="border-t border-[#1A212E] pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xs font-semibold text-[#EAECEF]">
                Resumen de simulación y gestión de riesgo (4 mercados)
              </h3>
              <span className="text-[11px] text-[#848E9C]">
                Haz clic en un mercado para auditar su desglose completo
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left font-mono tabular-nums text-[11px]">
                <thead>
                  <tr className="border-b border-[#1F2735] text-[#848E9C]">
                    <th className="py-2 pr-3 font-sans font-medium">Mercado</th>
                    <th className="py-2 pr-3 font-sans font-medium">Estado Simulación</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">Entrada</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">SL (S1+ATR)</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">TP (R1)</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">Riesgo (SL)</th>
                    <th className="py-2 pr-3 text-right font-sans font-medium">Retorno neto (R1)</th>
                    <th className="py-2 text-right font-sans font-medium">R/B neta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171D29]">
                  {opportunities.map((opp) => {
                    const sim = simulationsByMarket[opp.marketId];
                    const market = MARKET_MAP[opp.marketId];
                    if (!sim) return null;
                    const rowStyle = viabilityStyle(sim.state);
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
                          <span className="ml-1.5 font-mono text-[10px] font-normal text-[#848E9C]">
                            ({sim.decisionState})
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 font-display text-[11px] font-bold ${rowStyle.border} ${rowStyle.bg} ${rowStyle.text}`}
                          >
                            {sim.stateLabel}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#EAECEF]">
                          {sim.entryPrice !== null
                            ? formatPrice(sim.entryPrice, market.priceDecimals)
                            : NO_DATA_LABEL}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#F6465D]">
                          {sim.stopLossPrice !== null && sim.slDistancePct !== null
                            ? `${formatPrice(sim.stopLossPrice, market.priceDecimals)} (-${sim.slDistancePct.toFixed(2)}%)`
                            : NO_DATA_LABEL}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#0ECB81]">
                          {sim.takeProfitPrice !== null && sim.tpDistancePct !== null
                            ? `${formatPrice(sim.takeProfitPrice, market.priceDecimals)} (+${sim.tpDistancePct.toFixed(2)}%)`
                            : NO_DATA_LABEL}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#F6465D]">
                          {sim.estimatedRiskUsdt !== null && sim.estimatedRiskPctOfCapital !== null
                            ? `-${sim.estimatedRiskUsdt.toFixed(2)} USDT (-${sim.estimatedRiskPctOfCapital.toFixed(2)}%)`
                            : NO_DATA_LABEL}
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right font-semibold ${
                            sim.netReturnUsdt !== null
                              ? sim.netReturnUsdt > 0
                                ? 'text-[#0ECB81]'
                                : 'text-[#F6465D]'
                              : 'text-[#848E9C]'
                          }`}
                        >
                          {sim.netReturnUsdt !== null && sim.netReturnPctOfPosition !== null
                            ? `${sim.netReturnUsdt >= 0 ? '+' : ''}${sim.netReturnUsdt.toFixed(2)} USDT (${formatSignedPercent(sim.netReturnPctOfPosition)})`
                            : NO_DATA_LABEL}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-[#EAECEF]">
                          {sim.netRiskRewardRatio !== null
                            ? `1 : ${sim.netRiskRewardRatio.toFixed(2)}`
                            : NO_DATA_LABEL}
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
