import { RefreshCw } from 'lucide-react';
import { MARKETS, formatPrice, formatSignedPercent } from '../config/markets';
import type { ConnectionInfo, MarketId, Ticker24h } from '../types/market';

interface TopBarProps {
  marketId: MarketId;
  onSelectMarket: (id: MarketId) => void;
  tickers: Partial<Record<MarketId, Ticker24h>>;
  connectionInfo: ConnectionInfo;
  onRefresh: () => void;
}

export function TopBar({
  marketId,
  onSelectMarket,
  tickers,
  connectionInfo,
  onRefresh,
}: TopBarProps) {
  const isLive = connectionInfo.isLive;

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-[#1F2735] bg-[#0B0E14]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4 lg:gap-8 lg:px-6">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M12 2L17.2 7.2L15.1 9.3L12 6.2L8.9 9.3L6.8 7.2L12 2Z"
              fill="#F0B90B"
            />
            <path
              d="M12 22L6.8 16.8L8.9 14.7L12 17.8L15.1 14.7L17.2 16.8L12 22Z"
              fill="#F0B90B"
            />
            <path d="M12 9.2L14.8 12L12 14.8L9.2 12L12 9.2Z" fill="#EAECEF" />
            <path d="M4.2 12L6.3 9.9L8.4 12L6.3 14.1L4.2 12Z" fill="#F0B90B" />
            <path d="M15.6 12L17.7 9.9L19.8 12L17.7 14.1L15.6 12Z" fill="#F0B90B" />
          </svg>
          <span className="font-display text-base font-bold tracking-tight text-[#EAECEF] whitespace-nowrap">
            SPOT MASTER
          </span>
        </div>

        {/* Zone 2: Desktop Market Selector (4 Binance Spot pairs) */}
        <nav
          aria-label="Mercados Spot"
          className="hidden lg:flex items-center gap-1"
        >
          {MARKETS.map((m) => {
            const active = m.id === marketId;
            const t = tickers[m.id];
            const pct = t?.priceChangePercent ?? null;
            const isUp = pct !== null && pct >= 0;

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMarket(m.id)}
                className={`group flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0B90B] ${
                  active
                    ? 'bg-[#171D29] text-[#EAECEF] ring-1 ring-inset ring-[#F0B90B]/40'
                    : 'text-[#848E9C] hover:bg-[#131823] hover:text-[#EAECEF]'
                }`}
              >
                <span className={`font-display font-semibold ${active ? 'text-[#F0B90B]' : 'text-[#EAECEF]'}`}>
                  {m.id}
                </span>
                {t?.price !== null && t?.price !== undefined && (
                  <span className="font-mono tabular-nums text-[11px] text-[#B7BDC6]">
                    {formatPrice(t.price, m.priceDecimals)}
                  </span>
                )}
                {pct !== null && (
                  <span
                    className={`font-mono tabular-nums text-[11px] font-medium ${
                      isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatSignedPercent(pct)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Visible BINANCE LIVE / OFFLINE Indicator + Refresh */}
        <div className="flex shrink-0 items-center gap-3">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 font-mono text-xs font-semibold whitespace-nowrap"
          >
            <span aria-hidden="true">{isLive ? '🟢' : '🔴'}</span>
            <span className={isLive ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>
              {isLive ? 'BINANCE EN DIRECTO' : 'BINANCE SIN CONEXIÓN'}
            </span>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            aria-label="Actualizar datos de Binance"
            className="flex h-9 items-center gap-1.5 rounded-md border border-[#242D3D] bg-[#11161F] px-3 text-xs font-medium text-[#EAECEF] transition-colors duration-150 hover:border-[#364359] hover:bg-[#171D29] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0B90B]"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#F0B90B]" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>
    </header>
  );
}
