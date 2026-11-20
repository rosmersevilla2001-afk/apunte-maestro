import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { MARKET_MAP, formatPrice, formatQty } from '../config/markets';
import type { MarketId, OrderBookData, Ticker24h } from '../types/market';

interface OrderBookProps {
  marketId: MarketId;
  orderBook: OrderBookData | null;
  ticker: Ticker24h | null;
  priceDirection: 'up' | 'down' | 'flat';
  isOffline?: boolean;
}

type BookViewMode = 'both' | 'bids' | 'asks';

export function OrderBook({
  marketId,
  orderBook,
  ticker,
  priceDirection,
  isOffline = false,
}: OrderBookProps) {
  const market = MARKET_MAP[marketId];
  const [viewMode, setViewMode] = useState<BookViewMode>('both');

  const rowsPerSide = viewMode === 'both' ? 10 : 18;
  const asks = orderBook ? orderBook.asks.slice(0, rowsPerSide).reverse() : [];
  const bids = orderBook ? orderBook.bids.slice(0, rowsPerSide) : [];

  const maxAskTotal = asks.length > 0 ? Math.max(...asks.map((a) => a.total)) : 1;
  const maxBidTotal = bids.length > 0 ? Math.max(...bids.map((b) => b.total)) : 1;
  const maxDepth = Math.max(maxAskTotal, maxBidTotal, 1);

  // Liquidity imbalance across top 15 levels
  const totalBidVol = orderBook
    ? orderBook.bids.slice(0, 15).reduce((sum, l) => sum + l.quantity, 0)
    : 0;
  const totalAskVol = orderBook
    ? orderBook.asks.slice(0, 15).reduce((sum, l) => sum + l.quantity, 0)
    : 0;
  const combinedVol = totalBidVol + totalAskVol;
  const bidSharePct = combinedVol > 0 ? (totalBidVol / combinedVol) * 100 : null;
  const askSharePct = bidSharePct !== null ? 100 - bidSharePct : null;

  const bestBid = orderBook?.bids[0]?.price ?? ticker?.bidPrice ?? null;
  const bestAsk = orderBook?.asks[0]?.price ?? ticker?.askPrice ?? null;
  const spreadAbs =
    bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? bestAsk - bestBid : null;
  const spreadPct =
    spreadAbs !== null && bestAsk && bestAsk > 0 ? (spreadAbs / bestAsk) * 100 : null;

  const lastPrice = ticker?.price ?? bestBid ?? null;

  return (
    <section
      aria-label="Libro de órdenes"
      className="flex flex-col border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      {/* Header + Mode Switcher */}
      <div className="flex items-center justify-between gap-2 border-b border-[#1F2735] px-4 py-2.5">
        <h2 className="font-display text-sm font-semibold text-[#EAECEF] whitespace-nowrap">
          Libro de Órdenes
        </h2>
        <div
          role="group"
          aria-label="Vista del libro"
          className="flex items-center gap-0.5 rounded-md border border-[#1F2735] bg-[#0B0E14] p-0.5"
        >
          {(
            [
              { id: 'both', label: 'Ambos' },
              { id: 'bids', label: 'Bids' },
              { id: 'asks', label: 'Asks' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setViewMode(mode.id)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F0B90B] ${
                viewMode === mode.id
                  ? 'bg-[#1D2534] text-[#EAECEF]'
                  : 'text-[#848E9C] hover:text-[#EAECEF]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 border-b border-[#1A212E] bg-[#0E131B] px-4 py-1.5 text-[11px] text-[#848E9C]">
        <span className="text-left">Precio ({market.quoteAsset})</span>
        <span className="text-right">Cantidad (USDT)</span>
        <span className="text-right">Total (USDT)</span>
      </div>

      {/* Offline / Loading state when book not yet populated */}
      {!orderBook ? (
        isOffline ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
            <span className="font-mono text-xs font-medium text-[#848E9C]">Sin datos</span>
            <span className="text-[11px] text-[#848E9C]">
              Sin conexión con el libro de órdenes de Binance
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-5 w-full animate-pulse rounded bg-[#181F2C]" />
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-1 flex-col">
          {/* Asks (Sell side) */}
          {viewMode !== 'bids' && (
            <div className="flex flex-col py-1" aria-label="Órdenes de venta (Asks)">
              {asks.map((level) => {
                const widthPct = Math.min(100, (level.total / maxDepth) * 100);
                return (
                  <div
                    key={`ask-${level.price}`}
                    className="relative grid grid-cols-3 items-center px-4 py-[4px] font-mono tabular-nums text-xs hover:bg-[#171D29]"
                  >
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 bg-[#F6465D]/14"
                      style={{ width: `${widthPct}%` }}
                      aria-hidden="true"
                    />
                    <span className="relative z-10 text-left font-medium text-[#F6465D]">
                      {formatPrice(level.price, market.priceDecimals)}
                    </span>
                    <span className="relative z-10 text-right text-[#EAECEF]">
                      {formatQty(level.quantity, market.qtyDecimals)}
                    </span>
                    <span className="relative z-10 text-right text-[#848E9C]">
                      {formatQty(level.total, market.qtyDecimals)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Center Last Price & Spread Ribbon */}
          <div className="flex items-center justify-between border-y border-[#1F2735] bg-[#0E131B] px-4 py-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono tabular-nums text-base font-bold ${
                  priceDirection === 'up'
                    ? 'text-[#0ECB81]'
                    : priceDirection === 'down'
                      ? 'text-[#F6465D]'
                      : 'text-[#EAECEF]'
                }`}
              >
                {formatPrice(lastPrice, market.priceDecimals)}
              </span>
              {priceDirection === 'up' && (
                <ArrowUp className="h-3.5 w-3.5 text-[#0ECB81]" aria-hidden="true" />
              )}
              {priceDirection === 'down' && (
                <ArrowDown className="h-3.5 w-3.5 text-[#F6465D]" aria-hidden="true" />
              )}
            </div>

            <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
              Spread{' '}
              <span className="text-[#EAECEF]">
                {spreadAbs !== null ? formatPrice(spreadAbs, market.priceDecimals) : 'Sin datos'}
              </span>
              {spreadPct !== null && (
                <span className="ml-1 text-[#F0B90B]">({spreadPct.toFixed(3)}%)</span>
              )}
            </div>
          </div>

          {/* Bids (Buy side) */}
          {viewMode !== 'asks' && (
            <div className="flex flex-col py-1" aria-label="Órdenes de compra (Bids)">
              {bids.map((level) => {
                const widthPct = Math.min(100, (level.total / maxDepth) * 100);
                return (
                  <div
                    key={`bid-${level.price}`}
                    className="relative grid grid-cols-3 items-center px-4 py-[4px] font-mono tabular-nums text-xs hover:bg-[#171D29]"
                  >
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 bg-[#0ECB81]/14"
                      style={{ width: `${widthPct}%` }}
                      aria-hidden="true"
                    />
                    <span className="relative z-10 text-left font-medium text-[#0ECB81]">
                      {formatPrice(level.price, market.priceDecimals)}
                    </span>
                    <span className="relative z-10 text-right text-[#EAECEF]">
                      {formatQty(level.quantity, market.qtyDecimals)}
                    </span>
                    <span className="relative z-10 text-right text-[#848E9C]">
                      {formatQty(level.total, market.qtyDecimals)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bid / Ask Pressure Bar */}
          <div className="mt-auto border-t border-[#1F2735] px-4 py-2.5">
            <div className="mb-1.5 flex items-center justify-between font-mono tabular-nums text-[11px]">
              <span className="text-[#0ECB81]">
                Bids {bidSharePct !== null ? `${bidSharePct.toFixed(1)}%` : 'Sin datos'}
              </span>
              <span className="text-[#848E9C]">Profundidad top 15</span>
              <span className="text-[#F6465D]">
                Asks {askSharePct !== null ? `${askSharePct.toFixed(1)}%` : 'Sin datos'}
              </span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-[#1A212E]">
              {bidSharePct !== null && askSharePct !== null && (
                <>
                  <div
                    className="bg-[#0ECB81] transition-[width] duration-200"
                    style={{ width: `${bidSharePct}%` }}
                  />
                  <div
                    className="bg-[#F6465D] transition-[width] duration-200"
                    style={{ width: `${askSharePct}%` }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
