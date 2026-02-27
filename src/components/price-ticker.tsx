'use client';

import { useMemo, useState, useEffect } from 'react';
import { PriceEntry } from '@/lib/api';
import SymbolBadge from '@/components/ui/symbol-badge';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];
const TIMEFRAMES = ['M5', 'M15', 'H1'];

const TF_SECONDS: Record<string, number> = { M5: 300, M15: 900, H1: 3600 };

interface PriceTickerProps {
  prices: PriceEntry[];
}

function useSessionCountdown(tf: string): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const period = TF_SECONDS[tf] ?? 300;
    const calc = () => {
      const now = Math.floor(Date.now() / 1000);
      return (Math.floor(now / period) + 1) * period - now;
    };
    setRemaining(calc());
    const id = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(id);
  }, [tf]);

  return remaining;
}

function formatCountdown(s: number): string {
  if (s <= 0) return '00:00';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function PriceTicker({ prices }: PriceTickerProps) {
  const [selectedTf, setSelectedTf] = useState('M5');
  const [open, setOpen] = useState(true);
  const countdown = useSessionCountdown(selectedTf);
  const transitioning = countdown <= 10;

  const lookup = useMemo(() => {
    const map: Record<string, Record<string, PriceEntry>> = {};
    for (const p of prices) {
      const key = `${p.symbol}:${p.timeframe}`;
      if (!map[key]) map[key] = {};
      map[key][p.direction] = p;
    }
    return map;
  }, [prices]);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 shrink-0 group">
          <span style={{ transform: open ? '' : 'rotate(-90deg)', transition: 'transform .25s ease', display: 'flex', alignItems: 'center' }}>
            <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <span className="w-2 h-2 rounded-full bg-sky-400 live-dot" />
          <h3 className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 uppercase tracking-widest transition-colors">Live Prices</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
            {prices.length} feeds
          </span>
        </button>

        <div className="flex items-center gap-3">
          {/* Session countdown */}
          <div className={`flex items-center gap-1.5 text-[10px] font-mono ${transitioning ? 'text-amber-400' : 'text-slate-500'}`}>
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{formatCountdown(countdown)}</span>
            <span className="text-slate-600">next {selectedTf}</span>
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
        </div>
      </div>

      <div className={`collapsible ${open ? '' : 'collapsed'}`}>
        <div className="collapsible-inner">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-center font-medium" colSpan={2}>
                <span className="text-emerald-500">GREEN (UP)</span>
              </th>
              <th className="px-4 py-2.5 text-center font-medium" colSpan={2}>
                <span className="text-rose-500">RED (DOWN)</span>
              </th>
              <th className="px-4 py-2.5 text-center font-medium">Spread</th>
              <th className="px-4 py-2.5 text-right font-medium">Session</th>
            </tr>
            <tr className="text-[9px] text-slate-600 border-b border-[#0e0e1a] uppercase tracking-wide">
              <th />
              <th className="px-4 py-1 text-center font-medium">Bid</th>
              <th className="px-4 py-1 text-center font-medium">Ask</th>
              <th className="px-4 py-1 text-center font-medium">Bid</th>
              <th className="px-4 py-1 text-center font-medium">Ask</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {SYMBOLS.map((sym) => {
              const key = `${sym}:${selectedTf}`;
              const up = lookup[key]?.UP;
              const down = lookup[key]?.DOWN;
              const hasPrices = up || down;

              const spread =
                up?.best_ask != null && up?.best_bid != null
                  ? up.best_ask - up.best_bid
                  : null;

              return (
                <tr
                  key={sym}
                  className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    <SymbolBadge symbol={sym} />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <PriceCell value={up?.best_bid} color="text-emerald-400" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PriceCell value={up?.best_ask} color="text-emerald-300" />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <PriceCell value={down?.best_bid} color="text-rose-400" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PriceCell value={down?.best_ask} color="text-rose-300" />
                  </td>

                  <td className="px-4 py-3 text-center">
                    {spread != null ? (
                      <span
                        className={`font-mono text-[11px] ${
                          spread < 0.05
                            ? 'text-emerald-400'
                            : spread < 0.1
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {(spread * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-600">{'\u2014'}</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {hasPrices ? (
                      <span className={`font-mono text-[10px] ${transitioning ? 'text-amber-400' : 'text-slate-500'}`}>
                        {formatCountdown(countdown)}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">no data</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        </div>
      </div>
    </div>
  );
}

function PriceCell({ value, color }: { value: number | null | undefined; color: string }) {
  if (value == null) {
    return <span className="text-slate-600 font-mono text-[11px]">{'\u2014'}</span>;
  }
  return (
    <span className={`font-mono text-[11px] font-semibold ${color}`}>
      {(value * 100).toFixed(1)}&cent;
    </span>
  );
}
