import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  MARKET_MAP,
  NO_DATA_LABEL,
  formatPrice,
  formatTimestamp,
} from '../config/markets';
import type {
  ConnectionInfo,
  MarketId,
  OrderBookData,
  Ticker24h,
} from '../types/market';

interface ConnectionPanelProps {
  marketId: MarketId;
  connectionInfo: ConnectionInfo;
  ticker: Ticker24h | null;
  orderBook: OrderBookData | null;
  onReconnect: () => void;
}

export function ConnectionPanel({
  marketId,
  connectionInfo,
  ticker,
  orderBook,
  onReconnect,
}: ConnectionPanelProps) {
  const market = MARKET_MAP[marketId];
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const secondsAgo =
    connectionInfo.lastUpdatedAt !== null
      ? Math.max(0, Math.floor((nowMs - connectionInfo.lastUpdatedAt) / 1000))
      : null;

  const isLive = connectionInfo.isLive;
  const isWs = connectionInfo.state === 'connected_ws';

  const price = ticker?.price ?? null;
  const bestBid = orderBook?.bids[0]?.price ?? ticker?.bidPrice ?? null;
  const bestAsk = orderBook?.asks[0]?.price ?? ticker?.askPrice ?? null;
  const spreadAbs =
    bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? bestAsk - bestBid : null;
  const spreadPct =
    spreadAbs !== null && bestAsk !== null && bestAsk > 0 ? (spreadAbs / bestAsk) * 100 : null;

  const activeHost = isWs
    ? connectionInfo.wsEndpoint.replace(/^wss:\/\//, '').split('/')[0]
    : connectionInfo.restEndpoint.replace(/^https:\/\//, '').split('/')[0];

  return (
    <section
      aria-label="Estado de conexión y verificación de datos Binance"
      className="border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#1F2735] px-4 py-2.5">
        <div className="flex items-center gap-2">
          {isLive ? (
            <Wifi className="h-3.5 w-3.5 text-[#0ECB81]" aria-hidden="true" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-[#F6465D]" aria-hidden="true" />
          )}
          <h2 className="font-display text-sm font-semibold text-[#EAECEF]">
            Estado de Conexión
          </h2>
        </div>

        <button
          type="button"
          onClick={onReconnect}
          className="flex items-center gap-1.5 rounded border border-[#242D3D] bg-[#0E131B] px-2.5 py-1 text-[11px] font-medium text-[#EAECEF] transition-colors duration-150 hover:border-[#364359] hover:bg-[#171D29] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F0B90B]"
        >
          <RefreshCw className="h-3 w-3 text-[#F0B90B]" />
          <span>Reconectar</span>
        </button>
      </div>

      <dl className="divide-y divide-[#1A212E] text-xs">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Estado Binance</dt>
          <dd
            className={`flex items-center gap-1.5 font-mono font-semibold ${
              isLive ? 'text-[#0ECB81]' : 'text-[#F6465D]'
            }`}
          >
            <span aria-hidden="true">{isLive ? '🟢' : '🔴'}</span>
            <span>{isLive ? 'BINANCE EN DIRECTO' : 'BINANCE SIN CONEXIÓN'}</span>
            {isLive && (
              <span className="font-sans text-[11px] font-normal text-[#848E9C]">
                · {isWs ? 'WebSocket' : 'REST'}
              </span>
            )}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Última actualización</dt>
          <dd className="font-mono tabular-nums text-[#EAECEF]">
            {connectionInfo.lastUpdatedAt !== null ? (
              <>
                {formatTimestamp(connectionInfo.lastUpdatedAt)}
                {secondsAgo !== null && (
                  <span className="ml-1.5 text-[11px] text-[#848E9C]">
                    (hace {secondsAgo}s)
                  </span>
                )}
              </>
            ) : (
              <span className="text-[#848E9C]">{NO_DATA_LABEL}</span>
            )}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Precio</dt>
          <dd className="font-mono tabular-nums font-medium text-[#EAECEF]">
            {price !== null
              ? `${formatPrice(price, market.priceDecimals)} ${market.quoteAsset}`
              : NO_DATA_LABEL}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Bid</dt>
          <dd className="font-mono tabular-nums font-medium text-[#0ECB81]">
            {bestBid !== null
              ? `${formatPrice(bestBid, market.priceDecimals)} ${market.quoteAsset}`
              : NO_DATA_LABEL}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Ask</dt>
          <dd className="font-mono tabular-nums font-medium text-[#F6465D]">
            {bestAsk !== null
              ? `${formatPrice(bestAsk, market.priceDecimals)} ${market.quoteAsset}`
              : NO_DATA_LABEL}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Spread</dt>
          <dd className="font-mono tabular-nums font-medium text-[#F0B90B]">
            {spreadAbs !== null
              ? `${formatPrice(spreadAbs, market.priceDecimals)} ${market.quoteAsset}${
                  spreadPct !== null ? ` (${spreadPct.toFixed(3)}%)` : ''
                }`
              : NO_DATA_LABEL}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Fuente pública Binance</dt>
          <dd className="truncate font-mono text-[11px] text-[#B7BDC6]" title={activeHost}>
            {activeHost}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-[#848E9C]">Símbolo Spot</dt>
          <dd className="font-mono text-[11px] text-[#B7BDC6]">
            {market.binanceSymbol}
            {market.inverted ? ' → invertido' : ' · directo'}
          </dd>
        </div>

        {connectionInfo.lastError && !isLive && (
          <div className="px-4 py-2 text-[11px] text-[#F6465D]">
            {connectionInfo.lastError}
          </div>
        )}
      </dl>
    </section>
  );
}
