import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MARKETS, MARKET_MAP, TIMEFRAMES, TIMEFRAME_MAP } from '../config/markets';
import { evaluateMarketDecision } from '../services/analysis/decisionEngine';
import { rankMarketOpportunities } from '../services/analysis/opportunityEngine';
import { computeTechnicalAnalysis } from '../services/analysis/technicalAnalysis';
import { simulateMarketTrade } from '../services/analysis/tradeSimulator';
import {
  fetchAllMarketTickers,
  fetchKlines,
  fetchOrderBook,
  getActiveRestEndpoint,
} from '../services/binance/restClient';
import { BINANCE_WS_ENDPOINTS, BinanceMarketStream } from '../services/binance/wsClient';
import type {
  Candle,
  ConnectionInfo,
  FeeConfig,
  MarketDecision,
  MarketId,
  MarketOpportunity,
  OrderBookData,
  SimulationConfig,
  TechnicalAnalysis,
  Ticker24h,
  Timeframe,
  TradeSimulation,
} from '../types/market';

export interface UseBinanceMarketResult {
  marketId: MarketId;
  timeframe: Timeframe;
  setMarketId: (id: MarketId) => void;
  setTimeframe: (tf: Timeframe) => void;
  tickers: Partial<Record<MarketId, Ticker24h>>;
  activeTicker: Ticker24h | null;
  priceDirection: 'up' | 'down' | 'flat';
  orderBook: OrderBookData | null;
  orderBooksByMarket: Partial<Record<MarketId, OrderBookData>>;
  candles: Candle[];
  candlesByMarket: Partial<Record<MarketId, Partial<Record<Timeframe, Candle[]>>>>;
  analysis: TechnicalAnalysis | null;
  feeConfig: FeeConfig;
  setFeeConfig: (next: FeeConfig) => void;
  simulationConfig: SimulationConfig;
  setSimulationConfig: (next: SimulationConfig) => void;
  opportunities: MarketOpportunity[];
  activeOpportunity: MarketOpportunity | null;
  decisionsByMarket: Record<MarketId, MarketDecision>;
  activeDecision: MarketDecision | null;
  simulationsByMarket: Record<MarketId, TradeSimulation>;
  activeSimulation: TradeSimulation | null;
  loadingRanking: boolean;
  loadingInitial: boolean;
  loadingChart: boolean;
  error: string | null;
  connectionInfo: ConnectionInfo;
  refreshNow: () => void;
}

const RANKING_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h'];

export function useBinanceMarket(): UseBinanceMarketResult {
  const [marketId, setMarketIdState] = useState<MarketId>('USDT/COP');
  const [timeframe, setTimeframeState] = useState<Timeframe>('15m');
  const [tickers, setTickers] = useState<Partial<Record<MarketId, Ticker24h>>>({});
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'flat'>('flat');
  const [orderBooksByMarket, setOrderBooksByMarket] = useState<
    Partial<Record<MarketId, OrderBookData>>
  >({});
  const [candlesByMarket, setCandlesByMarket] = useState<
    Partial<Record<MarketId, Partial<Record<Timeframe, Candle[]>>>>
  >({});
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({
    buyFeePct: 0.1,
    sellFeePct: 0.1,
  });
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    availableCapitalUsdt: 1300,
    capitalAllocationPct: 10,
  });

  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingChart, setLoadingChart] = useState<boolean>(true);
  const [loadingRanking, setLoadingRanking] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState<number>(0);
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    state: 'connecting',
    isLive: false,
    protocol: 'WebSocket',
    restEndpoint: getActiveRestEndpoint(),
    wsEndpoint: BINANCE_WS_ENDPOINTS[0],
    activeStreams: [],
    lastUpdatedAt: null,
    lastError: null,
    reconnectAttempts: 0,
  });

  const prevPriceRef = useRef<number | null>(null);
  const wsConnectedRef = useRef<boolean>(false);
  const restOkRef = useRef<boolean>(false);

  const market = MARKET_MAP[marketId];
  const timeframeConfig = TIMEFRAME_MAP[timeframe];

  const setMarketId = useCallback(
    (next: MarketId) => {
      if (next === marketId) return;
      prevPriceRef.current = null;
      setPriceDirection('flat');
      setLoadingChart(true);
      setError(null);
      setMarketIdState(next);
    },
    [marketId]
  );

  const setTimeframe = useCallback(
    (next: Timeframe) => {
      if (next === timeframe) return;
      setLoadingChart(true);
      setError(null);
      setTimeframeState(next);
    },
    [timeframe]
  );

  const refreshNow = useCallback(() => {
    setError(null);
    setReconnectNonce((n) => n + 1);
  }, []);

  // Periodic staleness clock tick (every 10s) so expired data invalidates cleanly
  useEffect(() => {
    const id = window.setInterval(() => setClockTick(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // Immediately reflect browser network loss / restoration
  useEffect(() => {
    const handleOffline = () => {
      wsConnectedRef.current = false;
      restOkRef.current = false;
      setConnectionInfo((prev) => ({
        ...prev,
        state: 'error',
        isLive: false,
        lastError: 'Sin conexión a internet',
      }));
    };

    const handleOnline = () => {
      setReconnectNonce((n) => n + 1);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Multi-market public Binance scanner: loads real 15M/1H/4H history + depth for ALL 4 markets
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const syncAllMarketsForRanking = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setLoadingRanking(false);
        return;
      }

      try {
        const [allTickers, ...marketResults] = await Promise.all([
          fetchAllMarketTickers(controller.signal).catch(() => null),
          ...MARKETS.map(async (m) => {
            const [bookResult, ...klineResults] = await Promise.allSettled([
              fetchOrderBook(m, 20, controller.signal),
              ...RANKING_TIMEFRAMES.map((tf) =>
                fetchKlines(m, tf, TIMEFRAME_MAP[tf].limit, controller.signal).then((data) => ({
                  tf,
                  data,
                }))
              ),
            ]);

            const book = bookResult.status === 'fulfilled' ? bookResult.value : null;
            const klines: Partial<Record<Timeframe, Candle[]>> = {};
            for (const kr of klineResults) {
              if (kr.status === 'fulfilled' && kr.value.data.length > 0) {
                klines[kr.value.tf] = kr.value.data;
              }
            }

            return { marketId: m.id, book, klines };
          }),
        ]);

        if (disposed) return;

        if (allTickers) {
          setTickers((prev) => {
            const merged = { ...prev };
            for (const key of Object.keys(allTickers) as MarketId[]) {
              const incoming = allTickers[key];
              if (incoming) {
                merged[key] = incoming;
              }
            }
            return merged;
          });
        }

        setOrderBooksByMarket((prev) => {
          const next = { ...prev };
          for (const item of marketResults) {
            if (item.book) {
              next[item.marketId] = item.book;
            }
          }
          return next;
        });

        setCandlesByMarket((prev) => {
          const next = { ...prev };
          for (const item of marketResults) {
            const existing = next[item.marketId] ?? {};
            next[item.marketId] = {
              ...existing,
              ...item.klines,
            };
          }
          return next;
        });

        setLoadingRanking(false);
      } catch {
        if (!disposed) {
          setLoadingRanking(false);
        }
      }
    };

    syncAllMarketsForRanking();

    // Refresh secondary markets' books & klines periodically so ranking stays genuinely up to date
    const rankingInterval = window.setInterval(() => {
      if (!disposed) {
        syncAllMarketsForRanking();
      }
    }, 30_000);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(rankingInterval);
    };
  }, [reconnectNonce]);

  // Ensure all 4 timeframes (including 5M) are loaded for the currently selected market
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const loadSelectedMarketTimeframes = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const results = await Promise.allSettled(
        TIMEFRAMES.map((tf) =>
          fetchKlines(market, tf.id, tf.limit, controller.signal).then((data) => ({
            tf: tf.id,
            data,
          }))
        )
      );

      if (disposed) return;

      setCandlesByMarket((prev) => {
        const currentMarketMap = { ...(prev[market.id] ?? {}) };
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.data.length > 0) {
            if (!currentMarketMap[r.value.tf] || r.value.tf !== timeframe) {
              currentMarketMap[r.value.tf] = r.value.data;
            }
          }
        }
        return {
          ...prev,
          [market.id]: currentMarketMap,
        };
      });
    };

    loadSelectedMarketTimeframes();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [market, reconnectNonce]);

  // Active market + active timeframe live REST snapshot + WebSocket combined stream
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let fallbackInterval: number | null = null;
    let freshnessInterval: number | null = null;
    let pendingWsCandle: Candle | null = null;
    let historyLoaded = false;

    const historyLimit = timeframeConfig.limit;
    const maxBufferCandles = historyLimit + 24;

    wsConnectedRef.current = false;
    restOkRef.current = false;
    setLoadingChart(true);
    setConnectionInfo((prev) => ({
      ...prev,
      state: 'connecting',
      isLive: prev.isLive,
      lastError: null,
    }));

    const mergeCandleIntoSeries = (series: Candle[], incoming: Candle): Candle[] => {
      if (series.length === 0) return [incoming];
      const last = series[series.length - 1];
      if (last.time === incoming.time) {
        const copy = series.slice();
        copy[copy.length - 1] = incoming;
        return copy;
      }
      if (incoming.time > last.time) {
        const next = [...series, incoming];
        return next.length > maxBufferCandles
          ? next.slice(next.length - maxBufferCandles)
          : next;
      }
      return series;
    };

    const loadRestSnapshot = async (isFallbackPoll = false) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        restOkRef.current = false;
        setConnectionInfo((prev) => ({
          ...prev,
          state: 'error',
          isLive: false,
          lastError: 'Sin conexión a internet',
        }));
        return;
      }

      try {
        const [allTickers, book, klines] = await Promise.all([
          fetchAllMarketTickers(controller.signal),
          fetchOrderBook(market, 20, controller.signal),
          fetchKlines(market, timeframe, historyLimit, controller.signal),
        ]);

        if (disposed) return;

        setTickers((prev) => {
          const merged = { ...prev };
          for (const key of Object.keys(allTickers) as MarketId[]) {
            const incoming = allTickers[key];
            if (incoming) {
              merged[key] = incoming;
            }
          }
          return merged;
        });

        const nextActive = allTickers[market.id];
        if (nextActive && nextActive.price !== null) {
          if (prevPriceRef.current !== null && nextActive.price !== prevPriceRef.current) {
            setPriceDirection(nextActive.price > prevPriceRef.current ? 'up' : 'down');
          }
          prevPriceRef.current = nextActive.price;
        }

        setOrderBooksByMarket((prev) => ({
          ...prev,
          [market.id]: book,
        }));

        const mergedKlines =
          pendingWsCandle !== null
            ? mergeCandleIntoSeries(klines, pendingWsCandle)
            : klines;
        historyLoaded = true;
        setCandlesByMarket((prev) => ({
          ...prev,
          [market.id]: {
            ...(prev[market.id] ?? {}),
            [timeframe]: mergedKlines,
          },
        }));

        setLoadingInitial(false);
        setLoadingChart(false);
        setError(null);
        restOkRef.current = true;

        const now = Date.now();
        setConnectionInfo((prev) => ({
          ...prev,
          restEndpoint: getActiveRestEndpoint(),
          lastUpdatedAt: now,
          isLive: true,
          state: wsConnectedRef.current
            ? 'connected_ws'
            : isFallbackPoll
              ? 'fallback_rest'
              : prev.state === 'connecting'
                ? 'fallback_rest'
                : prev.state,
          protocol: wsConnectedRef.current ? 'WebSocket' : 'REST',
          lastError: wsConnectedRef.current ? null : prev.lastError,
        }));
      } catch (err) {
        if (disposed || controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Error consultando datos públicos de Binance';
        restOkRef.current = false;
        setError(message);
        setLoadingInitial(false);
        setLoadingChart(false);
        setConnectionInfo((prev) => ({
          ...prev,
          state: wsConnectedRef.current ? 'connected_ws' : 'error',
          isLive: wsConnectedRef.current,
          lastError: message,
        }));
      }
    };

    loadRestSnapshot(false);

    // Real-time Binance WebSocket combined stream (active market depth/kline + all 4 tickers/bookTickers)
    const stream = new BinanceMarketStream(market, timeframe, {
      onTickerUpdate: (id, patch) => {
        if (disposed) return;
        const now = Date.now();

        if (id === market.id && typeof patch.price === 'number' && patch.price > 0) {
          if (prevPriceRef.current !== null && patch.price !== prevPriceRef.current) {
            setPriceDirection(patch.price > prevPriceRef.current ? 'up' : 'down');
          }
          prevPriceRef.current = patch.price;
        }

        setTickers((prev) => {
          const existing = prev[id];
          const base: Ticker24h = existing ?? {
            marketId: id,
            price: null,
            priceChange: null,
            priceChangePercent: null,
            highPrice: null,
            lowPrice: null,
            openPrice: null,
            volumeBase: null,
            volumeQuote: null,
            bidPrice: null,
            bidQty: null,
            askPrice: null,
            askQty: null,
            tradeCount: null,
            updatedAt: now,
          };
          return {
            ...prev,
            [id]: {
              ...base,
              ...patch,
              updatedAt: now,
            },
          };
        });

        if (id === market.id) {
          setConnectionInfo((prev) => ({
            ...prev,
            isLive: true,
            lastUpdatedAt: now,
            lastError: null,
          }));
        }
      },
      onOrderBookUpdate: (book) => {
        if (disposed) return;
        setOrderBooksByMarket((prev) => ({
          ...prev,
          [book.marketId]: book,
        }));
        setConnectionInfo((prev) => ({
          ...prev,
          isLive: true,
          lastUpdatedAt: book.updatedAt,
          lastError: null,
        }));
      },
      onCandleUpdate: (incomingCandle) => {
        if (disposed) return;
        pendingWsCandle = incomingCandle;
        if (historyLoaded) {
          setCandlesByMarket((prev) => {
            const marketMap = prev[market.id] ?? {};
            const currentSeries = marketMap[timeframe] ?? [];
            return {
              ...prev,
              [market.id]: {
                ...marketMap,
                [timeframe]: mergeCandleIntoSeries(currentSeries, incomingCandle),
              },
            };
          });
        }
        setConnectionInfo((prev) => ({
          ...prev,
          isLive: true,
          lastUpdatedAt: Date.now(),
          lastError: null,
        }));
      },
      onStatusChange: ({ connected, endpoint, streams, error: wsErr, reconnectAttempts }) => {
        if (disposed) return;
        wsConnectedRef.current = connected;
        setConnectionInfo((prev) => {
          const hasLiveFeed = connected ? prev.lastUpdatedAt !== null : restOkRef.current;
          return {
            ...prev,
            state: connected
              ? 'connected_ws'
              : restOkRef.current
                ? 'fallback_rest'
                : reconnectAttempts > 0
                  ? 'reconnecting'
                  : 'error',
            isLive: hasLiveFeed,
            protocol: connected ? 'WebSocket' : 'REST',
            wsEndpoint: endpoint,
            activeStreams: streams,
            lastError: connected ? null : (wsErr ?? prev.lastError),
            reconnectAttempts,
          };
        });
      },
    });

    stream.start();

    // Resilient REST polling fallback ONLY while WebSocket is disconnected
    fallbackInterval = window.setInterval(() => {
      if (!wsConnectedRef.current && !disposed) {
        loadRestSnapshot(true);
      }
    }, 4000);

    // Mark offline if no real Binance payload arrives for > 20s while socket is closed
    freshnessInterval = window.setInterval(() => {
      if (disposed) return;
      setConnectionInfo((prev) => {
        const offlineBrowser = typeof navigator !== 'undefined' && navigator.onLine === false;
        const stale =
          prev.lastUpdatedAt !== null &&
          Date.now() - prev.lastUpdatedAt > 20000 &&
          !wsConnectedRef.current;
        if (offlineBrowser || stale) {
          return {
            ...prev,
            isLive: false,
            state: offlineBrowser ? 'error' : prev.state,
          };
        }
        return prev;
      });
    }, 3000);

    return () => {
      disposed = true;
      controller.abort();
      stream.dispose();
      if (fallbackInterval !== null) {
        window.clearInterval(fallbackInterval);
      }
      if (freshnessInterval !== null) {
        window.clearInterval(freshnessInterval);
      }
    };
  }, [market, timeframe, timeframeConfig.limit, reconnectNonce]);

  const activeTicker = tickers[marketId] ?? null;
  const activeOrderBook = orderBooksByMarket[marketId] ?? null;
  const activeMarketCandles = candlesByMarket[marketId] ?? {};
  const candles = activeMarketCandles[timeframe] ?? [];

  const analysis: TechnicalAnalysis | null = useMemo(() => {
    return computeTechnicalAnalysis(
      timeframe,
      activeMarketCandles,
      activeTicker,
      activeOrderBook
    );
  }, [timeframe, activeMarketCandles, activeTicker, activeOrderBook]);

  // Multi-market Opportunity Score & Ranking across all 4 markets
  const opportunities: MarketOpportunity[] = useMemo(() => {
    const inputs = MARKETS.map((m) => {
      const t = tickers[m.id] ?? null;
      const b = orderBooksByMarket[m.id] ?? null;
      const cMap = candlesByMarket[m.id] ?? {};
      const timestamps = [t?.updatedAt ?? null, b?.updatedAt ?? null].filter(
        (v): v is number => v !== null
      );
      const lastUpdatedAt = timestamps.length > 0 ? Math.max(...timestamps) : null;

      return {
        marketId: m.id,
        ticker: t,
        orderBook: b,
        candlesByTimeframe: cMap,
        lastUpdatedAt,
      };
    });

    return rankMarketOpportunities(
      inputs,
      feeConfig,
      connectionInfo.isLive,
      Math.max(Date.now(), clockTick)
    );
  }, [
    tickers,
    orderBooksByMarket,
    candlesByMarket,
    feeConfig,
    connectionInfo.isLive,
    clockTick,
  ]);

  // Decision Engine evaluated strictly from real Binance opportunity data (separate from raw score)
  const decisionsByMarket: Record<MarketId, MarketDecision> = useMemo(() => {
    const map = {} as Record<MarketId, MarketDecision>;
    for (const opp of opportunities) {
      map[opp.marketId] = evaluateMarketDecision(opp, connectionInfo.isLive);
    }
    return map;
  }, [opportunities, connectionInfo.isLive]);

  const activeOpportunity = useMemo(
    () => opportunities.find((o) => o.marketId === marketId) ?? null,
    [opportunities, marketId]
  );

  const activeDecision = decisionsByMarket[marketId] ?? null;

  // Risk Management & Trade Simulation evaluated independently without altering Score or Decision
  const simulationsByMarket: Record<MarketId, TradeSimulation> = useMemo(() => {
    const map = {} as Record<MarketId, TradeSimulation>;
    for (const opp of opportunities) {
      const dec = decisionsByMarket[opp.marketId];
      if (dec) {
        map[opp.marketId] = simulateMarketTrade(
          opp,
          dec,
          simulationConfig,
          feeConfig,
          connectionInfo.isLive
        );
      }
    }
    return map;
  }, [opportunities, decisionsByMarket, simulationConfig, feeConfig, connectionInfo.isLive]);

  const activeSimulation = simulationsByMarket[marketId] ?? null;

  return {
    marketId,
    timeframe,
    setMarketId,
    setTimeframe,
    tickers,
    activeTicker,
    priceDirection,
    orderBook: activeOrderBook,
    orderBooksByMarket,
    candles,
    candlesByMarket,
    analysis,
    feeConfig,
    setFeeConfig,
    simulationConfig,
    setSimulationConfig,
    opportunities,
    activeOpportunity,
    decisionsByMarket,
    activeDecision,
    simulationsByMarket,
    activeSimulation,
    loadingRanking,
    loadingInitial,
    loadingChart,
    error,
    connectionInfo,
    refreshNow,
  };
}
