import { AlertTriangle, Award, CheckCircle2, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import {
  MARKET_MAP,
  NO_DATA_LABEL,
  formatPrice,
  formatSignedPercent,
} from '../config/markets';
import type {
  DecisionCheckStatus,
  DecisionState,
  FeeConfig,
  MarketDecision,
  MarketId,
  MarketOpportunity,
  TrendDirection,
} from '../types/market';

interface OpportunityRankingPanelProps {
  opportunities: MarketOpportunity[];
  decisionsByMarket: Record<MarketId, MarketDecision>;
  selectedMarketId: MarketId;
  onSelectMarket: (id: MarketId) => void;
  feeConfig: FeeConfig;
  onChangeFees: (next: FeeConfig) => void;
  isBinanceLive: boolean;
  loading: boolean;
}

function scoreTone(score: number | null): {
  text: string;
  bar: string;
} {
  if (score === null) return { text: 'text-[#848E9C]', bar: 'bg-[#2A3446]' };
  if (score >= 70) return { text: 'text-[#0ECB81]', bar: 'bg-[#0ECB81]' };
  if (score >= 50) return { text: 'text-[#F0B90B]', bar: 'bg-[#F0B90B]' };
  return { text: 'text-[#F6465D]', bar: 'bg-[#F6465D]' };
}

function trendTextClass(t: TrendDirection | null): string {
  if (t === 'Alcista') return 'text-[#0ECB81]';
  if (t === 'Bajista') return 'text-[#F6465D]';
  if (t === 'Lateral') return 'text-[#F0B90B]';
  return 'text-[#848E9C]';
}

function decisionStyle(state: DecisionState): {
  label: string;
  text: string;
  border: string;
  bg: string;
} {
  if (state === 'BUY') {
    return {
      label: '🟢 BUY',
      text: 'text-[#0ECB81]',
      border: 'border-[#0ECB81]/35',
      bg: 'bg-[#0ECB81]/10',
    };
  }
  if (state === 'WAIT') {
    return {
      label: '🟡 WAIT',
      text: 'text-[#F0B90B]',
      border: 'border-[#F0B90B]/35',
      bg: 'bg-[#F0B90B]/10',
    };
  }
  return {
    label: '🔴 NO TRADE',
    text: 'text-[#F6465D]',
    border: 'border-[#F6465D]/35',
    bg: 'bg-[#F6465D]/10',
  };
}

function checkTone(status: DecisionCheckStatus): string {
  if (status === 'pass') return 'text-[#0ECB81]';
  if (status === 'warn') return 'text-[#F0B90B]';
  if (status === 'block') return 'text-[#F6465D]';
  return 'text-[#848E9C]';
}

function checkSymbol(status: DecisionCheckStatus): string {
  if (status === 'pass') return '✓';
  if (status === 'warn') return '!';
  if (status === 'block') return '✕';
  return '—';
}

export function OpportunityRankingPanel({
  opportunities,
  decisionsByMarket,
  selectedMarketId,
  onSelectMarket,
  feeConfig,
  onChangeFees,
  isBinanceLive,
  loading,
}: OpportunityRankingPanelProps) {
  const topOpportunity = opportunities.find((o) => o.isValid && o.score !== null) ?? null;
  const topDecision = topOpportunity ? decisionsByMarket[topOpportunity.marketId] ?? null : null;
  const totalFeePct = feeConfig.buyFeePct + feeConfig.sellFeePct;
  const feesModified =
    Math.abs(feeConfig.buyFeePct - 0.1) > 0.0001 ||
    Math.abs(feeConfig.sellFeePct - 0.1) > 0.0001;

  const handleFeeInput = (field: 'buyFeePct' | 'sellFeePct', raw: string) => {
    const normalized = raw.replace(',', '.');
    if (normalized === '') {
      onChangeFees({ ...feeConfig, [field]: 0 });
      return;
    }
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(5, parsed));
    onChangeFees({ ...feeConfig, [field]: clamped });
  };

  return (
    <section
      aria-label="Ranking de Oportunidades"
      className="mt-4 border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      {/* Header + Configurable Buy / Sell Commissions */}
      <div className="flex flex-col gap-3 border-b border-[#1F2735] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-[#EAECEF]">
              Ranking de Oportunidades y Motor de Decisión
            </h2>
            <span className="text-xs text-[#848E9C]">
              · Opportunity Score (0–100) separado de la decisión final · 4 mercados Spot Binance
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Auditoría objetiva en vivo (BUY / WAIT / NO TRADE) sin ejecución de órdenes ni conexión de fondos.
          </p>
        </div>

        {/* Configurable Commissions (default 0,10% buy / 0,10% sell) */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[#848E9C]">Comisiones Spot:</span>
          <label className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span>Compra</span>
            <input
              type="number"
              min="0"
              max="5"
              step="0.01"
              value={feeConfig.buyFeePct}
              onChange={(e) => handleFeeInput('buyFeePct', e.target.value)}
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
              onChange={(e) => handleFeeInput('sellFeePct', e.target.value)}
              aria-label="Comisión de venta en porcentaje"
              className="w-16 rounded border border-[#242D3D] bg-[#0B0E14] px-2 py-1 text-right font-mono tabular-nums text-xs text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
            />
            <span className="font-mono text-[#848E9C]">%</span>
          </label>

          <span className="font-mono tabular-nums text-[11px] text-[#848E9C]">
            Ida y vuelta: {totalFeePct.toFixed(2).replace('.', ',')}%
          </span>

          {feesModified && (
            <button
              type="button"
              onClick={() => onChangeFees({ buyFeePct: 0.1, sellFeePct: 0.1 })}
              title="Restablecer comisiones a 0,10% / 0,10%"
              className="flex items-center gap-1 rounded border border-[#242D3D] bg-[#0E131B] px-2 py-1 text-[11px] text-[#B7BDC6] transition-colors hover:border-[#364359] hover:text-[#EAECEF] cursor-pointer"
            >
              <RotateCcw className="h-3 w-3 text-[#F0B90B]" />
              <span>0,10%</span>
            </button>
          )}
        </div>
      </div>

      {/* Clear Objective Leader Summary Strip */}
      <div className="flex flex-col justify-between gap-2 border-b border-[#1F2735] bg-[#0E131B] px-4 py-2.5 sm:flex-row sm:items-center">
        {!isBinanceLive ? (
          <div className="flex items-center gap-2 text-xs text-[#F6465D]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Evaluación pausada:</strong> Binance está sin conexión; ningún mercado se puntúa como oportunidad válida hasta recibir datos reales en vivo.
            </span>
          </div>
        ) : topOpportunity ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Award className="h-4 w-4 shrink-0 text-[#F0B90B]" aria-hidden="true" />
            <span className="text-[#B7BDC6]">Mejor oportunidad objetiva actual:</span>
            <button
              type="button"
              onClick={() => onSelectMarket(topOpportunity.marketId)}
              className="font-display font-bold text-[#F0B90B] hover:underline cursor-pointer"
            >
              {topOpportunity.marketId}
            </button>
            <span className="font-mono tabular-nums font-semibold text-[#EAECEF]">
              Score {topOpportunity.score}/100
            </span>
            {topDecision && (
              <span
                className={`rounded border px-1.5 py-0.5 font-display text-[11px] font-bold ${
                  decisionStyle(topDecision.state).border
                } ${decisionStyle(topDecision.state).bg} ${decisionStyle(topDecision.state).text}`}
              >
                {decisionStyle(topDecision.state).label}
              </span>
            )}
            <span className="text-[#848E9C]">
              · Potencial estimado neto tras comisiones:{' '}
              <strong
                className={
                  topOpportunity.netPotentialAfterFeesPct !== null
                    ? topOpportunity.netPotentialAfterFeesPct > 0
                      ? 'text-[#0ECB81]'
                      : 'text-[#F6465D]'
                    : 'text-[#848E9C]'
                }
              >
                {topOpportunity.netPotentialAfterFeesPct !== null
                  ? formatSignedPercent(topOpportunity.netPotentialAfterFeesPct)
                  : NO_DATA_LABEL}
              </strong>
            </span>
          </div>
        ) : (
          <div className="text-xs text-[#848E9C]">
            {loading
              ? 'Recopilando histórico 4H/1H/15M y libros reales de Binance para los 4 mercados...'
              : 'Sin oportunidad válida evaluable en este momento (faltan datos completos de Binance).'}
          </div>
        )}

        <span className="shrink-0 text-[11px] text-[#848E9C]">
          Potencial estimado hasta R1; no representa ganancia garantizada
        </span>
      </div>

      {/* Ranked Markets List (Highest to Lowest Score) */}
      <div className="divide-y divide-[#1F2735]">
        {opportunities.map((opp) => {
          const market = MARKET_MAP[opp.marketId];
          const isSelected = opp.marketId === selectedMarketId;
          const isLeader = opp.rank === 1 && opp.isValid;
          const tone = scoreTone(opp.score);
          const decision = decisionsByMarket[opp.marketId];
          const dStyle = decision ? decisionStyle(decision.state) : null;

          return (
            <article
              key={opp.marketId}
              className={`px-4 py-4 transition-colors duration-150 ${
                isSelected ? 'bg-[#141A26]' : 'bg-[#11161F] hover:bg-[#131924]'
              }`}
            >
              {/* Top Row: Rank, Market Name, Separated Opportunity Score & Decision State, Focus Button */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`font-mono tabular-nums text-sm font-bold ${
                      isLeader ? 'text-[#F0B90B]' : 'text-[#848E9C]'
                    }`}
                  >
                    {opp.rank !== null ? `#${opp.rank}` : '—'}
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectMarket(opp.marketId)}
                    className="font-display text-base font-bold text-[#EAECEF] hover:text-[#F0B90B] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0B90B]"
                  >
                    {opp.marketId}
                  </button>

                  <span className="font-mono tabular-nums text-xs text-[#B7BDC6]">
                    {opp.price !== null
                      ? `${formatPrice(opp.price, market.priceDecimals)} ${market.quoteAsset}`
                      : NO_DATA_LABEL}
                  </span>

                  {isLeader && (
                    <span className="text-xs font-medium text-[#F0B90B]">
                      · Líder Score
                    </span>
                  )}

                  {isSelected && (
                    <span className="text-xs text-[#848E9C]">· En gráfica</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Opportunity Score /100 (explicitly separated from final Decision) */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-[#848E9C]">Score</span>
                    <div className="w-20 sm:w-24">
                      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#1A212E]">
                        <div
                          className={`h-full transition-[width] duration-200 ${tone.bar}`}
                          style={{ width: `${opp.score ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="min-w-[64px] text-right font-mono tabular-nums">
                      {opp.isValid && opp.score !== null ? (
                        <>
                          <span className={`text-base font-bold ${tone.text}`}>
                            {opp.score}
                          </span>
                          <span className="text-xs text-[#848E9C]">/100</span>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-[#848E9C]">
                          {NO_DATA_LABEL}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Independent Decision Engine Verdict */}
                  {decision && dStyle && (
                    <div className="flex items-center gap-2 border-l border-[#1F2735] pl-4">
                      <span
                        className={`rounded border px-2 py-0.5 font-display text-xs font-bold tracking-wide whitespace-nowrap ${dStyle.border} ${dStyle.bg} ${dStyle.text}`}
                      >
                        {dStyle.label}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-[#848E9C] whitespace-nowrap">
                        {decision.passedCount}/{decision.totalChecks}
                      </span>
                    </div>
                  )}

                  {!isSelected && (
                    <button
                      type="button"
                      onClick={() => onSelectMarket(opp.marketId)}
                      className="rounded border border-[#242D3D] bg-[#0E131B] px-2.5 py-1 text-[11px] font-medium text-[#EAECEF] transition-colors hover:border-[#364359] hover:bg-[#171D29] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Ver mercado
                    </button>
                  )}
                </div>
              </div>

              {/* Invalid / Offline Notice when not scorable */}
              {!opp.isValid && opp.invalidReason && (
                <div className="mt-2.5 text-xs text-[#F6465D]">
                  {opp.invalidReason}
                </div>
              )}

              {/* Key Quantitative Metrics Strip */}
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 border-y border-[#1A212E] py-3 sm:grid-cols-3 lg:grid-cols-7">
                {/* 1. Tendencia */}
                <div>
                  <dt className="text-[11px] text-[#848E9C]">Tendencia (4H/1H/15M)</dt>
                  <dd className="mt-0.5 text-xs font-medium text-[#EAECEF]">
                    {opp.trend4h || opp.trend1h || opp.trend15m ? (
                      <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                        <span className={trendTextClass(opp.trend4h)}>
                          {opp.trend4h ?? NO_DATA_LABEL}
                        </span>
                        <span className="text-[#4B5565]">/</span>
                        <span className={trendTextClass(opp.trend1h)}>
                          {opp.trend1h ?? NO_DATA_LABEL}
                        </span>
                        <span className="text-[#4B5565]">/</span>
                        <span className={trendTextClass(opp.trend15m)}>
                          {opp.trend15m ?? NO_DATA_LABEL}
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-[#848E9C]">{NO_DATA_LABEL}</span>
                    )}
                  </dd>
                </div>

                {/* 2. Soporte / Resistencia relevante */}
                <div>
                  <dt className="text-[11px] text-[#848E9C]">Soporte / Resistencia</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-[11px]">
                    <div className="text-[#0ECB81]">
                      S1:{' '}
                      {opp.support
                        ? `${formatPrice(opp.support.price, market.priceDecimals)} (-${opp.support.distancePct.toFixed(2)}%)`
                        : NO_DATA_LABEL}
                    </div>
                    <div className="text-[#F6465D]">
                      R1:{' '}
                      {opp.resistance
                        ? `${formatPrice(opp.resistance.price, market.priceDecimals)} (+${opp.resistance.distancePct.toFixed(2)}%)`
                        : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>

                {/* 3. Momentum */}
                <div>
                  <dt className="text-[11px] text-[#848E9C]">Momentum</dt>
                  <dd className="mt-0.5 text-xs font-medium text-[#EAECEF]">
                    <div>{opp.momentumState ?? NO_DATA_LABEL}</div>
                    <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                      RSI {opp.rsi14 !== null ? opp.rsi14.toFixed(1) : NO_DATA_LABEL} · ROC{' '}
                      {opp.roc10 !== null ? formatSignedPercent(opp.roc10) : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>

                {/* 4. Volumen */}
                <div>
                  <dt className="text-[11px] text-[#848E9C]">Volumen</dt>
                  <dd className="mt-0.5 text-xs font-medium text-[#EAECEF]">
                    <div>{opp.volumeRating ?? NO_DATA_LABEL}</div>
                    <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                      Rel:{' '}
                      {opp.relativeVolume !== null
                        ? `${opp.relativeVolume.toFixed(2)}x`
                        : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>

                {/* 5. Spread */}
                <div>
                  <dt className="text-[11px] text-[#848E9C]">Spread</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-xs font-medium text-[#F0B90B]">
                    <div>
                      {opp.spreadAbs !== null
                        ? `${formatPrice(opp.spreadAbs, market.priceDecimals)} ${market.quoteAsset}`
                        : NO_DATA_LABEL}
                    </div>
                    <div className="text-[11px] text-[#848E9C]">
                      {opp.spreadPct !== null
                        ? `${opp.spreadPct.toFixed(3)}%`
                        : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>

                {/* 6. Volatilidad */}
                <div>
                  <dt className="text-[11px] text-[#848E9C]">Volatilidad (ATR)</dt>
                  <dd className="mt-0.5 text-xs font-medium text-[#EAECEF]">
                    <div>{opp.volatilityRating ?? NO_DATA_LABEL}</div>
                    <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                      {opp.volatilityPct !== null
                        ? `${opp.volatilityPct.toFixed(3)}%`
                        : NO_DATA_LABEL}
                    </div>
                  </dd>
                </div>

                {/* 7. Potencial estimado después de comisión */}
                <div>
                  <dt className="text-[11px] text-[#848E9C]">Potencial est. neto</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-xs font-semibold">
                    {opp.netPotentialAfterFeesPct !== null ? (
                      <>
                        <div
                          className={
                            opp.netPotentialAfterFeesPct > 0
                              ? 'text-[#0ECB81]'
                              : 'text-[#F6465D]'
                          }
                        >
                          {formatSignedPercent(opp.netPotentialAfterFeesPct)}
                        </div>
                        <div className="text-[11px] font-normal text-[#848E9C]">
                          Tras {opp.totalFeesPct.toFixed(2).replace('.', ',')}% comis. + spread
                        </div>
                      </>
                    ) : (
                      <span className="font-normal text-[#848E9C]">{NO_DATA_LABEL}</span>
                    )}
                  </dd>
                </div>
              </dl>

              {/* Transparent 8-Factor Score Breakdown */}
              {opp.isValid && opp.breakdown && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-[11px] text-[#848E9C]">
                  <span>Tend {opp.breakdown.trend}/20</span>
                  <span>S/R {opp.breakdown.supportResistance}/20</span>
                  <span>Mom {opp.breakdown.momentum}/10</span>
                  <span>Vol {opp.breakdown.volume}/10</span>
                  <span>Liq/Libro {opp.breakdown.liquiditySpreadBook}/15</span>
                  <span>ATR {opp.breakdown.volatilityAtr}/10</span>
                  <span>Día ant. {opp.breakdown.previousDay}/10</span>
                  <span>Post-comis. {opp.breakdown.postFeePotential}/5</span>
                </div>
              )}

              {/* Reasons For & Key Risks */}
              {opp.isValid && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-[#0ECB81]">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Principales razones a favor</span>
                    </h3>
                    <ul className="mt-1 space-y-0.5 text-xs text-[#B7BDC6]">
                      {opp.reasonsFor.map((reason, idx) => (
                        <li key={idx} className="leading-relaxed">
                          • {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-[#F6465D]">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Principales riesgos</span>
                    </h3>
                    <ul className="mt-1 space-y-0.5 text-xs text-[#B7BDC6]">
                      {opp.risks.map((risk, idx) => (
                        <li key={idx} className="leading-relaxed">
                          • {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Auditable Decision Engine Block (Separated from Opportunity Score) */}
              {decision && dStyle && (
                <div className="mt-3 rounded border border-[#1F2735] bg-[#0E131B] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-display font-semibold text-[#EAECEF]">
                        Decisión del Motor:
                      </span>
                      <span className={`font-display font-bold ${dStyle.text}`}>
                        {dStyle.label}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                        · {decision.passedCount}/{decision.totalChecks} filtros aprobados
                      </span>
                    </div>

                    {decision.state === 'BUY' && decision.confidence !== null && (
                      <span className="font-mono tabular-nums text-xs font-semibold text-[#0ECB81]">
                        Nivel de confianza: {decision.confidence}/100
                      </span>
                    )}
                  </div>

                  {decision.state === 'BUY' ? (
                    <div className="mt-2.5 space-y-2.5">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-[#1A212E] py-2 font-mono tabular-nums text-xs sm:grid-cols-3 lg:grid-cols-6">
                        <div>
                          <dt className="font-sans text-[11px] text-[#848E9C]">Mercado</dt>
                          <dd className="font-display font-bold text-[#EAECEF]">
                            {decision.marketId}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-sans text-[11px] text-[#848E9C]">Precio actual</dt>
                          <dd className="font-semibold text-[#EAECEF]">
                            {decision.price !== null
                              ? formatPrice(decision.price, market.priceDecimals)
                              : NO_DATA_LABEL}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-sans text-[11px] text-[#848E9C]">Zona de entrada</dt>
                          <dd className="font-semibold text-[#0ECB81]">
                            {decision.entryZone
                              ? `${formatPrice(decision.entryZone.low, market.priceDecimals)} – ${formatPrice(
                                  decision.entryZone.high,
                                  market.priceDecimals
                                )}`
                              : NO_DATA_LABEL}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-sans text-[11px] text-[#848E9C]">S1</dt>
                          <dd className="font-semibold text-[#0ECB81]">
                            {decision.s1
                              ? formatPrice(decision.s1.price, market.priceDecimals)
                              : NO_DATA_LABEL}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-sans text-[11px] text-[#848E9C]">R1</dt>
                          <dd className="font-semibold text-[#F6465D]">
                            {decision.r1
                              ? formatPrice(decision.r1.price, market.priceDecimals)
                              : NO_DATA_LABEL}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-sans text-[11px] text-[#848E9C]">Potencial neto est.</dt>
                          <dd className="font-semibold text-[#0ECB81]">
                            {decision.netPotentialAfterFeesPct !== null
                              ? formatSignedPercent(decision.netPotentialAfterFeesPct)
                              : NO_DATA_LABEL}
                          </dd>
                        </div>
                      </dl>

                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        <div>
                          <div className="text-[11px] font-medium text-[#0ECB81]">
                            Razones que activaron la decisión
                          </div>
                          <ul className="mt-1 space-y-0.5 text-xs text-[#B7BDC6]">
                            {decision.activationReasons.map((r, idx) => (
                              <li key={idx}>• {r}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-[11px] font-medium text-[#F6465D]">
                            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>Riesgo principal</span>
                          </div>
                          <p className="mt-1 text-xs text-[#B7BDC6]">{decision.primaryRisk}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <div
                        className={`flex items-center gap-1.5 text-[11px] font-medium ${
                          decision.state === 'NO TRADE' ? 'text-[#F6465D]' : 'text-[#F0B90B]'
                        }`}
                      >
                        {decision.state === 'NO TRADE' ? (
                          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>Condiciones que impidieron la entrada</span>
                      </div>
                      <ul className="mt-1 space-y-0.5 text-xs text-[#B7BDC6]">
                        {decision.blockingConditions.map((cond, idx) => (
                          <li key={idx} className="leading-relaxed">
                            • {cond}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Compact 9-condition audit bar */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-[#1A212E] pt-2 font-mono tabular-nums text-[11px]">
                    {decision.checks.map((chk) => (
                      <span key={chk.id} className="text-[#848E9C]">
                        <span className={`mr-1 font-bold ${checkTone(chk.status)}`}>
                          {checkSymbol(chk.status)}
                        </span>
                        {chk.label}:{' '}
                        <span className={checkTone(chk.status)}>{chk.detail}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
