'use client';

import { useState, useEffect, useRef, memo } from 'react';
import type { TradingViewSettings } from '@/lib/settings-types';

const SYMBOLS = [
  { id: 'BINANCE:BTCUSDT', label: 'BTC', icon: '\u20BF' },
  { id: 'BINANCE:ETHUSDT', label: 'ETH', icon: '\u039E' },
  { id: 'BINANCE:SOLUSDT', label: 'SOL', icon: '\u25CE' },
  { id: 'BINANCE:XRPUSDT', label: 'XRP', icon: '\u2715' },
];

const INTERVALS: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  'D': '1D',
};

interface ChartWidgetProps {
  symbol: string;
  interval: string;
  height: number;
}

const ChartWidget = memo(function ChartWidget({ symbol, interval, height }: ChartWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef(`tv_${symbol.replace(':', '_')}_${Date.now()}`);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    const widgetId = widgetIdRef.current = `tv_${symbol.replace(':', '_')}_${Date.now()}`;
    const div = document.createElement('div');
    div.id = widgetId;
    div.style.width = '100%';
    div.style.height = `${height}px`;
    container.appendChild(div);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView === 'undefined') return;
      new (window as any).TradingView.widget({
        container_id: widgetId,
        symbol,
        interval,
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#12121e',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        hide_volume: false,
        allow_symbol_change: false,
        width: '100%',
        height,
        backgroundColor: '#0e0e1a',
        gridColor: '#1a1a2a',
      });
    };
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, interval, height]);

  return <div ref={containerRef} />;
});

interface TradingViewChartsProps {
  initialSettings?: TradingViewSettings;
  onSettingsChange?: (s: TradingViewSettings) => void;
}

export default function TradingViewCharts({ initialSettings, onSettingsChange }: TradingViewChartsProps) {
  const [chartsOpen, setChartsOpen] = useState(initialSettings?.open ?? true);
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(
    new Set(initialSettings?.symbols ?? ['BINANCE:BTCUSDT']),
  );
  const [interval, setInterval_] = useState(initialSettings?.interval ?? '5');

  const emitSettings = (patch: Partial<TradingViewSettings>) => {
    onSettingsChange?.({ symbols: [...expandedSymbols], interval, open: chartsOpen, ...patch });
  };

  const toggleSymbol = (sym: string) => {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      emitSettings({ symbols: [...next] });
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedSymbols.size === SYMBOLS.length) {
      setExpandedSymbols(new Set());
      emitSettings({ symbols: [] });
    } else {
      const all = SYMBOLS.map((s) => s.id);
      setExpandedSymbols(new Set(all));
      emitSettings({ symbols: all });
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => { setChartsOpen(!chartsOpen); emitSettings({ open: !chartsOpen }); }} className="flex items-center gap-2 shrink-0 group">
          <span style={{ transform: chartsOpen ? '' : 'rotate(-90deg)', transition: 'transform .25s ease', display: 'flex', alignItems: 'center' }}>
            <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <h3 className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 uppercase tracking-widest transition-colors">Charts</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
            {expandedSymbols.size}/{SYMBOLS.length}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Symbol toggles */}
          {SYMBOLS.map((s) => {
            const active = expandedSymbols.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSymbol(s.id)}
                className={`h-[28px] px-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                  active
                    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                    : 'text-slate-600 hover:text-slate-400 border border-transparent hover:border-[#1f1f32]'
                }`}
              >
                <span className="mr-1 opacity-60">{s.icon}</span>
                {s.label}
              </button>
            );
          })}

          <div className="w-px h-5 bg-[#1f1f32] mx-1" />

          {/* Show/Hide All */}
          <button
            onClick={toggleAll}
            className="h-[28px] px-2.5 rounded-lg text-[10px] font-medium text-slate-500 hover:text-slate-300 border border-[#1f1f32] hover:border-slate-500 transition-colors"
          >
            {expandedSymbols.size === SYMBOLS.length ? 'Hide All' : 'Show All'}
          </button>

          <div className="w-px h-5 bg-[#1f1f32] mx-1" />

          {/* Interval selector */}
          <div className="flex items-center gap-1">
            {Object.entries(INTERVALS).map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setInterval_(val); emitSettings({ interval: val }); }}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  interval === val
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Collapsible body */}
      <div className={`collapsible ${chartsOpen ? '' : 'collapsed'}`}>
        <div className="collapsible-inner">
          {expandedSymbols.size === 0 ? (
            <div className="px-5 py-8 text-center text-slate-600 text-xs">
              Select a symbol above to show its chart
            </div>
          ) : (
            <div className={`grid gap-0 ${
              expandedSymbols.size === 1
                ? 'grid-cols-1'
                : expandedSymbols.size === 2
                  ? 'grid-cols-1 lg:grid-cols-2'
                  : expandedSymbols.size === 3
                    ? 'grid-cols-1 lg:grid-cols-3'
                    : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
            }`}>
              {SYMBOLS.filter((s) => expandedSymbols.has(s.id)).map((s) => (
                <div key={s.id} className="border border-[#1a1a2a] relative">
                  {/* Symbol label overlay */}
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-[#12121e]/80 backdrop-blur-sm px-2 py-1 rounded-md border border-[#1f1f32]">
                    <span className="text-[10px] text-violet-400 font-bold">{s.icon}</span>
                    <span className="text-[10px] text-slate-300 font-semibold">{s.label}/USDT</span>
                  </div>
                  <ChartWidget
                    symbol={s.id}
                    interval={interval}
                    height={expandedSymbols.size <= 2 ? 400 : 320}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
