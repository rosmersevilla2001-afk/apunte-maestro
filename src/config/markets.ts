import type { MarketConfig, MarketId, Timeframe } from '../types/market';

export const MARKETS: MarketConfig[] = [
  {
    id: 'USDT/COP',
    baseAsset: 'USDT',
    quoteAsset: 'COP',
    quoteName: 'Peso Colombiano',
    quoteSymbol: '$',
    binanceSymbol: 'USDTCOP',
    inverted: false,
    priceDecimals: 0,
    qtyDecimals: 0,
    tickSize: 1,
  },
  {
    id: 'USDT/BRL',
    baseAsset: 'USDT',
    quoteAsset: 'BRL',
    quoteName: 'Real Brasileño',
    quoteSymbol: 'R$',
    binanceSymbol: 'USDTBRL',
    inverted: false,
    priceDecimals: 4,
    qtyDecimals: 1,
    tickSize: 0.0001,
  },
  {
    id: 'USDT/MXN',
    baseAsset: 'USDT',
    quoteAsset: 'MXN',
    quoteName: 'Peso Mexicano',
    quoteSymbol: '$',
    binanceSymbol: 'USDTMXN',
    inverted: false,
    priceDecimals: 3,
    qtyDecimals: 0,
    tickSize: 0.001,
  },
  {
    id: 'USDT/EUR',
    baseAsset: 'USDT',
    quoteAsset: 'EUR',
    quoteName: 'Euro',
    quoteSymbol: '€',
    binanceSymbol: 'EURUSDT',
    inverted: true,
    priceDecimals: 4,
    qtyDecimals: 1,
    tickSize: 0.0001,
  },
];

export const MARKET_MAP: Record<MarketId, MarketConfig> = MARKETS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<MarketId, MarketConfig>
);

export interface TimeframeConfig {
  id: Timeframe;
  label: string;
  description: string;
  historyLabel: string;
  limit: number;
}

export const TIMEFRAMES: TimeframeConfig[] = [
  {
    id: '5m',
    label: '5M',
    description: '5 minutos · últimas 24 horas',
    historyLabel: 'Últimas 24h',
    limit: 288,
  },
  {
    id: '15m',
    label: '15M',
    description: '15 minutos · últimos 3 días',
    historyLabel: 'Últimos 3 días',
    limit: 288,
  },
  {
    id: '1h',
    label: '1H',
    description: '1 hora · últimos 7 días',
    historyLabel: 'Últimos 7 días',
    limit: 168,
  },
  {
    id: '4h',
    label: '4H',
    description: '4 horas · últimos 30 días',
    historyLabel: 'Últimos 30 días',
    limit: 180,
  },
];

export const TIMEFRAME_MAP: Record<Timeframe, TimeframeConfig> = TIMEFRAMES.reduce(
  (acc, tf) => {
    acc[tf.id] = tf;
    return acc;
  },
  {} as Record<Timeframe, TimeframeConfig>
);

export const NO_DATA_LABEL = 'Sin datos';

export function formatPrice(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_LABEL;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatQty(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_LABEL;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCompactVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_LABEL;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_LABEL;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatTimestamp(ts: number | null): string {
  if (!ts) return NO_DATA_LABEL;
  return new Date(ts).toLocaleTimeString('es-ES', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
