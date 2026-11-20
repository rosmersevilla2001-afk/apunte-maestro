import {
  AlertTriangle,
  CheckCircle2,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  MARKET_MAP,
  NO_DATA_LABEL,
  TIMEFRAME_MAP,
  formatCompactVolume,
  formatPrice,
  formatSignedPercent,
} from '../config/markets';
import type {
  DecisionCheckStatus,
  DecisionState,
  DirectionTimeframe,
  MarketDecision,
  MarketDirectionAnalysis,
  MarketDirectionLabel,
  MarketId,
  MarketOpportunity,
  TechnicalAnalysis,
  Timeframe,
  TrendDirection,
} from '../types/market';

interface AnalysisPanelProps {
  marketId: MarketId;
  timeframe: Timeframe;
  analysis: TechnicalAnalysis | null;
  opportunity: MarketOpportunity | null;
  direction: MarketDirectionAnalysis | null;
  decision: MarketDecision | null;
  loading: boolean;
}

function trendTone(trend: TrendDirection | null): string {
  if (trend === 'Alcista') return 'text-[#0ECB81]';
  if (trend === 'Bajista') return 'text-[#F6465D]';
  if (trend === 'Lateral') return 'text-[#F0B90B]';
  return 'text-[#848E9C]';
}

function decisionMeta(state: DecisionState): {
  label: string;
  text: string;
  dot: string;
  border: string;
  bg: string;
} {
  if (state === 'BUY') {
    return {
      label: '🟢 COMPRAR LIMIT',
      text: 'text-[#0ECB81]',
      dot: 'bg-[#0ECB81]',
      border: 'border-[#0ECB81]/35',
      bg: 'bg-[#0ECB81]/10',
    };
  }
  if (state === 'WAIT') {
    return {
      label: '🟡 ESPERAR',
      text: 'text-[#F0B90B]',
      dot: 'bg-[#F0B90B]',
      border: 'border-[#F0B90B]/35',
      bg: 'bg-[#F0B90B]/10',
    };
  }
  return {
    label: '🔴 NO COMPRAR',
    text: 'text-[#F6465D]',
    dot: 'bg-[#F6465D]',
    border: 'border-[#F6465D]/35',
    bg: 'bg-[#F6465D]/10',
  };
}

function checkStatusTone(status: DecisionCheckStatus): string {
  if (status === 'pass') return 'text-[#0ECB81]';
  if (status === 'warn') return 'text-[#F0B90B]';
  if (status === 'block') return 'text-[#F6465D]';
  return 'text-[#848E9C]';
}

function checkStatusSymbol(status: DecisionCheckStatus): string {
  if (status === 'pass') return '✓';
  if (status === 'warn') return '!';
  if (status === 'block') return '✕';
  return '—';
}

function directionBadgeMeta(dir: MarketDirectionLabel): {
  text: string;
  border: string;
  bg: string;
} {
  if (dir === 'ALCISTA') {
    return {
      text: 'text-[#0ECB81]',
      border: 'border-[#0ECB81]/35',
      bg: 'bg-[#0ECB81]/10',
    };
  }
  if (dir === 'BAJISTA') {
    return {
      text: 'text-[#F6465D]',
      border: 'border-[#F6465D]/35',
      bg: 'bg-[#F6465D]/10',
    };
  }
  if (dir === 'LATERAL') {
    return {
      text: 'text-[#F0B90B]',
      border: 'border-[#F0B90B]/35',
      bg: 'bg-[#F0B90B]/10',
    };
  }
  return {
    text: 'text-[#848E9C]',
    border: 'border-[#242D3D]',
    bg: 'bg-[#171D29]',
  };
}

const DIRECTION_TFS: DirectionTimeframe[] = ['4h', '1h', '15m'];

export function AnalysisPanel({
  marketId,
  timeframe,
  analysis,
  opportunity,
  direction,
  decision,
  loading,
}: AnalysisPanelProps) {
  const market = MARKET_MAP[marketId];
  const tfConfig = TIMEFRAME_MAP[timeframe];
  const decStyle = decision ? decisionMeta(decision.state) : null;

  const TrendIcon =
    analysis?.trend === 'Alcista'
      ? TrendingUp
      : analysis?.trend === 'Bajista'
        ? TrendingDown
        : Minus;

  const volumeColor =
    analysis?.volumeRating === 'Alto'
      ? 'text-[#0ECB81]'
      : analysis?.volumeRating === 'Bajo'
        ? 'text-[#F0B90B]'
        : analysis?.volumeRating === 'Normal'
          ? 'text-[#EAECEF]'
          : 'text-[#848E9C]';

  const volatilityColor =
    analysis?.volatilityRating === 'Alta'
      ? 'text-[#F6465D]'
      : analysis?.volatilityRating === 'Moderada'
        ? 'text-[#F0B90B]'
        : analysis?.volatilityRating === 'Baja'
          ? 'text-[#0ECB81]'
          : 'text-[#848E9C]';

  const momentumColor =
    analysis?.momentumState === 'Alcista fuerte' || analysis?.momentumState === 'Alcista'
      ? 'text-[#0ECB81]'
      : analysis?.momentumState === 'Bajista fuerte' || analysis?.momentumState === 'Bajista'
        ? 'text-[#F6465D]'
        : analysis?.momentumState === 'Neutral'
          ? 'text-[#F0B90B]'
          : 'text-[#848E9C]';

  return (
    <section
      aria-label="Panel de análisis técnico y motor de decisión"
      className="border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      {/* Header: Title + Separated Opportunity Score & Decision State */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1F2735] px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-[#EAECEF]">
              Panel de Análisis y Decisión
            </h2>
            <span className="text-xs text-[#848E9C]">
              · {market.id} · {tfConfig.label} ({tfConfig.historyLabel})
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Indicadores y motor de decisión en tiempo real con datos públicos de Binance (solo lectura)
            {analysis ? ` · ${analysis.candlesAnalyzed} velas analizadas` : ''}
          </p>
        </div>

        {/* Strictly separated Opportunity Score vs Final Decision */}
        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-xs">
          <div className="flex items-center gap-1.5 text-[#B7BDC6]">
            <span className="text-[#848E9C]">Opportunity Score:</span>
            <span className="font-bold text-[#EAECEF]">
              {opportunity?.isValid && opportunity.score !== null
                ? `${opportunity.score}/100`
                : NO_DATA_LABEL}
            </span>
          </div>
          <span className="text-[#2A3446]" aria-hidden="true">
            |
          </span>
          {decision && decStyle ? (
            <div className="flex items-center gap-2">
              <span className="text-[#848E9C]">Decisión:</span>
              <span
                className={`rounded border px-2 py-0.5 font-display text-xs font-bold tracking-wide ${decStyle.border} ${decStyle.bg} ${decStyle.text}`}
              >
                {decStyle.label}
              </span>
            </div>
          ) : (
            <span className="text-[#848E9C]">{NO_DATA_LABEL}</span>
          )}
        </div>
      </div>

      {/* Decision Engine Audit Section (kept cleanly above raw indicators for immediate clarity) */}
      {decision && decStyle && (
        <div className="border-b border-[#1F2735] bg-[#0E131B] px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-display font-semibold text-[#EAECEF]">
                Motor de Decisión · {decision.marketId}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                ({decision.passedCount}/{decision.totalChecks} condiciones cumplidas)
              </span>
            </div>

            {decision.state === 'BUY' && decision.confidence !== null ? (
              <span className="font-mono tabular-nums text-xs font-semibold text-[#0ECB81]">
                Confianza técnica: {decision.confidence}/100
              </span>
            ) : (
              <span className="text-[11px] text-[#848E9C]">
                Sin ejecución automática · Auditoría independiente del Score
              </span>
            )}
          </div>

          {decision.state === 'BUY' ? (
            <div className="mt-3 space-y-3">
              {/* Required BUY Parameters Grid */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-y border-[#1A212E] py-2.5 font-mono tabular-nums text-xs sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <dt className="font-sans text-[11px] text-[#848E9C]">Mercado</dt>
                  <dd className="mt-0.5 font-display font-bold text-[#EAECEF]">
                    {decision.marketId}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-[11px] text-[#848E9C]">Precio actual</dt>
                  <dd className="mt-0.5 font-semibold text-[#EAECEF]">
                    {decision.price !== null
                      ? formatPrice(decision.price, market.priceDecimals)
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-[11px] text-[#848E9C]">Zona de entrada técnica</dt>
                  <dd className="mt-0.5 font-semibold text-[#0ECB81]">
                    {decision.entryZone
                      ? `${formatPrice(decision.entryZone.low, market.priceDecimals)} – ${formatPrice(
                          decision.entryZone.high,
                          market.priceDecimals
                        )}`
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-[11px] text-[#848E9C]">Soporte S1</dt>
                  <dd className="mt-0.5 font-semibold text-[#0ECB81]">
                    {decision.s1
                      ? `${formatPrice(decision.s1.price, market.priceDecimals)} (-${decision.s1.distancePct.toFixed(2)}%)`
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-[11px] text-[#848E9C]">Resistencia R1</dt>
                  <dd className="mt-0.5 font-semibold text-[#F6465D]">
                    {decision.r1
                      ? `${formatPrice(decision.r1.price, market.priceDecimals)} (+${decision.r1.distancePct.toFixed(2)}%)`
                      : NO_DATA_LABEL}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-[11px] text-[#848E9C]">Potencial neto est.</dt>
                  <dd className="mt-0.5 font-semibold text-[#0ECB81]">
                    {decision.netPotentialAfterFeesPct !== null
                      ? formatSignedPercent(decision.netPotentialAfterFeesPct)
                      : NO_DATA_LABEL}
                    <span className="block font-sans text-[10px] font-normal text-[#848E9C]">
                      No es ganancia garantizada
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-[#0ECB81]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Razones que activaron COMPRAR LIMIT</span>
                  </h3>
                  <ul className="mt-1 space-y-0.5 text-xs text-[#B7BDC6]">
                    {decision.activationReasons.map((reason, idx) => (
                      <li key={idx} className="leading-relaxed">
                        • {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-[#F6465D]">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Riesgo principal</span>
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[#B7BDC6]">
                    {decision.primaryRisk}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2.5">
              <h3
                className={`flex items-center gap-1.5 text-[11px] font-medium ${
                  decision.state === 'NO TRADE' ? 'text-[#F6465D]' : 'text-[#F0B90B]'
                }`}
              >
                {decision.state === 'NO TRADE' ? (
                  <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  Condiciones que impidieron la entrada ({decStyle.label})
                </span>
              </h3>
              <ul className="mt-1.5 space-y-1 text-xs text-[#B7BDC6]">
                {decision.blockingConditions.map((cond, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {cond}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dedicated Final Entry Timing Filter: Confirmación 5M */}
          <div className="mt-3 rounded border border-[#1F2735] bg-[#11161F] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-display font-semibold text-[#EAECEF]">
                  Confirmación 5M
                </span>
                <span className="text-[11px] text-[#848E9C]">
                  (timing final · 4H/1H/15M siguen siendo principales)
                </span>
              </div>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                  decision.confirmation5m.status === 'pass'
                    ? 'border-[#0ECB81]/35 bg-[#0ECB81]/10 text-[#0ECB81]'
                    : decision.confirmation5m.status === 'warn'
                      ? 'border-[#F0B90B]/35 bg-[#F0B90B]/10 text-[#F0B90B]'
                      : 'border-[#F6465D]/35 bg-[#F6465D]/10 text-[#F6465D]'
                }`}
              >
                {decision.confirmation5m.statusLabel}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-[11px] text-[#B7BDC6]">
              <span>
                Tendencia:{' '}
                <strong className={trendTone(decision.confirmation5m.trend)}>
                  {decision.confirmation5m.trend ?? NO_DATA_LABEL}
                </strong>
              </span>
              <span>
                RSI(14):{' '}
                <strong className="text-[#EAECEF]">
                  {decision.confirmation5m.rsi14 !== null
                    ? decision.confirmation5m.rsi14.toFixed(1)
                    : NO_DATA_LABEL}
                </strong>
              </span>
              <span>
                ROC(10):{' '}
                <strong className="text-[#EAECEF]">
                  {decision.confirmation5m.roc10 !== null
                    ? formatSignedPercent(decision.confirmation5m.roc10)
                    : NO_DATA_LABEL}
                </strong>
              </span>
              <span>
                Últ. vela cerrada:{' '}
                <strong className="font-sans font-medium text-[#EAECEF]">
                  {decision.confirmation5m.lastCandlePattern ?? NO_DATA_LABEL}
                </strong>
              </span>
            </div>
          </div>

          {/* 10+ Condition Auditable Checklist */}
          <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-[#1A212E] pt-2.5 font-mono tabular-nums text-[11px] sm:grid-cols-2 lg:grid-cols-3">
            {decision.checks.map((chk) => (
              <div key={chk.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[#848E9C]">
                  <span className={`mr-1 font-bold ${checkStatusTone(chk.status)}`}>
                    {checkStatusSymbol(chk.status)}
                  </span>
                  {chk.label}
                </span>
                <span className={`shrink-0 ${checkStatusTone(chk.status)}`}>{chk.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real Market Direction Detector (4H / 1H / 15M closed candles only) */}
      {direction && (
        <div className="border-b border-[#1F2735] bg-[#11161F] px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xs font-semibold text-[#EAECEF]">
                Detector de Dirección de Mercado
              </h3>
              <span className="text-[11px] text-[#848E9C]">
                · 4H, 1H y 15M por separado (solo velas cerradas)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-xs">
              <span
                className={`rounded border px-2 py-0.5 font-display text-[11px] font-bold tracking-wide ${
                  directionBadgeMeta(direction.overallDirection).border
                } ${directionBadgeMeta(direction.overallDirection).bg} ${
                  directionBadgeMeta(direction.overallDirection).text
                }`}
              >
                {direction.overallDirection}
              </span>
              <span className="text-[#B7BDC6]">
                Fuerza:{' '}
                <strong className="text-[#EAECEF]">
                  {direction.overallStrength ?? NO_DATA_LABEL}
                </strong>
              </span>
              <span className="text-[#2A3446]" aria-hidden="true">
                |
              </span>
              <span className="text-[#B7BDC6]">
                Confluencia:{' '}
                <strong className={directionBadgeMeta(direction.overallDirection).text}>
                  {direction.overallConfluence !== null
                    ? `${direction.overallConfluence}/100`
                    : NO_DATA_LABEL}
                </strong>
              </span>
            </div>
          </div>

          <p className="mt-1.5 text-[11px] text-[#848E9C]">
            {direction.limitGuidance}
          </p>

          <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {DIRECTION_TFS.map((tf) => {
              const item = direction.timeframes[tf];
              const meta = directionBadgeMeta(item.direction);
              return (
                <div
                  key={tf}
                  className="rounded border border-[#1F2735] bg-[#0E131B] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-[#EAECEF]">
                        {tf.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-[#848E9C]">({item.roleLabel})</span>
                    </div>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-display text-[10px] font-bold ${meta.border} ${meta.bg} ${meta.text}`}
                    >
                      {item.direction}
                    </span>
                  </div>

                  {!item.isValid ? (
                    <p className="mt-2 font-mono text-[11px] text-[#848E9C]">
                      {item.invalidReason ?? NO_DATA_LABEL}
                    </p>
                  ) : (
                    <dl className="mt-2 space-y-1 font-mono tabular-nums text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="font-sans text-[#848E9C]">Fuerza / Confluencia</dt>
                        <dd className="text-[#EAECEF]">
                          {item.strength ?? NO_DATA_LABEL} ·{' '}
                          <span className={`font-semibold ${meta.text}`}>
                            {item.confluence !== null ? `${item.confluence}/100` : NO_DATA_LABEL}
                          </span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="font-sans text-[#848E9C]">Estructura</dt>
                        <dd className="text-[#EAECEF]">
                          {item.swingStructure ?? NO_DATA_LABEL}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="font-sans text-[#848E9C]">Pend. MA7 / MA25</dt>
                        <dd className="text-[#B7BDC6]">
                          {item.ma7SlopePct !== null
                            ? formatSignedPercent(item.ma7SlopePct)
                            : NO_DATA_LABEL}{' '}
                          /{' '}
                          {item.ma25SlopePct !== null
                            ? formatSignedPercent(item.ma25SlopePct)
                            : NO_DATA_LABEL}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="font-sans text-[#848E9C]">RSI(14) / ROC(10)</dt>
                        <dd className="text-[#B7BDC6]">
                          {item.rsi14 !== null ? item.rsi14.toFixed(1) : NO_DATA_LABEL} ·{' '}
                          {item.roc10 !== null ? formatSignedPercent(item.roc10) : NO_DATA_LABEL}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="font-sans text-[#848E9C]">Vol. rel. / ATR</dt>
                        <dd className="text-[#B7BDC6]">
                          {item.relativeVolume !== null
                            ? `${item.relativeVolume.toFixed(2)}x`
                            : NO_DATA_LABEL}{' '}
                          ·{' '}
                          {item.volatilityPct !== null
                            ? `${item.volatilityPct.toFixed(3)}%`
                            : NO_DATA_LABEL}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="font-sans text-[#848E9C]">Libro (Bids)</dt>
                        <dd className="text-[#B7BDC6]">
                          {item.bidPressurePct !== null
                            ? `${item.bidPressurePct.toFixed(0)}%`
                            : NO_DATA_LABEL}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && !analysis ? (
        <div className="grid grid-cols-2 divide-x divide-y divide-[#1F2735] sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-[#1A212E]" />
              <div className="mt-2.5 h-5 w-24 animate-pulse rounded bg-[#1A212E]" />
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-[#1A212E]" />
            </div>
          ))}
        </div>
      ) : !analysis ? (
        <div className="px-4 py-8 text-center">
          <p className="font-mono text-xs font-medium text-[#EAECEF]">{NO_DATA_LABEL}</p>
          <p className="mt-1 text-xs text-[#848E9C]">
            Aún no hay suficientes velas reales de Binance para calcular los indicadores.
          </p>
        </div>
      ) : (
        <>
          {/* Row 1: MA7, MA25, MA99, Tendencia */}
          <dl className="grid grid-cols-2 divide-x divide-y divide-[#1F2735] border-b border-[#1F2735] sm:grid-cols-4 sm:divide-y-0">
            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">MA7</dt>
              <dd className="mt-1.5 font-mono tabular-nums text-base font-bold text-[#F0B90B]">
                {formatPrice(analysis.ma7, market.priceDecimals)}
              </dd>
              <p className="mt-1 text-[11px] text-[#848E9C]">
                Media móvil simple (7 velas)
              </p>
            </div>

            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">MA25</dt>
              <dd className="mt-1.5 font-mono tabular-nums text-base font-bold text-[#38BDF8]">
                {formatPrice(analysis.ma25, market.priceDecimals)}
              </dd>
              <p className="mt-1 text-[11px] text-[#848E9C]">
                Media móvil simple (25 velas)
              </p>
            </div>

            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">MA99</dt>
              <dd className="mt-1.5 font-mono tabular-nums text-base font-bold text-[#94A3B8]">
                {formatPrice(analysis.ma99, market.priceDecimals)}
              </dd>
              <p className="mt-1 text-[11px] text-[#848E9C]">
                Media móvil simple (99 velas)
              </p>
            </div>

            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">Tendencia</dt>
              <dd
                className={`mt-1.5 flex items-center gap-1.5 font-display text-base font-bold ${trendTone(
                  analysis.trend
                )}`}
              >
                {analysis.trend && <TrendIcon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span>{analysis.trend ?? NO_DATA_LABEL}</span>
              </dd>
              <p className="mt-1 text-[11px] leading-relaxed text-[#848E9C]">
                {analysis.trendDetail ?? NO_DATA_LABEL}
              </p>
            </div>
          </dl>

          {/* Row 2: Volumen, Volumen relativo, Volatilidad, Momentum */}
          <dl className="grid grid-cols-2 divide-x divide-y divide-[#1F2735] border-b border-[#1F2735] sm:grid-cols-4 sm:divide-y-0">
            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">Volumen</dt>
              <dd className={`mt-1.5 font-display text-base font-bold ${volumeColor}`}>
                {analysis.volumeRating ?? NO_DATA_LABEL}
              </dd>
              <p className="mt-1 font-mono tabular-nums text-[11px] text-[#848E9C]">
                {analysis.volumeLastClosed !== null
                  ? `Últ. vela: ${formatCompactVolume(analysis.volumeLastClosed)} USDT`
                  : NO_DATA_LABEL}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                {analysis.volumeAvg20 !== null
                  ? `Media 20: ${formatCompactVolume(analysis.volumeAvg20)} USDT`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">Volumen relativo</dt>
              <dd className="mt-1.5 font-mono tabular-nums text-base font-bold text-[#EAECEF]">
                {analysis.relativeVolume !== null
                  ? `${analysis.relativeVolume.toFixed(2)}x`
                  : NO_DATA_LABEL}
              </dd>
              <p className="mt-1 font-mono tabular-nums text-[11px] text-[#848E9C]">
                Prom. 3 velas vs media 20
              </p>
              <p className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                Bids libro:{' '}
                {analysis.bidPressurePct !== null
                  ? `${analysis.bidPressurePct.toFixed(0)}%`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">Volatilidad</dt>
              <dd className={`mt-1.5 font-display text-base font-bold ${volatilityColor}`}>
                {analysis.volatilityRating ?? NO_DATA_LABEL}
              </dd>
              <p className="mt-1 font-mono tabular-nums text-[11px] text-[#848E9C]">
                ATR(14):{' '}
                {analysis.atr14 !== null
                  ? formatPrice(analysis.atr14, market.priceDecimals)
                  : NO_DATA_LABEL}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                Rango relativo:{' '}
                {analysis.volatilityPct !== null
                  ? `${analysis.volatilityPct.toFixed(3)}%`
                  : NO_DATA_LABEL}
              </p>
            </div>

            <div className="p-4">
              <dt className="text-xs text-[#848E9C]">Momentum</dt>
              <dd className={`mt-1.5 font-display text-base font-bold ${momentumColor}`}>
                {analysis.momentumState ?? NO_DATA_LABEL}
              </dd>
              <p className="mt-1 font-mono tabular-nums text-[11px] text-[#848E9C]">
                RSI(14):{' '}
                {analysis.rsi14 !== null ? analysis.rsi14.toFixed(1) : NO_DATA_LABEL}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                ROC(10):{' '}
                {analysis.roc10 !== null ? formatSignedPercent(analysis.roc10) : NO_DATA_LABEL}
              </p>
            </div>
          </dl>

          {/* Row 3: Soportes, Resistencias, Estructura de velas */}
          <div className="grid grid-cols-1 divide-y divide-[#1F2735] border-b border-[#1F2735] md:grid-cols-3 md:divide-x md:divide-y-0">
            {/* Soportes */}
            <div className="p-4">
              <h3 className="text-xs font-medium text-[#848E9C]">Soportes</h3>
              {analysis.supports.length === 0 ? (
                <p className="mt-2 font-mono text-xs text-[#848E9C]">{NO_DATA_LABEL}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 font-mono tabular-nums text-xs">
                  {analysis.supports.map((lvl, i) => (
                    <li
                      key={`s-${i}-${lvl.price}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-[#0ECB81] font-semibold">
                        S{i + 1} · {formatPrice(lvl.price, market.priceDecimals)}
                      </span>
                      <span className="text-[11px] text-[#848E9C]">
                        -{lvl.distancePct.toFixed(2)}% · {lvl.source}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Resistencias */}
            <div className="p-4">
              <h3 className="text-xs font-medium text-[#848E9C]">Resistencias</h3>
              {analysis.resistances.length === 0 ? (
                <p className="mt-2 font-mono text-xs text-[#848E9C]">{NO_DATA_LABEL}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 font-mono tabular-nums text-xs">
                  {analysis.resistances.map((lvl, i) => (
                    <li
                      key={`r-${i}-${lvl.price}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-[#F6465D] font-semibold">
                        R{i + 1} · {formatPrice(lvl.price, market.priceDecimals)}
                      </span>
                      <span className="text-[11px] text-[#848E9C]">
                        +{lvl.distancePct.toFixed(2)}% · {lvl.source}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Estructura de velas */}
            <div className="p-4">
              <h3 className="text-xs font-medium text-[#848E9C]">Estructura de velas</h3>
              {!analysis.candleStructure ? (
                <p className="mt-2 font-mono text-xs text-[#848E9C]">{NO_DATA_LABEL}</p>
              ) : (
                <div className="mt-2 space-y-1 text-xs">
                  <div className="font-medium text-[#EAECEF]">
                    {analysis.candleStructure.swingStructure}
                  </div>
                  <div className="text-[11px] text-[#B7BDC6]">
                    Últ. vela cerrada: {analysis.candleStructure.lastCandlePattern}
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                    Cuerpo {analysis.candleStructure.bodyPct.toFixed(0)}% · Mecha sup.{' '}
                    {analysis.candleStructure.upperWickPct.toFixed(0)}% · inf.{' '}
                    {analysis.candleStructure.lowerWickPct.toFixed(0)}%
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                    Últimas 10 velas: {analysis.candleStructure.bullishCountLast10} alcistas ·{' '}
                    {analysis.candleStructure.bearishCountLast10} bajistas
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 4: Comportamiento del día anterior + Resumen multitemporal (5M, 15M, 1H, 4H) */}
          <div className="grid grid-cols-1 divide-y divide-[#1F2735] bg-[#0E131B] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
            {/* Día anterior */}
            <div className="p-4 lg:col-span-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-[#EAECEF]">
                  Comportamiento del día anterior (UTC)
                </h3>
                {analysis.previousDay && (
                  <span className="font-mono text-[11px] text-[#848E9C]">
                    Base {analysis.previousDay.sourceTimeframe.toUpperCase()}
                  </span>
                )}
              </div>

              {!analysis.previousDay ? (
                <p className="mt-2 font-mono text-xs text-[#848E9C]">{NO_DATA_LABEL}</p>
              ) : (
                <div className="mt-2 space-y-1.5 font-mono tabular-nums text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#848E9C]">Variación día ant.</span>
                    <span
                      className={
                        analysis.previousDay.changePct >= 0
                          ? 'font-semibold text-[#0ECB81]'
                          : 'font-semibold text-[#F6465D]'
                      }
                    >
                      {formatSignedPercent(analysis.previousDay.changePct)} · Rango{' '}
                      {analysis.previousDay.rangePct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#848E9C]">Máx / Mín día ant.</span>
                    <span className="text-[#EAECEF]">
                      {formatPrice(analysis.previousDay.high, market.priceDecimals)} /{' '}
                      {formatPrice(analysis.previousDay.low, market.priceDecimals)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#848E9C]">Posición actual</span>
                    <span className="text-[#B7BDC6]">
                      {analysis.previousDay.positionLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Contexto Multitemporal 5M / 15M / 1H / 4H */}
            <div className="p-4 lg:col-span-7">
              <h3 className="text-xs font-medium text-[#EAECEF]">
                Contexto multitemporal (5M · 15M · 1H · 4H)
              </h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left font-mono tabular-nums text-[11px]">
                  <thead>
                    <tr className="border-b border-[#1A212E] text-[#848E9C]">
                      <th className="pb-1.5 font-normal">TF</th>
                      <th className="pb-1.5 font-normal">Tendencia</th>
                      <th className="pb-1.5 text-right font-normal">MA7 / MA25</th>
                      <th className="pb-1.5 text-right font-normal">RSI(14)</th>
                      <th className="pb-1.5 text-right font-normal">Vol. rel.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#171D29]">
                    {analysis.multiTimeframe.map((snap) => {
                      const isCurrent = snap.timeframe === timeframe;
                      return (
                        <tr
                          key={snap.timeframe}
                          className={isCurrent ? 'bg-[#151C28]/70' : undefined}
                        >
                          <td
                            className={`py-1.5 font-semibold ${
                              isCurrent ? 'text-[#F0B90B]' : 'text-[#EAECEF]'
                            }`}
                          >
                            {snap.timeframe.toUpperCase()}
                          </td>
                          <td className={`py-1.5 font-medium ${trendTone(snap.trend)}`}>
                            {snap.trend ?? NO_DATA_LABEL}
                          </td>
                          <td className="py-1.5 text-right text-[#B7BDC6]">
                            {snap.ma7 !== null && snap.ma25 !== null
                              ? `${formatPrice(snap.ma7, market.priceDecimals)} / ${formatPrice(
                                  snap.ma25,
                                  market.priceDecimals
                                )}`
                              : NO_DATA_LABEL}
                          </td>
                          <td className="py-1.5 text-right text-[#EAECEF]">
                            {snap.rsi14 !== null ? snap.rsi14.toFixed(1) : NO_DATA_LABEL}
                          </td>
                          <td className="py-1.5 text-right text-[#B7BDC6]">
                            {snap.relativeVolume !== null
                              ? `${snap.relativeVolume.toFixed(2)}x`
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
        </>
      )}
    </section>
  );
}
