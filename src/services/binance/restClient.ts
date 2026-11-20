import { MARKETS } from '../../config/markets';
import type {
  Candle,
  MarketConfig,
  MarketId,
  OrderBookData,
  OrderBookLevel,
  Ticker24h,
  Timeframe,
} from '../../types/market';

export const BINANCE_REST_ENDPOINTS = [
  'https://data-api.binance.vision/api/v3',
  'https://api.binance.com/api/v3',
] as const;

let activeRestBase: string = BINANCE_REST_ENDPOINTS[0];

export function getActiveRestEndpoint(): string {
  return activeRestBase;
}

async function fetchBinanceJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const ordered = [
    activeRestBase,
    ...BINANCE_REST_ENDPOINTS.filter((ep) => ep !== activeRestBase),
  ];

  let lastError: Error | null = null;

  for (const base of ordered) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'GET',
        signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} en ${base}`);
      }

      const data = (await response.json()) as T;
      activeRestBase = base;
      return data;
    } catch (err) {
      if (signal?.aborted) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('No se pudo conectar con la API pública de Binance');
}

interface RawBinanceTicker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  count: number;
}

interface RawBinanceDepth {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

type RawBinanceKline = [
  number, // openTime ms
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume (base)
  number, // closeTime ms
  string, // quoteAssetVolume
  number, // number of trades
  string,
  string,
  string,
];

function parsePositive(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseFinite(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function safeInvNullable(n: number | null): number | null {
  return n !== null && n > 0 ? 1 / n : null;
}

function safeInv(n: number): number {
  return n > 0 ? 1 / n : 0;
}

export function normalizeTicker24h(
  raw: RawBinanceTicker24h,
  market: MarketConfig
): Ticker24h {
  const lastRaw = parsePositive(raw.lastPrice);
  const openRaw = parsePositive(raw.openPrice);
  const highRaw = parsePositive(raw.highPrice);
  const lowRaw = parsePositive(raw.lowPrice);
  const bidRaw = parsePositive(raw.bidPrice);
  const bidQtyRaw = parsePositive(raw.bidQty);
  const askRaw = parsePositive(raw.askPrice);
  const askQtyRaw = parsePositive(raw.askQty);
  const volBaseRaw = parseFinite(raw.volume);
  const volQuoteRaw = parseFinite(raw.quoteVolume);

  if (!market.inverted) {
    return {
      marketId: market.id,
      price: lastRaw,
      priceChange: parseFinite(raw.priceChange),
      priceChangePercent: parseFinite(raw.priceChangePercent),
      highPrice: highRaw,
      lowPrice: lowRaw,
      openPrice: openRaw,
      volumeBase: volBaseRaw,
      volumeQuote: volQuoteRaw,
      bidPrice: bidRaw,
      bidQty: bidQtyRaw,
      askPrice: askRaw,
      askQty: askQtyRaw,
      tradeCount: typeof raw.count === 'number' ? raw.count : null,
      updatedAt: Date.now(),
    };
  }

  // Exact mathematical inversion for EURUSDT -> USDT/EUR:
  // Best Bid on USDT/EUR = 1 / Best Ask on EURUSDT
  // Best Ask on USDT/EUR = 1 / Best Bid on EURUSDT
  const price = safeInvNullable(lastRaw);
  const openPrice = safeInvNullable(openRaw);
  const highPrice = safeInvNullable(lowRaw);
  const lowPrice = safeInvNullable(highRaw);
  const priceChange =
    price !== null && openPrice !== null ? price - openPrice : null;
  const priceChangePercent =
    priceChange !== null && openPrice !== null && openPrice > 0
      ? (priceChange / openPrice) * 100
      : null;

  return {
    marketId: market.id,
    price,
    priceChange,
    priceChangePercent,
    highPrice,
    lowPrice,
    openPrice,
    // On EURUSDT: quoteVolume is USDT (our base), volume is EUR (our quote)
    volumeBase: volQuoteRaw,
    volumeQuote: volBaseRaw,
    bidPrice: safeInvNullable(askRaw),
    bidQty: askQtyRaw !== null && askRaw !== null ? askQtyRaw * askRaw : null,
    askPrice: safeInvNullable(bidRaw),
    askQty: bidQtyRaw !== null && bidRaw !== null ? bidQtyRaw * bidRaw : null,
    tradeCount: typeof raw.count === 'number' ? raw.count : null,
    updatedAt: Date.now(),
  };
}

export function normalizeOrderBook(
  rawBids: [string, string][],
  rawAsks: [string, string][],
  market: MarketConfig,
  lastUpdateId: number
): OrderBookData {
  let bidsRawList: Array<{ price: number; quantity: number }>;
  let asksRawList: Array<{ price: number; quantity: number }>;

  if (!market.inverted) {
    bidsRawList = rawBids
      .map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
      .filter((l) => l.price > 0 && l.quantity > 0)
      .sort((a, b) => b.price - a.price);

    asksRawList = rawAsks
      .map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
      .filter((l) => l.price > 0 && l.quantity > 0)
      .sort((a, b) => a.price - b.price);
  } else {
    // Inverted pair: EURUSDT asks -> USDT/EUR bids; EURUSDT bids -> USDT/EUR asks
    bidsRawList = rawAsks
      .map(([p, q]) => {
        const px = parseFloat(p);
        const qtyEur = parseFloat(q);
        return { price: safeInv(px), quantity: qtyEur * px };
      })
      .filter((l) => l.price > 0 && l.quantity > 0)
      .sort((a, b) => b.price - a.price);

    asksRawList = rawBids
      .map(([p, q]) => {
        const px = parseFloat(p);
        const qtyEur = parseFloat(q);
        return { price: safeInv(px), quantity: qtyEur * px };
      })
      .filter((l) => l.price > 0 && l.quantity > 0)
      .sort((a, b) => a.price - b.price);
  }

  let cumBid = 0;
  const bids: OrderBookLevel[] = bidsRawList.map((l) => {
    cumBid += l.quantity;
    return { price: l.price, quantity: l.quantity, total: cumBid };
  });

  let cumAsk = 0;
  const asks: OrderBookLevel[] = asksRawList.map((l) => {
    cumAsk += l.quantity;
    return { price: l.price, quantity: l.quantity, total: cumAsk };
  });

  return {
    marketId: market.id,
    bids,
    asks,
    lastUpdateId,
    updatedAt: Date.now(),
  };
}

export function normalizeCandle(raw: RawBinanceKline, market: MarketConfig): Candle {
  const openTimeSec = Math.floor(raw[0] / 1000);
  const openRaw = parseFloat(raw[1]);
  const highRaw = parseFloat(raw[2]);
  const lowRaw = parseFloat(raw[3]);
  const closeRaw = parseFloat(raw[4]);
  const volBaseRaw = parseFloat(raw[5]);
  const volQuoteRaw = parseFloat(raw[7]);

  if (!market.inverted) {
    return {
      time: openTimeSec,
      open: openRaw,
      high: highRaw,
      low: lowRaw,
      close: closeRaw,
      volume: volBaseRaw,
      isClosed: true,
    };
  }

  return {
    time: openTimeSec,
    open: safeInv(openRaw),
    high: safeInv(lowRaw),
    low: safeInv(highRaw),
    close: safeInv(closeRaw),
    volume: volQuoteRaw,
    isClosed: true,
  };
}

export async function fetchAllMarketTickers(
  signal?: AbortSignal
): Promise<Partial<Record<MarketId, Ticker24h>>> {
  const symbols = MARKETS.map((m) => m.binanceSymbol);
  const query = encodeURIComponent(JSON.stringify(symbols));
  const rawList = await fetchBinanceJson<RawBinanceTicker24h[]>(
    `/ticker/24hr?symbols=${query}`,
    signal
  );

  const bySymbol = new Map(rawList.map((item) => [item.symbol, item]));
  const result: Partial<Record<MarketId, Ticker24h>> = {};

  for (const market of MARKETS) {
    const raw = bySymbol.get(market.binanceSymbol);
    if (raw) {
      result[market.id] = normalizeTicker24h(raw, market);
    }
  }

  return result;
}

export async function fetchMarketTicker(
  market: MarketConfig,
  signal?: AbortSignal
): Promise<Ticker24h> {
  const raw = await fetchBinanceJson<RawBinanceTicker24h>(
    `/ticker/24hr?symbol=${market.binanceSymbol}`,
    signal
  );
  return normalizeTicker24h(raw, market);
}

export async function fetchOrderBook(
  market: MarketConfig,
  limit = 20,
  signal?: AbortSignal
): Promise<OrderBookData> {
  const raw = await fetchBinanceJson<RawBinanceDepth>(
    `/depth?symbol=${market.binanceSymbol}&limit=${limit}`,
    signal
  );
  return normalizeOrderBook(raw.bids, raw.asks, market, raw.lastUpdateId);
}

export async function fetchKlines(
  market: MarketConfig,
  interval: Timeframe,
  limit: number,
  signal?: AbortSignal
): Promise<Candle[]> {
  const raw = await fetchBinanceJson<RawBinanceKline[]>(
    `/klines?symbol=${market.binanceSymbol}&interval=${interval}&limit=${limit}`,
    signal
  );

  const dedup = new Map<number, Candle>();
  for (const row of raw) {
    const candle = normalizeCandle(row, market);
    if (
      Number.isFinite(candle.time) &&
      candle.open > 0 &&
      candle.high > 0 &&
      candle.low > 0 &&
      candle.close > 0
    ) {
      dedup.set(candle.time, candle);
    }
  }

  return Array.from(dedup.values()).sort((a, b) => a.time - b.time);
}
