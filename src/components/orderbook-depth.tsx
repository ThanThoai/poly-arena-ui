'use client';

import { useState, useMemo } from 'react';
import { useOrderbook } from '@/hooks/use-trades';
import { OrderbookLevel } from '@/lib/api';
import SymbolBadge from '@/components/ui/symbol-badge';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];
const TIMEFRAMES = ['M5', 'M15', 'H1'];
const DIRECTIONS = ['UP', 'DOWN'] as const;

export default function OrderbookDepth() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [selectedTf, setSelectedTf] = useState('M5');
  const [selectedDir, setSelectedDir] = useState<'UP' | 'DOWN'>('UP');
  const [open, setOpen] = useState(true);

  const orderbooks = useOrderbook(selectedSymbol, selectedTf);

  const book = useMemo(
    () => orderbooks.find((ob) => ob.direction === selectedDir),
    [orderbooks, selectedDir],
  );

  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];

  // Max size across both sides for bar scaling
  const maxSize = useMemo(() => {
    const allSizes = [...bids.map((l) => l.size), ...asks.map((l) => l.size)];
    return allSizes.length > 0 ? Math.max(...allSizes) : 1;
  }, [bids, asks]);

  const totalBidSize = useMemo(() => bids.reduce((s, l) => s + l.size, 0), [bids]);
  const totalAskSize = useMemo(() => asks.reduce((s, l) => s + l.size, 0), [asks]);

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 shrink-0 group">
          <span style={{ transform: open ? '' : 'rotate(-90deg)', transition: 'transform .25s ease', display: 'flex', alignItems: 'center' }}>
            <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <span className="w-2 h-2 rounded-full bg-violet-400 live-dot" />
          <h3 className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 uppercase tracking-widest transition-colors">
            Orderbook Depth
          </h3>
          {book && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              {bids.length + asks.length} levels
            </span>
          )}
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Symbol selector */}
          <div className="flex items-center gap-1">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
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
                onClick={() => setSelectedTf(tf)}
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

          {/* Direction toggle */}
          <div className="flex items-center gap-1">
            {DIRECTIONS.map((dir) => (
              <button
                key={dir}
                onClick={() => setSelectedDir(dir)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  selectedDir === dir
                    ? dir === 'UP'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={`collapsible ${open ? '' : 'collapsed'}`}>
        <div className="collapsible-inner">
          {!book || (bids.length === 0 && asks.length === 0) ? (
            <div className="px-5 py-8 text-center text-slate-600 text-xs">
              No orderbook data for {selectedSymbol} {selectedTf} {selectedDir}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-0 divide-x divide-[#1a1a2a]">
              {/* Bids (left) */}
              <div className="px-4 py-3">
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
                    <DepthRow
                      key={`bid-${i}`}
                      level={level}
                      maxSize={maxSize}
                      side="bid"
                    />
                  ))}
                </div>
              </div>

              {/* Asks (right) */}
              <div className="px-4 py-3">
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
                    <DepthRow
                      key={`ask-${i}`}
                      level={level}
                      maxSize={maxSize}
                      side="ask"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
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
