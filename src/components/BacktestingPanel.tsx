import { useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, History } from 'lucide-react';
import {
  MARKETS,
  MARKET_MAP,
  NO_DATA_LABEL,
  formatPrice,
  formatSignedPercent,
} from '../config/markets';
import { runHistoricalBacktest } from '../services/analysis/backtestEngine';
import type {
  BacktestOutcome,
  BacktestPeriodPreset,
  Candle,
  DecisionState,
  FeeConfig,
  MarketBacktestResult,
  MarketId,
  OrderBookData,
  SimulationConfig,
  Ticker24h,
  Timeframe,
} from '../types/market';

interface BacktestingPanelProps {
  activeMarketId: MarketId;
  candlesByMarket: Partial<Record<MarketId, Partial<Record<Timeframe, Candle[]>>>>;
  tickers: Partial<Record<MarketId, Ticker24h>>;
  orderBooksByMarket: Partial<Record<MarketId, OrderBookData>>;
  simulationConfig: SimulationConfig;
  feeConfig: FeeConfig;
  loadingRanking: boolean;
}

type SignalFilter = 'ALL' | 'BUY' | 'WAIT' | 'NO TRADE';

const PERIOD_OPTIONS: Array<{ id: BacktestPeriodPreset; label: string }> = [
  { id: 'all', label: 'Todo el histórico' },
  { id: '48h', label: 'Últimas 48h' },
  { id: '24h', label: 'Últimas 24h' },
];

function formatDateTime(tsSec: number | null): string {
  if (tsSec === null || !Number.isFinite(tsSec)) return NO_DATA_LABEL;
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(tsSec * 1000));
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

function decisionPillClass(state: DecisionState): string {
  if (state === 'BUY') return 'border-[#0ECB81]/35 bg-[#0ECB81]/10 text-[#0ECB81]';
  if (state === 'WAIT') return 'border-[#F0B90B]/35 bg-[#F0B90B]/10 text-[#F0B90B]';
  return 'border-[#F6465D]/35 bg-[#F6465D]/10 text-[#F6465D]';
}

function outcomeClass(outcome: BacktestOutcome, tradeOpened: boolean): string {
  if (!tradeOpened) return 'text-[#848E9C]';
  if (outcome === 'ganador') return 'text-[#0ECB81] font-semibold';
  if (outcome === 'perdedor') return 'text-[#F6465D] font-semibold';
  return 'text-[#F0B90B]';
}

export function BacktestingPanel({
  activeMarketId,
  candlesByMarket,
  tickers,
  orderBooksByMarket,
  simulationConfig,
  feeConfig,
  loadingRanking,
}: BacktestingPanelProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<MarketId>(activeMarketId);
  const [periodPreset, setPeriodPreset] = useState<BacktestPeriodPreset>('all');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');

  // Build a stable fingerprint of ONLY closed historical candles + spread presence so
  // high-frequency live open-candle ticks never re-trigger full historical backtests.
  const closedHistoryKey = useMemo(() => {
    return MARKETS.map((m) => {
      const cMap = candlesByMarket[m.id];
      const c15 = (cMap?.['15m'] ?? []).filter((c) => c.isClosed);
      const c1h = (cMap?.['1h'] ?? []).filter((c) => c.isClosed);
      const c4h = (cMap?.['4h'] ?? []).filter((c) => c.isClosed);
      const ob = orderBooksByMarket[m.id];
      const t = tickers[m.id];
      const bid = ob?.bids[0]?.price ?? t?.bidPrice ?? 0;
      const ask = ob?.asks[0]?.price ?? t?.askPrice ?? 0;
      const spBucket = bid > 0 && ask >= bid ? Math.round(((ask - bid) / ask) * 100000) : -1;
      const hasBook = ob && ob.bids.length > 0 && ob.asks.length > 0 ? 1 : 0;
      return `${m.id}:${c15.length}:${c15[c15.length - 1]?.time ?? 0}:${c1h.length}:${c4h.length}:${hasBook}:${spBucket}`;
    }).join('|');
  }, [candlesByMarket, orderBooksByMarket, tickers]);

  // Run strictly causal backtest across all 4 markets using exact current rules & config
  const resultsByMarket: Record<MarketId, MarketBacktestResult> = useMemo(() => {
    // Reference closedHistoryKey to tie recomputation strictly to closed candles & config
    void closedHistoryKey;
    const map = {} as Record<MarketId, MarketBacktestResult>;
    for (const m of MARKETS) {
      map[m.id] = runHistoricalBacktest(
        {
          marketId: m.id,
          candlesByTimeframe: candlesByMarket[m.id] ?? {},
          liveTicker: tickers[m.id] ?? null,
          liveOrderBook: orderBooksByMarket[m.id] ?? null,
        },
        periodPreset,
        simulationConfig,
        feeConfig
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedHistoryKey, periodPreset, simulationConfig, feeConfig]);

  const selectedResult = resultsByMarket[selectedMarketId];
  const selectedMarket = MARKET_MAP[selectedMarketId];

  const filteredRecords = useMemo(() => {
    if (!selectedResult.hasSufficientData) return [];
    const list =
      signalFilter === 'ALL'
        ? selectedResult.records
        : selectedResult.records.filter((r) => r.decisionState === signalFilter);
    return list;
  }, [selectedResult, signalFilter]);

  return (
    <section
      aria-label="Laboratorio de Backtesting Histórico"
      className="mt-4 border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      {/* Header + Market / Timeframe / Period Controls */}
      <div className="flex flex-col gap-3 border-b border-[#1F2735] px-4 py-3.5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FlaskConical className="h-4 w-4 shrink-0 text-[#F0B90B]" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-[#EAECEF]">
              Backtesting · Laboratorio Histórico
            </h2>
            <span className="text-xs text-[#848E9C]">
              · Timeframe principal: 15M (contexto causal 1H / 4H)
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#848E9C]">
            Recorrido cronológico sin anticipación de velas futuras, aplicando exactamente las reglas actuales de Oportunidad, Decisión y Gestión de Riesgo.
          </p>
        </div>

        {/* Selectors: Market + Period */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Market selector */}
          <div className="flex items-center gap-1 rounded border border-[#242D3D] bg-[#0B0E14] p-0.5">
            {MARKETS.map((m) => {
              const active = m.id === selectedMarketId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMarketId(m.id)}
                  className={`rounded px-2 py-1 font-display text-[11px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1D2534] text-[#F0B90B]'
                      : 'text-[#848E9C] hover:text-[#EAECEF]'
                  }`}
                >
                  {m.id}
                </button>
              );
            })}
          </div>

          {/* Primary timeframe indicator (fixed 15M per specification) */}
          <span className="rounded border border-[#242D3D] bg-[#0E131B] px-2 py-1 font-mono text-[11px] text-[#EAECEF]">
            TF: 15M
          </span>

          {/* Period preset selector */}
          <div className="flex items-center gap-1 rounded border border-[#242D3D] bg-[#0B0E14] p-0.5">
            {PERIOD_OPTIONS.map((opt) => {
              const active = opt.id === periodPreset;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriodPreset(opt.id)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#1D2534] text-[#EAECEF]'
                      : 'text-[#848E9C] hover:text-[#EAECEF]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mandatory Prominent Historical Simulation Disclaimer */}
      <div className="flex flex-col justify-between gap-2 border-b border-[#1F2735] bg-[#18130B] px-4 py-2.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#F0B90B]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            BACKTEST HISTÓRICO — RESULTADOS SIMULADOS. NO REPRESENTAN GANANCIAS FUTURAS.
          </span>
        </div>

        <span className="font-mono tabular-nums text-[11px] text-[#B7BDC6]">
          Capital: {simulationConfig.availableCapitalUsdt.toLocaleString('en-US')} USDT ·{' '}
          {simulationConfig.capitalAllocationPct}%/op · Comis:{' '}
          {feeConfig.buyFeePct.toFixed(2).replace('.', ',')}% /{' '}
          {feeConfig.sellFeePct.toFixed(2).replace('.', ',')}%
        </span>
      </div>

      {/* Loaded Historical Window Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F2735] bg-[#0E131B] px-4 py-2 font-mono tabular-nums text-[11px] text-[#848E9C]">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Mercado: <strong className="text-[#EAECEF]">{selectedMarketId}</strong>
          </span>
          <span>
            Ventana evaluada:{' '}
            <strong className="text-[#B7BDC6]">
              {selectedResult.hasSufficientData
                ? `${formatDateTime(selectedResult.startTimestampSec)} → ${formatDateTime(
                    selectedResult.endTimestampSec
                  )}`
                : NO_DATA_LABEL}
            </strong>
          </span>
          <span>
            Velas 15M reales:{' '}
            <strong className="text-[#B7BDC6]">
              {selectedResult.evaluatedCandles} evaluadas / {selectedResult.totalLoaded15mCandles}{' '}
              cerradas cargadas
            </strong>
          </span>
        </div>

        <span>
          Spread real disponible:{' '}
          <strong className="text-[#F0B90B]">
            {selectedResult.spreadPctUsed !== null
              ? `${selectedResult.spreadPctUsed.toFixed(3)}%`
              : NO_DATA_LABEL}
          </strong>
        </span>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-5">
        {!selectedResult.hasSufficientData || !selectedResult.summary ? (
          <div className="rounded border border-[#1F2735] bg-[#0E131B] px-4 py-6 text-center">
            <p className="font-display text-sm font-semibold text-[#F0B90B]">
              Datos históricos insuficientes
            </p>
            <p className="mt-1 text-xs text-[#848E9C]">
              {loadingRanking
                ? 'Descargando histórico real 15M/1H/4H desde Binance...'
                : (selectedResult.insufficientReason ??
                  'El histórico real cargado desde Binance aún no alcanza para una prueba cronológica válida.')}
            </p>
          </div>
        ) : (
          <>
            {/* 13-Metric Summary Grid */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 font-mono tabular-nums text-xs">
              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">Total de señales</dt>
                <dd className="mt-1 text-base font-bold text-[#EAECEF]">
                  {selectedResult.summary.totalSignals}
                </dd>
                <p className="font-sans text-[10px] text-[#848E9C]">Velas 15M auditadas</p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">BUY generados</dt>
                <dd className="mt-1 text-base font-bold text-[#0ECB81]">
                  {selectedResult.summary.buySignals}
                </dd>
                <p className="font-sans text-[10px] text-[#848E9C]">
                  {selectedResult.summary.executedTrades} ejec. ·{' '}
                  {selectedResult.summary.skippedBuySignals} omit.
                </p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">WAIT / NO TRADE</dt>
                <dd className="mt-1 text-base font-bold text-[#EAECEF]">
                  <span className="text-[#F0B90B]">{selectedResult.summary.waitSignals}</span>
                  <span className="mx-1 text-[#4B5565]">/</span>
                  <span className="text-[#F6465D]">{selectedResult.summary.noTradeSignals}</span>
                </dd>
                <p className="font-sans text-[10px] text-[#848E9C]">WAIT / NO TRADE</p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">Ganadoras / Perdedoras</dt>
                <dd className="mt-1 text-base font-bold">
                  <span className="text-[#0ECB81]">{selectedResult.summary.winningTrades}</span>
                  <span className="mx-1 text-[#4B5565]">/</span>
                  <span className="text-[#F6465D]">{selectedResult.summary.losingTrades}</span>
                </dd>
                <p className="font-sans text-[10px] text-[#848E9C]">
                  Sin resultado: {selectedResult.summary.unresolvedTrades}
                </p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">Tasa de acierto</dt>
                <dd className="mt-1 text-base font-bold text-[#EAECEF]">
                  {selectedResult.summary.winRatePct !== null
                    ? `${selectedResult.summary.winRatePct.toFixed(1)}%`
                    : NO_DATA_LABEL}
                </dd>
                <p className="font-sans text-[10px] text-[#848E9C]">Sobre operaciones cerradas</p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">Resultado neto</dt>
                <dd
                  className={`mt-1 text-base font-bold ${
                    selectedResult.summary.netResultUsdt > 0
                      ? 'text-[#0ECB81]'
                      : selectedResult.summary.netResultUsdt < 0
                        ? 'text-[#F6465D]'
                        : 'text-[#EAECEF]'
                  }`}
                >
                  {formatUsdt(selectedResult.summary.netResultUsdt, true)}
                </dd>
                <p className="text-[10px] text-[#848E9C]">
                  {formatSignedPercent(selectedResult.summary.netResultPct)} · Final:{' '}
                  {selectedResult.summary.finalCapitalUsdt.toFixed(2)}
                </p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">Comisiones acum.</dt>
                <dd className="mt-1 text-base font-bold text-[#F0B90B]">
                  {formatUsdt(selectedResult.summary.accumulatedFeesUsdt)}
                </dd>
                <p className="text-[10px] text-[#848E9C]">
                  Spread: {selectedResult.summary.accumulatedSpreadUsdt.toFixed(2)} USDT
                </p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">Máximo drawdown</dt>
                <dd className="mt-1 text-base font-bold text-[#F6465D]">
                  -{selectedResult.summary.maxDrawdownUsdt.toFixed(2)} USDT
                </dd>
                <p className="text-[10px] text-[#848E9C]">
                  -{selectedResult.summary.maxDrawdownPct.toFixed(2)}% del pico
                </p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">R/B promedio</dt>
                <dd className="mt-1 text-base font-bold text-[#EAECEF]">
                  {selectedResult.summary.averageRiskReward !== null
                    ? `1 : ${selectedResult.summary.averageRiskReward.toFixed(2)}`
                    : NO_DATA_LABEL}
                </dd>
                <p className="font-sans text-[10px] text-[#848E9C]">R/B neta ejecutada</p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3 sm:col-span-2 lg:col-span-2">
                <dt className="font-sans text-[11px] text-[#848E9C]">Mejor operación</dt>
                <dd className="mt-1 text-base font-bold text-[#0ECB81]">
                  {selectedResult.summary.bestTradeUsdt !== null
                    ? formatUsdt(selectedResult.summary.bestTradeUsdt, true)
                    : NO_DATA_LABEL}
                </dd>
                <p className="text-[10px] text-[#848E9C]">
                  {selectedResult.summary.bestTradeTimestampSec !== null
                    ? formatDateTime(selectedResult.summary.bestTradeTimestampSec)
                    : 'Sin operaciones cerradas'}
                </p>
              </div>

              <div className="rounded border border-[#1F2735] bg-[#0E131B] p-3 sm:col-span-2 lg:col-span-3">
                <dt className="font-sans text-[11px] text-[#848E9C]">Peor operación</dt>
                <dd className="mt-1 text-base font-bold text-[#F6465D]">
                  {selectedResult.summary.worstTradeUsdt !== null
                    ? formatUsdt(selectedResult.summary.worstTradeUsdt, true)
                    : NO_DATA_LABEL}
                </dd>
                <p className="text-[10px] text-[#848E9C]">
                  {selectedResult.summary.worstTradeTimestampSec !== null
                    ? formatDateTime(selectedResult.summary.worstTradeTimestampSec)
                    : 'Sin operaciones cerradas'}
                </p>
              </div>
            </dl>
          </>
        )}

        {/* Comparison Table Across All 4 Markets */}
        <div className="border-t border-[#1A212E] pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xs font-semibold text-[#EAECEF]">
              Comparación histórica entre los 4 mercados (15M · mismas reglas)
            </h3>
            <span className="text-[11px] text-[#848E9C]">
              Haz clic en cualquier mercado para auditar su historial cronológico
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left font-mono tabular-nums text-[11px]">
              <thead>
                <tr className="border-b border-[#1F2735] text-[#848E9C]">
                  <th className="py-2 pr-3 font-sans font-medium">Mercado</th>
                  <th className="py-2 pr-3 text-right font-sans font-medium">Señales</th>
                  <th className="py-2 pr-3 text-right font-sans font-medium">
                    BUY / WAIT / NO TRADE
                  </th>
                  <th className="py-2 pr-3 text-right font-sans font-medium">
                    Gan. / Perd. / S.R.
                  </th>
                  <th className="py-2 pr-3 text-right font-sans font-medium">Acierto</th>
                  <th className="py-2 pr-3 text-right font-sans font-medium">Resultado neto</th>
                  <th className="py-2 pr-3 text-right font-sans font-medium">Comisiones</th>
                  <th className="py-2 pr-3 text-right font-sans font-medium">Máx. DD</th>
                  <th className="py-2 text-right font-sans font-medium">R/B prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171D29]">
                {MARKETS.map((m) => {
                  const res = resultsByMarket[m.id];
                  const isRowSelected = m.id === selectedMarketId;
                  const s = res.summary;

                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMarketId(m.id)}
                      className={`cursor-pointer transition-colors ${
                        isRowSelected ? 'bg-[#151C28]' : 'hover:bg-[#131924]'
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-display font-bold text-[#EAECEF]">
                        {m.id}
                        {isRowSelected && (
                          <span className="ml-1.5 font-sans text-[10px] font-normal text-[#F0B90B]">
                            · Activo
                          </span>
                        )}
                      </td>

                      {!res.hasSufficientData || !s ? (
                        <td colSpan={8} className="py-2.5 text-right font-sans text-[#848E9C]">
                          Datos históricos insuficientes
                        </td>
                      ) : (
                        <>
                          <td className="py-2.5 pr-3 text-right text-[#B7BDC6]">
                            {s.totalSignals}
                          </td>
                          <td className="py-2.5 pr-3 text-right">
                            <span className="text-[#0ECB81]">{s.buySignals}</span>
                            <span className="mx-1 text-[#4B5565]">/</span>
                            <span className="text-[#F0B90B]">{s.waitSignals}</span>
                            <span className="mx-1 text-[#4B5565]">/</span>
                            <span className="text-[#F6465D]">{s.noTradeSignals}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-right">
                            <span className="text-[#0ECB81]">{s.winningTrades}</span>
                            <span className="mx-1 text-[#4B5565]">/</span>
                            <span className="text-[#F6465D]">{s.losingTrades}</span>
                            <span className="mx-1 text-[#4B5565]">/</span>
                            <span className="text-[#848E9C]">{s.unresolvedTrades}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-right text-[#EAECEF]">
                            {s.winRatePct !== null ? `${s.winRatePct.toFixed(1)}%` : NO_DATA_LABEL}
                          </td>
                          <td
                            className={`py-2.5 pr-3 text-right font-semibold ${
                              s.netResultUsdt > 0
                                ? 'text-[#0ECB81]'
                                : s.netResultUsdt < 0
                                  ? 'text-[#F6465D]'
                                  : 'text-[#B7BDC6]'
                            }`}
                          >
                            {formatUsdt(s.netResultUsdt, true)}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-[#F0B90B]">
                            {s.accumulatedFeesUsdt.toFixed(2)} USDT
                          </td>
                          <td className="py-2.5 pr-3 text-right text-[#F6465D]">
                            -{s.maxDrawdownPct.toFixed(2)}%
                          </td>
                          <td className="py-2.5 text-right text-[#EAECEF]">
                            {s.averageRiskReward !== null
                              ? `1 : ${s.averageRiskReward.toFixed(2)}`
                              : NO_DATA_LABEL}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chronological Audit Table */}
        {selectedResult.hasSufficientData && (
          <div className="border-t border-[#1A212E] pt-4">
            <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-[#F0B90B]" aria-hidden="true" />
                <h3 className="font-display text-xs font-semibold text-[#EAECEF]">
                  Registro cronológico auditable · {selectedMarketId} ({filteredRecords.length}{' '}
                  registros)
                </h3>
              </div>

              {/* Filter by Decision State */}
              <div className="flex flex-wrap items-center gap-1 rounded border border-[#242D3D] bg-[#0B0E14] p-0.5 text-[11px]">
                {(
                  [
                    { id: 'ALL', label: `Todas (${selectedResult.records.length})` },
                    { id: 'BUY', label: `BUY (${selectedResult.summary?.buySignals ?? 0})` },
                    { id: 'WAIT', label: `WAIT (${selectedResult.summary?.waitSignals ?? 0})` },
                    {
                      id: 'NO TRADE',
                      label: `NO TRADE (${selectedResult.summary?.noTradeSignals ?? 0})`,
                    },
                  ] as Array<{ id: SignalFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSignalFilter(tab.id)}
                    className={`rounded px-2 py-0.5 font-mono transition-colors cursor-pointer ${
                      signalFilter === tab.id
                        ? 'bg-[#1D2534] text-[#EAECEF]'
                        : 'text-[#848E9C] hover:text-[#EAECEF]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="rounded border border-[#1F2735] bg-[#0E131B] px-4 py-5 text-center text-xs text-[#848E9C]">
                No se generaron señales con estado <strong>{signalFilter}</strong> en el período histórico seleccionado para {selectedMarketId}.
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto rounded border border-[#1F2735] bg-[#0E131B]">
                <table className="w-full min-w-[980px] text-left font-mono tabular-nums text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#11161F] text-[#848E9C] shadow-[inset_0_-1px_0_0_#1F2735]">
                    <tr>
                      <th className="px-3 py-2 font-sans font-medium">Fecha y hora</th>
                      <th className="px-3 py-2 text-right font-sans font-medium">Entrada</th>
                      <th className="px-3 py-2 font-sans font-medium">Estado</th>
                      <th className="px-3 py-2 text-right font-sans font-medium">Stop Loss</th>
                      <th className="px-3 py-2 text-right font-sans font-medium">TP (R1)</th>
                      <th className="px-3 py-2 font-sans font-medium">Resultado</th>
                      <th className="px-3 py-2 text-right font-sans font-medium">Neto (USDT)</th>
                      <th className="px-3 py-2 text-right font-sans font-medium">R/B</th>
                      <th className="px-3 py-2 text-right font-sans font-medium">Duración</th>
                      <th className="px-3 py-2 font-sans font-medium">Auditoría</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#171D29]">
                    {filteredRecords.map((rec) => (
                      <tr
                        key={rec.id}
                        className={
                          rec.tradeOpened
                            ? 'bg-[#121D1A]/60 hover:bg-[#162420]'
                            : 'hover:bg-[#131924]'
                        }
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-[#B7BDC6]">
                          {formatDateTime(rec.timestampSec)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-[#EAECEF]">
                          {formatPrice(rec.entryPrice, selectedMarket.priceDecimals)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 font-display text-[10px] font-bold ${decisionPillClass(
                              rec.decisionState
                            )}`}
                          >
                            {rec.decisionState}
                          </span>
                          {rec.opportunityScore !== null && (
                            <span className="ml-1.5 text-[10px] text-[#848E9C]">
                              {rec.opportunityScore}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-[#F6465D]">
                          {rec.stopLoss !== null
                            ? formatPrice(rec.stopLoss, selectedMarket.priceDecimals)
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-[#0ECB81]">
                          {rec.takeProfit !== null
                            ? formatPrice(rec.takeProfit, selectedMarket.priceDecimals)
                            : '—'}
                        </td>
                        <td
                          className={`px-3 py-2 whitespace-nowrap capitalize ${outcomeClass(
                            rec.outcome,
                            rec.tradeOpened
                          )}`}
                        >
                          {rec.outcome}
                        </td>
                        <td
                          className={`px-3 py-2 text-right whitespace-nowrap font-semibold ${
                            rec.netResultUsdt !== null
                              ? rec.netResultUsdt > 0
                                ? 'text-[#0ECB81]'
                                : 'text-[#F6465D]'
                              : 'text-[#848E9C]'
                          }`}
                        >
                          {rec.netResultUsdt !== null
                            ? `${rec.netResultUsdt >= 0 ? '+' : ''}${rec.netResultUsdt.toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-[#B7BDC6]">
                          {rec.riskRewardRatio !== null
                            ? `1:${rec.riskRewardRatio.toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-[#848E9C]">
                          {formatDuration(rec.durationMinutes)}
                        </td>
                        <td className="max-w-[320px] px-3 py-2 font-sans text-[11px] text-[#B7BDC6]">
                          <span className="line-clamp-2" title={rec.auditReason}>
                            {rec.auditReason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
