import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import {
  MARKET_MAP,
  NO_DATA_LABEL,
  TIMEFRAMES,
  TIMEFRAME_MAP,
  formatCompactVolume,
  formatPrice,
} from '../config/markets';
import type {
  Candle,
  MarketId,
  TechnicalAnalysis,
  Timeframe,
} from '../types/market';

interface CandlestickChartProps {
  marketId: MarketId;
  timeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  candles: Candle[];
  analysis: TechnicalAnalysis | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

interface OhlcReadout {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function CandlestickChart({
  marketId,
  timeframe,
  onSelectTimeframe,
  candles,
  analysis,
  loading,
  error,
  onRetry,
}: CandlestickChartProps) {
  const market = MARKET_MAP[marketId];
  const tfConfig = TIMEFRAME_MAP[timeframe];
  const datasetKey = `${marketId}-${timeframe}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma7SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma25SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma99SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const supportLineRef = useRef<IPriceLine | null>(null);
  const resistanceLineRef = useRef<IPriceLine | null>(null);
  const candlesMapRef = useRef<Map<number, Candle>>(new Map());
  const loadedDatasetKeyRef = useRef<string>('');
  const lastSeriesMetaRef = useRef<{ count: number; firstTime: number; lastTime: number }>({
    count: 0,
    firstTime: 0,
    lastTime: 0,
  });

  const [showMas, setShowMas] = useState<boolean>(true);
  const [showSR, setShowSR] = useState<boolean>(true);
  const [hoveredOhlc, setHoveredOhlc] = useState<OhlcReadout | null>(null);

  // Reset series metadata whenever market or timeframe changes
  useEffect(() => {
    loadedDatasetKeyRef.current = '';
    lastSeriesMetaRef.current = { count: 0, firstTime: 0, lastTime: 0 };
    setHoveredOhlc(null);
  }, [datasetKey]);

  // Initialize lightweight-charts instance once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#11161F' },
        textColor: '#848E9C',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1A212E' },
        horzLines: { color: '#1A212E' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#3A465C',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1F2735',
        },
        horzLine: {
          color: '#3A465C',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1F2735',
        },
      },
      rightPriceScale: {
        borderColor: '#1F2735',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: '#1F2735',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0ECB81',
      downColor: '#F6465D',
      borderVisible: false,
      wickUpColor: '#0ECB81',
      wickDownColor: '#F6465D',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    const ma7Series = chart.addSeries(LineSeries, {
      color: '#F0B90B',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const ma25Series = chart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const ma99Series = chart.addSeries(LineSeries, {
      color: '#94A3B8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.time || typeof param.time !== 'number') {
        setHoveredOhlc(null);
        return;
      }
      const match = candlesMapRef.current.get(param.time);
      if (match) {
        setHoveredOhlc({
          open: match.open,
          high: match.high,
          low: match.low,
          close: match.close,
          volume: match.volume,
        });
      }
    };

    chart.subscribeCrosshairMove(handleCrosshair);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ma7SeriesRef.current = ma7Series;
    ma25SeriesRef.current = ma25Series;
    ma99SeriesRef.current = ma99Series;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshair);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ma7SeriesRef.current = null;
      ma25SeriesRef.current = null;
      ma99SeriesRef.current = null;
      supportLineRef.current = null;
      resistanceLineRef.current = null;
    };
  }, []);

  // Update price format when active market changes
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision: market.priceDecimals,
        minMove: market.tickSize,
      },
    });
  }, [market.priceDecimals, market.tickSize]);

  // Feed candlestick & volume data: full setData on dataset switch, incremental update() on live WS ticks
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const map = new Map<number, Candle>();
    for (const c of candles) {
      map.set(c.time, c);
    }
    candlesMapRef.current = map;

    if (candles.length === 0) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      loadedDatasetKeyRef.current = '';
      lastSeriesMetaRef.current = { count: 0, firstTime: 0, lastTime: 0 };
      return;
    }

    const first = candles[0];
    const last = candles[candles.length - 1];
    const prevMeta = lastSeriesMetaRef.current;

    const isIncrementalTick =
      loadedDatasetKeyRef.current === datasetKey &&
      prevMeta.count > 0 &&
      prevMeta.firstTime === first.time &&
      last.time >= prevMeta.lastTime &&
      candles.length - prevMeta.count <= 1;

    if (isIncrementalTick) {
      candleSeriesRef.current.update({
        time: last.time as Time,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      });
      volumeSeriesRef.current.update({
        time: last.time as Time,
        value: last.volume,
        color: last.close >= last.open ? 'rgba(14, 203, 129, 0.28)' : 'rgba(246, 70, 93, 0.28)',
      });
      lastSeriesMetaRef.current = {
        count: candles.length,
        firstTime: first.time,
        lastTime: last.time,
      };
      return;
    }

    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(14, 203, 129, 0.28)' : 'rgba(246, 70, 93, 0.28)',
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    const needsInitialViewport = loadedDatasetKeyRef.current !== datasetKey;
    loadedDatasetKeyRef.current = datasetKey;
    lastSeriesMetaRef.current = {
      count: candles.length,
      firstTime: first.time,
      lastTime: last.time,
    };

    if (needsInitialViewport && chartRef.current) {
      const visibleBars = Math.min(candles.length, 110);
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - visibleBars),
        to: candles.length + 4,
      });
    }
  }, [candles, datasetKey]);

  // Feed MA7 / MA25 / MA99 overlays & nearest Support/Resistance price lines
  useEffect(() => {
    if (
      !ma7SeriesRef.current ||
      !ma25SeriesRef.current ||
      !ma99SeriesRef.current ||
      !candleSeriesRef.current
    ) {
      return;
    }

    if (showMas && analysis) {
      const toLine = (arr: Array<{ time: number; value: number }>): LineData<Time>[] =>
        arr.map((pt) => ({ time: pt.time as Time, value: pt.value }));

      ma7SeriesRef.current.setData(toLine(analysis.ma7Series));
      ma25SeriesRef.current.setData(toLine(analysis.ma25Series));
      ma99SeriesRef.current.setData(toLine(analysis.ma99Series));
    } else {
      ma7SeriesRef.current.setData([]);
      ma25SeriesRef.current.setData([]);
      ma99SeriesRef.current.setData([]);
    }

    // Clear old S/R lines before drawing updated ones
    if (supportLineRef.current) {
      candleSeriesRef.current.removePriceLine(supportLineRef.current);
      supportLineRef.current = null;
    }
    if (resistanceLineRef.current) {
      candleSeriesRef.current.removePriceLine(resistanceLineRef.current);
      resistanceLineRef.current = null;
    }

    if (showSR && analysis) {
      const s1 = analysis.supports[0];
      const r1 = analysis.resistances[0];

      if (s1) {
        supportLineRef.current = candleSeriesRef.current.createPriceLine({
          price: s1.price,
          color: 'rgba(14, 203, 129, 0.72)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Soporte S1',
        });
      }
      if (r1) {
        resistanceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: r1.price,
          color: 'rgba(246, 70, 93, 0.72)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Resistencia R1',
        });
      }
    }
  }, [analysis, showMas, showSR]);

  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const activeOhlc = hoveredOhlc ?? latestCandle;
  const ohlcPositive = activeOhlc ? activeOhlc.close >= activeOhlc.open : true;

  return (
    <section
      aria-label="Gráfica de velas"
      className="flex flex-col border border-[#1F2735] bg-[#11161F] rounded-lg overflow-hidden"
    >
      {/* Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1F2735] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-[#EAECEF] whitespace-nowrap">
            Gráfica de Velas
          </h2>
          <div
            role="group"
            aria-label="Intervalo de velas"
            className="flex items-center gap-1 rounded-md bg-[#0B0E14] p-0.5 border border-[#1F2735]"
          >
            {TIMEFRAMES.map((tf) => {
              const active = tf.id === timeframe;
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => onSelectTimeframe(tf.id)}
                  title={tf.description}
                  className={`min-h-[30px] rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F0B90B] ${
                    active
                      ? 'bg-[#1D2534] text-[#F0B90B]'
                      : 'text-[#848E9C] hover:text-[#EAECEF]'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
          <span className="hidden text-[11px] text-[#848E9C] sm:inline whitespace-nowrap">
            {tfConfig.historyLabel}
            {candles.length > 0 ? ` · ${candles.length} velas` : ''}
          </span>
        </div>

        {/* Indicator toggles */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMas((v) => !v)}
            aria-pressed={showMas}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F0B90B] ${
              showMas
                ? 'bg-[#1B2230] text-[#EAECEF]'
                : 'text-[#848E9C] hover:text-[#EAECEF]'
            }`}
          >
            MA 7/25/99
          </button>
          <button
            type="button"
            onClick={() => setShowSR((v) => !v)}
            aria-pressed={showSR}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#F0B90B] ${
              showSR
                ? 'bg-[#1B2230] text-[#EAECEF]'
                : 'text-[#848E9C] hover:text-[#EAECEF]'
            }`}
          >
            Soporte / Resistencia
          </button>
        </div>
      </div>

      {/* Live OHLCV + MA7/MA25/MA99 legend strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#1A212E] bg-[#0E131B] px-4 py-1.5 text-[11px] font-mono tabular-nums">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#848E9C]">
          <span>
            A{' '}
            <strong className={activeOhlc ? (ohlcPositive ? 'text-[#0ECB81]' : 'text-[#F6465D]') : 'text-[#848E9C]'}>
              {formatPrice(activeOhlc?.open, market.priceDecimals)}
            </strong>
          </span>
          <span>
            Máx{' '}
            <strong className={activeOhlc ? (ohlcPositive ? 'text-[#0ECB81]' : 'text-[#F6465D]') : 'text-[#848E9C]'}>
              {formatPrice(activeOhlc?.high, market.priceDecimals)}
            </strong>
          </span>
          <span>
            Mín{' '}
            <strong className={activeOhlc ? (ohlcPositive ? 'text-[#0ECB81]' : 'text-[#F6465D]') : 'text-[#848E9C]'}>
              {formatPrice(activeOhlc?.low, market.priceDecimals)}
            </strong>
          </span>
          <span>
            C{' '}
            <strong className={activeOhlc ? (ohlcPositive ? 'text-[#0ECB81]' : 'text-[#F6465D]') : 'text-[#848E9C]'}>
              {formatPrice(activeOhlc?.close, market.priceDecimals)}
            </strong>
          </span>
          <span>
            Vol{' '}
            <strong className="text-[#EAECEF]">
              {activeOhlc ? `${formatCompactVolume(activeOhlc.volume)} USDT` : NO_DATA_LABEL}
            </strong>
          </span>
        </div>

        {showMas && analysis && (
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="text-[#F0B90B]">
              MA7 {formatPrice(analysis.ma7, market.priceDecimals)}
            </span>
            <span className="text-[#38BDF8]">
              MA25 {formatPrice(analysis.ma25, market.priceDecimals)}
            </span>
            <span className="text-[#94A3B8]">
              MA99 {formatPrice(analysis.ma99, market.priceDecimals)}
            </span>
          </div>
        )}
      </div>

      {/* Chart Canvas Area */}
      <div className="relative h-[320px] sm:h-[390px] lg:h-[440px] w-full">
        <div ref={containerRef} className="h-full w-full" />

        {loading && candles.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#11161F]/90">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2A3446] border-t-[#F0B90B]" />
            <p className="text-xs text-[#848E9C]">
              Cargando histórico de {market.id} ({tfConfig.label} · {tfConfig.historyLabel})...
            </p>
          </div>
        )}

        {!loading && candles.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#11161F]/95 px-6 text-center">
            <p className="font-mono text-sm font-semibold text-[#EAECEF]">
              {NO_DATA_LABEL}
            </p>
            <p className="max-w-md text-xs text-[#848E9C]">
              {error ?? `Binance no devolvió velas para ${market.id} (${tfConfig.label}).`}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-[#F0B90B] px-4 py-2 text-xs font-semibold text-[#0B0E14] transition-opacity hover:opacity-90 cursor-pointer"
            >
              Reintentar conexión
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
