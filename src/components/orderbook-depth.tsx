'use client';

import { useState, useMemo } from 'react';
import { useOrderbook } from '@/hooks/use-trades';
import { OrderbookLevel } from '@/lib/api';
import SymbolBadge from '@/components/ui/symbol-badge';
import type { OrderbookSettings } from '@/lib/settings-types';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];
const TIMEFRAMES = ['M5', 'M15', 'H1'];

interface OrderbookDepthProps {
  initialSettings?: OrderbookSettings;
  onSettingsChange?: (s: OrderbookSettings) => void;
}

export default function OrderbookDepth({ initialSettings, onSettingsChange }: OrderbookDepthProps) {
  const [selectedSymbol, setSelectedSymbol] = useState(initialSettings?.symbol ?? 'BTC');
  const [selectedTf, setSelectedTf] = useState(initialSettings?.timeframe ?? 'M5');
  const [open, setOpen] = useState(initialSettings?.open ?? true);

  const orderbooks = useOrderbook(selectedSymbol, selectedTf);

  const bookUp = useMemo(
    () => orderbooks.find((ob) => ob.direction === 'UP'),
    [orderbooks],
  );
  const bookDown = useMemo(
    () => orderbooks.find((ob) => ob.direction === 'DOWN'),
    [orderbooks],
  );

  const totalLevels = useMemo(() => {
    const up = (bookUp?.bids.length ?? 0) + (bookUp?.asks.length ?? 0);
    const down = (bookDown?.bids.length ?? 0) + (bookDown?.asks.length ?? 0);
    return up + down;
  }, [bookUp, bookDown]);

  const hasData = bookUp || bookDown;

  const emitSettings = (patch: Partial<OrderbookSettings>) => {
    onSettingsChange?.({ symbol: selectedSymbol, timeframe: selectedTf, open, ...patch });
  };

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => { setOpen(!open); emitSettings({ open: !open }); }} className="flex items-center gap-2 shrink-0 group">
          <span style={{ transform: open ? '' : 'rotate(-90deg)', transition: 'transform .25s ease', display: 'flex', alignItems: 'center' }}>
            <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <span className="w-2 h-2 rounded-full bg-violet-400 live-dot" />
          <h3 className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 uppercase tracking-widest transition-colors">
            Orderbook Depth
          </h3>
          {totalLevels > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              {totalLevels} levels
            </span>
          )}
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Symbol selector */}
          <div className="flex items-center gap-1">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                onClick={() => { setSelectedSymbol(sym); emitSettings({ symbol: sym }); }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  selectedSymbol === sym
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => { setSelectedTf(tf); emitSettings({ timeframe: tf }); }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  selectedTf === tf
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={`collapsible ${open ? '' : 'collapsed'}`}>
        <div className="collapsible-inner">
          {!hasData ? (
            <div className="px-5 py-8 text-center text-slate-600 text-xs">
              No orderbook data for {selectedSymbol} {selectedTf}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[#1a1a2a]">
              <DirectionBook label="UP" book={bookUp} symbol={selectedSymbol} tf={selectedTf} />
              <DirectionBook label="DOWN" book={bookDown} symbol={selectedSymbol} tf={selectedTf} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DirectionBook({
  label,
  book,
  symbol,
  tf,
}: {
  label: 'UP' | 'DOWN';
  book: { bids: OrderbookLevel[]; asks: OrderbookLevel[] } | undefined;
  symbol: string;
  tf: string;
}) {
  const MAX_LEVELS = 10;
  const bids = (book?.bids ?? []).slice(0, MAX_LEVELS);
  const asks = (book?.asks ?? []).slice(0, MAX_LEVELS);

  const maxSize = useMemo(() => {
    const allSizes = [...bids.map((l) => l.size), ...asks.map((l) => l.size)];
    return allSizes.length > 0 ? Math.max(...allSizes) : 1;
  }, [bids, asks]);

  const totalBidSize = useMemo(() => bids.reduce((s, l) => s + l.size, 0), [bids]);
  const totalAskSize = useMemo(() => asks.reduce((s, l) => s + l.size, 0), [asks]);

  const isEmpty = bids.length === 0 && asks.length === 0;
  const dirCls = label === 'UP'
    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30';

  return (
    <div className="py-3">
      {/* Direction header */}
      <div className="px-4 flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${dirCls}`}>
          {label}
        </span>
        {!isEmpty && (
          <span className="text-[10px] text-slate-500 font-mono">
            {bids.length + asks.length} levels
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="px-4 py-4 text-center text-slate-600 text-[11px]">
          No data for {symbol} {tf} {label}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-0 divide-x divide-[#1a1a2a]">
          {/* Bids */}
          <div className="px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">
                Bids
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {totalBidSize.toFixed(2)} total
              </span>
            </div>
            <div className="space-y-px">
              <div className="flex items-center justify-between text-[9px] text-slate-600 uppercase tracking-wide pb-1">
                <span>Price</span>
                <span>Size</span>
              </div>
              {bids.map((level, i) => (
                <DepthRow key={`bid-${i}`} level={level} maxSize={maxSize} side="bid" />
              ))}
            </div>
          </div>

          {/* Asks */}
          <div className="px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide">
                Asks
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {totalAskSize.toFixed(2)} total
              </span>
            </div>
            <div className="space-y-px">
              <div className="flex items-center justify-between text-[9px] text-slate-600 uppercase tracking-wide pb-1">
                <span>Price</span>
                <span>Size</span>
              </div>
              {asks.map((level, i) => (
                <DepthRow key={`ask-${i}`} level={level} maxSize={maxSize} side="ask" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DepthRow({
  level,
  maxSize,
  side,
}: {
  level: OrderbookLevel;
  maxSize: number;
  side: 'bid' | 'ask';
}) {
  const pct = maxSize > 0 ? (level.size / maxSize) * 100 : 0;
  const barColor = side === 'bid' ? 'bg-emerald-500/15' : 'bg-rose-500/15';
  const textColor = side === 'bid' ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className="relative flex items-center justify-between py-[3px] px-1.5 rounded-sm">
      {/* Background bar */}
      <div
        className={`absolute inset-y-0 ${side === 'bid' ? 'right-0' : 'left-0'} ${barColor} rounded-sm transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
      {/* Price */}
      <span className={`relative z-10 font-mono text-[11px] font-semibold ${textColor}`}>
        {(level.price * 100).toFixed(1)}&cent;
      </span>
      {/* Size */}
      <span className="relative z-10 font-mono text-[11px] text-slate-400">
        {level.size.toFixed(2)}
      </span>
    </div>
  );
}
