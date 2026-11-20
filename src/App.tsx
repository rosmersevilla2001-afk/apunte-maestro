import { AnalysisPanel } from './components/AnalysisPanel';
import { BacktestingPanel } from './components/BacktestingPanel';
import { CandlestickChart } from './components/CandlestickChart';
import { ConnectionPanel } from './components/ConnectionPanel';
import { LimitOperationPanel } from './components/LimitOperationPanel';
import { MarketStrip } from './components/MarketStrip';
import { OpportunityRankingPanel } from './components/OpportunityRankingPanel';
import { OrderBook } from './components/OrderBook';
import { TopBar } from './components/TopBar';
import { useBinanceMarket } from './hooks/useBinanceMarket';

export default function App() {
  const {
    marketId,
    timeframe,
    setMarketId,
    setTimeframe,
    tickers,
    activeTicker,
    priceDirection,
    orderBook,
    orderBooksByMarket,
    candles,
    candlesByMarket,
    analysis,
    feeConfig,
    setFeeConfig,
    simulationConfig,
    limitConfig,
    setLimitConfig,
    dailyStats,
    recordDailyProfit,
    resetDailyProfit,
    trackedLimitsByMarket,
    trackManualLimit,
    clearTrackedLimit,
    opportunities,
    activeOpportunity,
    activeDirection,
    decisionsByMarket,
    activeDecision,
    limitPlansByMarket,
    activeLimitPlan,
    loadingRanking,
    loadingInitial,
    loadingChart,
    error,
    connectionInfo,
    refreshNow,
  } = useBinanceMarket();

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#EAECEF] flex flex-col">
      {/* Top Bar: Brand + Desktop Market Tabs + Connection Indicator & Refresh */}
      <TopBar
        marketId={marketId}
        onSelectMarket={setMarketId}
        tickers={tickers}
        connectionInfo={connectionInfo}
        onRefresh={refreshNow}
      />

      {/* Sections 1 (Mobile Selector), 2 (Price & 24h Stats), 3 (Bid / Ask / Spread) */}
      <MarketStrip
        marketId={marketId}
        onSelectMarket={setMarketId}
        tickers={tickers}
        activeTicker={activeTicker}
        orderBook={orderBook}
        priceDirection={priceDirection}
        loading={loadingInitial}
      />

      {/* Main Trading Analysis Workspace */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 lg:px-6 lg:py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          {/* Primary Column: Candlestick Chart (5) + Technical Analysis Panel (7) */}
          <div className="flex flex-col gap-4 lg:col-span-8">
            <CandlestickChart
              marketId={marketId}
              timeframe={timeframe}
              onSelectTimeframe={setTimeframe}
              candles={candles}
              analysis={analysis}
              loading={loadingChart}
              error={error}
              onRetry={refreshNow}
            />

            <AnalysisPanel
              marketId={marketId}
              timeframe={timeframe}
              analysis={analysis}
              opportunity={activeOpportunity}
              direction={activeDirection}
              decision={activeDecision}
              loading={loadingChart}
            />
          </div>

          {/* Secondary Column: Live Order Book (4) + Connection Status & Data Feed (6) */}
          <div className="flex flex-col gap-4 lg:col-span-4">
            <OrderBook
              marketId={marketId}
              orderBook={orderBook}
              ticker={activeTicker}
              priceDirection={priceDirection}
              isOffline={!connectionInfo.isLive && !loadingInitial}
            />

            <ConnectionPanel
              marketId={marketId}
              connectionInfo={connectionInfo}
              ticker={activeTicker}
              orderBook={orderBook}
              onReconnect={refreshNow}
            />
          </div>
        </div>

        {/* Multi-Market Opportunity Engine & Decision Engine Ranking Panel */}
        <OpportunityRankingPanel
          opportunities={opportunities}
          decisionsByMarket={decisionsByMarket}
          selectedMarketId={marketId}
          onSelectMarket={setMarketId}
          feeConfig={feeConfig}
          onChangeFees={setFeeConfig}
          isBinanceLive={connectionInfo.isLive}
          loading={loadingRanking}
        />

        {/* Manual Spot LIMIT Operation Engine (replaces Stop Loss/R:R approval) */}
        <LimitOperationPanel
          selectedMarketId={marketId}
          onSelectMarket={setMarketId}
          opportunities={opportunities}
          limitPlansByMarket={limitPlansByMarket}
          activePlan={activeLimitPlan}
          limitConfig={limitConfig}
          onChangeLimitConfig={setLimitConfig}
          feeConfig={feeConfig}
          onChangeFees={setFeeConfig}
          dailyStats={dailyStats}
          onRecordDailyProfit={recordDailyProfit}
          onResetDailyProfit={resetDailyProfit}
          trackedLimitsByMarket={trackedLimitsByMarket}
          onTrackManualLimit={trackManualLimit}
          onClearTrackedLimit={clearTrackedLimit}
          isBinanceLive={connectionInfo.isLive}
        />

        {/* Historical Backtesting Laboratory (Strict Zero-Lookahead Replay) */}
        <BacktestingPanel
          activeMarketId={marketId}
          candlesByMarket={candlesByMarket}
          tickers={tickers}
          orderBooksByMarket={orderBooksByMarket}
          simulationConfig={simulationConfig}
          feeConfig={feeConfig}
          loadingRanking={loadingRanking}
        />
      </main>

      {/* Quiet Informational Footer */}
      <footer className="border-t border-[#1F2735] bg-[#0B0E14]">
        <div className="mx-auto flex max-w-[1600px] flex-col items-start justify-between gap-2 px-4 py-3 text-xs text-[#848E9C] sm:flex-row sm:items-center lg:px-6">
          <span>SPOT MASTER · Plataforma de análisis de mercado Binance Spot</span>
          <span>Datos públicos en tiempo real · Modo solo lectura (sin ejecución de órdenes)</span>
        </div>
      </footer>
    </div>
  );
}
