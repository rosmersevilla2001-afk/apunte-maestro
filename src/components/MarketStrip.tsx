import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import {
  MARKETS,
  MARKET_MAP,
  NO_DATA_LABEL,
  formatCompactVolume,
  formatPrice,
  formatQty,
  formatSignedPercent,
} from '../config/markets';
import type { MarketId, OrderBookData, Ticker24h } from '../types/market';

interface MarketStripProps {
  marketId: MarketId;
  onSelectMarket: (id: MarketId) => void;
  tickers: Partial<Record<MarketId, Ticker24h>>;
  activeTicker: Ticker24h | null;
  orderBook: OrderBookData | null;
  priceDirection: 'up' | 'down' | 'flat';
  loading: boolean;
}

export function MarketStrip({
  marketId,
  onSelectMarket,
  tickers,
  activeTicker,
  orderBook,
  priceDirection,
  loading,
}: MarketStripProps) {
  const market = MARKET_MAP[marketId];

  const price = activeTicker?.price ?? null;
  const changePct = activeTicker?.priceChangePercent ?? null;
  const changeAbs = activeTicker?.priceChange ?? null;
  const isPositive = changePct !== null && changePct >= 0;

  const bestBid = orderBook?.bids[0]?.price ?? activeTicker?.bidPrice ?? null;
  const bestBidQty = orderBook?.bids[0]?.quantity ?? activeTicker?.bidQty ?? null;
  const bestAsk = orderBook?.asks[0]?.price ?? activeTicker?.askPrice ?? null;
  const bestAskQty = orderBook?.asks[0]?.quantity ?? activeTicker?.askQty ?? null;

  const spreadAbs =
    bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? bestAsk - bestBid : null;
  const spreadPct =
    spreadAbs !== null && bestAsk && bestAsk > 0 ? (spreadAbs / bestAsk) * 100 : null;
  const spreadBps = spreadPct !== null ? spreadPct * 100 : null;

  const priceTone =
    price === null
      ? 'text-[#848E9C]'
      : priceDirection === 'up'
        ? 'text-[#0ECB81]'
        : priceDirection === 'down'
          ? 'text-[#F6465D]'
          : 'text-[#EAECEF]';

  return (
    <section aria-label="Resumen del mercado y precios" className="border-b border-[#1F2735] bg-[#11161F]">
      {/* Section 1 (Mobile/Tablet): Touch-friendly Market Selector */}
      <div className="border-b border-[#1F2735] px-4 py-2.5 lg:hidden">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MARKETS.map((m) => {
            const active = m.id === marketId;
            const t = tickers[m.id];
            const pct = t?.priceChangePercent ?? null;
            const up = pct !== null && pct >= 0;

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMarket(m.id)}
                className={`flex min-h-[48px] flex-col justify-between rounded-md border px-3 py-2 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0B90B] ${
                  active
                    ? 'border-[#F0B90B]/60 bg-[#171D29]'
                    : 'border-[#1F2735] bg-[#0E131B] hover:border-[#2C374B]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`font-display text-xs font-bold whitespace-nowrap ${
                      active ? 'text-[#F0B90B]' : 'text-[#EAECEF]'
                    }`}
                  >
                    {m.id}
                  </span>
                  {pct !== null && (
                    <span
                      className={`font-mono tabular-nums text-[11px] font-medium ${
                        up ? 'text-[#0ECB81]' : 'text-[#F6465D]'
                      }`}
                    >
                      {formatSignedPercent(pct)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono tabular-nums text-xs text-[#B7BDC6]">
                  {t?.price !== null && t?.price !== undefined
                    ? formatPrice(t.price, m.priceDecimals)
                    : NO_DATA_LABEL}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections 2 & 3: Price + 24h Stats + Bid / Ask / Spread */}
      <div className="mx-auto max-w-[1600px] px-4 py-3.5 lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          {/* Section 2: Pair, Current Price, 24h Change, High, Low, Volume */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-7">
            <div className="flex items-baseline justify-between gap-4 lg:block">
              <div className="flex items-baseline gap-2.5">
                <h1 className="font-display text-xl font-bold tracking-tight text-[#EAECEF] whitespace-nowrap">
                  {market.id}
                </h1>
                <span className="text-xs text-[#848E9C] whitespace-nowrap">
                  Binance Spot
                  {market.inverted ? ' · EURUSDT invertido' : ''}
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-2.5">
                {loading && price === null ? (
                  <div className="h-7 w-32 animate-pulse rounded bg-[#1A212E]" />
                ) : (
                  <span
                    className={`font-mono tabular-nums text-2xl font-bold tracking-tight transition-colors duration-150 ${priceTone}`}
                  >
                    {formatPrice(price, market.priceDecimals)}
                  </span>
                )}
                {price !== null && (
                  <span className="text-xs font-medium text-[#848E9C]">{market.quoteAsset}</span>
                )}
              </div>
            </div>

            <div className="hidden h-9 w-px bg-[#1F2735] lg:block" aria-hidden="true" />

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4 lg:gap-x-7">
              <div>
                <dt className="text-[11px] text-[#848E9C]">Cambio 24h</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-mono tabular-nums text-xs font-semibold">
                  {changePct === null ? (
                    <span className="font-normal text-[#848E9C]">{NO_DATA_LABEL}</span>
                  ) : (
                    <>
                      {isPositive ? (
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#0ECB81]" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-[#F6465D]" />
                      )}
                      <span className={isPositive ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>
                        {formatSignedPercent(changePct)}
                      </span>
                      {changeAbs !== null && (
                        <span className="hidden text-[11px] font-normal text-[#848E9C] sm:inline">
                          ({changeAbs > 0 ? '+' : ''}
                          {formatPrice(changeAbs, market.priceDecimals)})
                        </span>
                      )}
                    </>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-[11px] text-[#848E9C]">Máximo 24h</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-xs font-medium text-[#EAECEF]">
                  {formatPrice(activeTicker?.highPrice, market.priceDecimals)}
                </dd>
              </div>

              <div>
                <dt className="text-[11px] text-[#848E9C]">Mínimo 24h</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-xs font-medium text-[#EAECEF]">
                  {formatPrice(activeTicker?.lowPrice, market.priceDecimals)}
                </dd>
              </div>

              <div>
                <dt className="text-[11px] text-[#848E9C]">Volumen 24h</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-xs font-medium text-[#EAECEF]">
                  {activeTicker?.volumeBase !== null && activeTicker?.volumeBase !== undefined ? (
                    <>
                      {formatCompactVolume(activeTicker.volumeBase)}{' '}
                      <span className="text-[#848E9C]">USDT</span>
                      {activeTicker.volumeQuote !== null && (
                        <span className="ml-1.5 hidden text-[11px] text-[#848E9C] 2xl:inline">
                          · {formatCompactVolume(activeTicker.volumeQuote)} {market.quoteAsset}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="font-normal text-[#848E9C]">{NO_DATA_LABEL}</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Section 3: Bid, Ask & Spread */}
          <div className="border-t border-[#1F2735] pt-3 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
            <dl className="grid grid-cols-3 gap-4 sm:gap-6">
              <div>
                <dt className="text-[11px] text-[#848E9C]">Mejor Bid</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-[#0ECB81]">
                  {formatPrice(bestBid, market.priceDecimals)}
                </dd>
                <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                  {bestBidQty !== null
                    ? `${formatQty(bestBidQty, market.qtyDecimals)} USDT`
                    : NO_DATA_LABEL}
                </div>
              </div>

              <div>
                <dt className="text-[11px] text-[#848E9C]">Mejor Ask</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-[#F6465D]">
                  {formatPrice(bestAsk, market.priceDecimals)}
                </dd>
                <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                  {bestAskQty !== null
                    ? `${formatQty(bestAskQty, market.qtyDecimals)} USDT`
                    : NO_DATA_LABEL}
                </div>
              </div>

              <div>
                <dt className="text-[11px] text-[#848E9C]">Spread</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-[#F0B90B]">
                  {spreadAbs !== null
                    ? formatPrice(spreadAbs, market.priceDecimals)
                    : NO_DATA_LABEL}
                </dd>
                <div className="font-mono tabular-nums text-[11px] text-[#848E9C]">
                  {spreadPct !== null
                    ? `${spreadPct.toFixed(3)}% · ${spreadBps?.toFixed(1)} bps`
                    : NO_DATA_LABEL}
                </div>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
