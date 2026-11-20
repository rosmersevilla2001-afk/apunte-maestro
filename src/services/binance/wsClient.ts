import { MARKETS } from '../../config/markets';
import type {
  Candle,
  MarketConfig,
  MarketId,
  OrderBookData,
  Ticker24h,
  Timeframe,
} from '../../types/market';
import { normalizeOrderBook } from './restClient';

export const BINANCE_WS_ENDPOINTS = [
  'wss://data-stream.binance.vision/stream',
  'wss://stream.binance.com:9443/stream',
] as const;

export interface BinanceStreamCallbacks {
  onTickerUpdate: (marketId: MarketId, patch: Partial<Ticker24h>) => void;
  onOrderBookUpdate: (book: OrderBookData) => void;
  onCandleUpdate: (candle: Candle) => void;
  onStatusChange: (status: {
    connected: boolean;
    endpoint: string;
    streams: string[];
    error?: string | null;
    reconnectAttempts: number;
  }) => void;
}

interface RawWsTicker {
  e: '24hrTicker';
  s: string;
  p: string;
  P: string;
  c: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
  n: number;
}

interface RawWsBookTicker {
  u: number;
  s: string;
  b: string;
  B: string;
  a: string;
  A: string;
}

interface RawWsDepth20 {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface RawWsKline {
  e: 'kline';
  s: string;
  k: {
    t: number;
    i: string;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    q: string;
    x: boolean;
  };
}

function safeInv(n: number): number {
  return n > 0 ? 1 / n : 0;
}

export class BinanceMarketStream {
  private ws: WebSocket | null = null;
  private market: MarketConfig;
  private timeframe: Timeframe;
  private callbacks: BinanceStreamCallbacks;
  private endpointIndex = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private disposed = false;
  private activeStreams: string[] = [];

  constructor(
    market: MarketConfig,
    timeframe: Timeframe,
    callbacks: BinanceStreamCallbacks
  ) {
    this.market = market;
    this.timeframe = timeframe;
    this.callbacks = callbacks;
  }

  public start(): void {
    this.disposed = false;
    this.connect();
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
  }

  private buildStreams(): string[] {
    const activeSym = this.market.binanceSymbol.toLowerCase();
    const otherMarkets = MARKETS.filter((m) => m.id !== this.market.id);
    const otherTickers = otherMarkets.map(
      (m) => `${m.binanceSymbol.toLowerCase()}@ticker`
    );
    const otherBookTickers = otherMarkets.map(
      (m) => `${m.binanceSymbol.toLowerCase()}@bookTicker`
    );

    return [
      `${activeSym}@ticker`,
      `${activeSym}@bookTicker`,
      `${activeSym}@depth20@100ms`,
      `${activeSym}@kline_${this.timeframe}`,
      ...otherTickers,
      ...otherBookTickers,
    ];
  }

  private connect(): void {
    if (this.disposed) return;

    this.activeStreams = this.buildStreams();
    const endpoint = BINANCE_WS_ENDPOINTS[this.endpointIndex % BINANCE_WS_ENDPOINTS.length];
    const url = `${endpoint}?streams=${this.activeStreams.join('/')}`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.disposed) return;
        this.reconnectAttempts = 0;
        this.callbacks.onStatusChange({
          connected: true,
          endpoint,
          streams: this.activeStreams.slice(0, 4),
          error: null,
          reconnectAttempts: 0,
        });
      };

      ws.onmessage = (event: MessageEvent) => {
        if (this.disposed) return;
        try {
          const envelope = JSON.parse(String(event.data)) as {
            stream?: string;
            data?: unknown;
          };
          if (!envelope.stream || !envelope.data) return;
          this.handleMessage(envelope.stream, envelope.data);
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        if (this.disposed) return;
        this.callbacks.onStatusChange({
          connected: false,
          endpoint,
          streams: this.activeStreams.slice(0, 4),
          error: 'Interrupción en el canal WebSocket',
          reconnectAttempts: this.reconnectAttempts,
        });
      };

      ws.onclose = () => {
        if (this.disposed) return;
        this.reconnectAttempts += 1;
        this.endpointIndex = (this.endpointIndex + 1) % BINANCE_WS_ENDPOINTS.length;

        this.callbacks.onStatusChange({
          connected: false,
          endpoint,
          streams: this.activeStreams.slice(0, 4),
          error: 'Reconectando transmisión en vivo...',
          reconnectAttempts: this.reconnectAttempts,
        });

        const delayMs = Math.min(12000, 1200 * Math.pow(1.6, Math.min(this.reconnectAttempts, 5)));
        this.reconnectTimer = window.setTimeout(() => {
          this.connect();
        }, delayMs);
      };
    } catch (err) {
      this.callbacks.onStatusChange({
        connected: false,
        endpoint,
        streams: this.activeStreams.slice(0, 4),
        error: err instanceof Error ? err.message : 'Error inicializando WebSocket',
        reconnectAttempts: this.reconnectAttempts,
      });
    }
  }

  private handleMessage(stream: string, payload: unknown): void {
    const activeSym = this.market.binanceSymbol.toLowerCase();

    // 1. Order book depth20 for active market
    if (stream === `${activeSym}@depth20@100ms`) {
      const data = payload as RawWsDepth20;
      if (Array.isArray(data.bids) && Array.isArray(data.asks)) {
        const book = normalizeOrderBook(data.bids, data.asks, this.market, data.lastUpdateId);
        this.callbacks.onOrderBookUpdate(book);
        if (book.bids[0] && book.asks[0]) {
          this.callbacks.onTickerUpdate(this.market.id, {
            bidPrice: book.bids[0].price,
            bidQty: book.bids[0].quantity,
            askPrice: book.asks[0].price,
            askQty: book.asks[0].quantity,
            updatedAt: book.updatedAt,
          });
        }
      }
      return;
    }

    // 2. BookTicker (ultra-fast top-of-book bid/ask) for ANY of the 4 markets
    if (stream.endsWith('@bookTicker')) {
      const data = payload as RawWsBookTicker;
      const matched = MARKETS.find(
        (m) => m.binanceSymbol.toLowerCase() === (data.s ?? '').toLowerCase()
      );
      if (!matched) return;

      const b = parseFloat(data.b);
      const B = parseFloat(data.B);
      const a = parseFloat(data.a);
      const A = parseFloat(data.A);
      if (b > 0 && a > 0) {
        if (!matched.inverted) {
          this.callbacks.onTickerUpdate(matched.id, {
            bidPrice: b,
            bidQty: B,
            askPrice: a,
            askQty: A,
            updatedAt: Date.now(),
          });
        } else {
          this.callbacks.onTickerUpdate(matched.id, {
            bidPrice: safeInv(a),
            bidQty: A * a,
            askPrice: safeInv(b),
            askQty: B * b,
            updatedAt: Date.now(),
          });
        }
      }
      return;
    }

    // 3. Kline update for active market
    if (stream === `${activeSym}@kline_${this.timeframe}`) {
      const data = payload as RawWsKline;
      if (!data.k) return;
      const k = data.k;
      const time = Math.floor(k.t / 1000);
      const o = parseFloat(k.o);
      const h = parseFloat(k.h);
      const l = parseFloat(k.l);
      const c = parseFloat(k.c);
      const v = parseFloat(k.v);
      const q = parseFloat(k.q);

      if (
        !Number.isFinite(time) ||
        !(o > 0 && h > 0 && l > 0 && c > 0) ||
        !Number.isFinite(v) ||
        !Number.isFinite(q)
      ) {
        return;
      }

      const candle: Candle = !this.market.inverted
        ? { time, open: o, high: h, low: l, close: c, volume: v, isClosed: k.x }
        : {
            time,
            open: safeInv(o),
            high: safeInv(l),
            low: safeInv(h),
            close: safeInv(c),
            volume: q,
            isClosed: k.x,
          };

      this.callbacks.onCandleUpdate(candle);
      return;
    }

    // 4. 24hrTicker for active or secondary markets
    if (stream.endsWith('@ticker')) {
      const data = payload as RawWsTicker;
      const matched = MARKETS.find(
        (m) => m.binanceSymbol.toLowerCase() === (data.s ?? '').toLowerCase()
      );
      if (!matched) return;

      const parsePos = (s: string | undefined): number | null => {
        if (!s) return null;
        const n = parseFloat(s);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const parseFin = (s: string | undefined): number | null => {
        if (!s) return null;
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
      };

      const lastRaw = parsePos(data.c);
      const openRaw = parsePos(data.o);
      const highRaw = parsePos(data.h);
      const lowRaw = parsePos(data.l);
      const volBaseRaw = parseFin(data.v);
      const volQuoteRaw = parseFin(data.q);

      if (!matched.inverted) {
        this.callbacks.onTickerUpdate(matched.id, {
          marketId: matched.id,
          price: lastRaw,
          priceChange: parseFin(data.p),
          priceChangePercent: parseFin(data.P),
          highPrice: highRaw,
          lowPrice: lowRaw,
          openPrice: openRaw,
          volumeBase: volBaseRaw,
          volumeQuote: volQuoteRaw,
          tradeCount: typeof data.n === 'number' ? data.n : null,
          updatedAt: Date.now(),
        });
      } else {
        const price = lastRaw !== null ? safeInv(lastRaw) : null;
        const openPrice = openRaw !== null ? safeInv(openRaw) : null;
        const priceChange =
          price !== null && openPrice !== null ? price - openPrice : null;
        const priceChangePercent =
          priceChange !== null && openPrice !== null && openPrice > 0
            ? (priceChange / openPrice) * 100
            : null;

        this.callbacks.onTickerUpdate(matched.id, {
          marketId: matched.id,
          price,
          priceChange,
          priceChangePercent,
          highPrice: lowRaw !== null ? safeInv(lowRaw) : null,
          lowPrice: highRaw !== null ? safeInv(highRaw) : null,
          openPrice,
          volumeBase: volQuoteRaw,
          volumeQuote: volBaseRaw,
          tradeCount: typeof data.n === 'number' ? data.n : null,
          updatedAt: Date.now(),
        });
      }
    }
  }
}
