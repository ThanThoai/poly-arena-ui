'use client';

import { useState, useEffect, useMemo } from 'react';
import { Trade, TimelineEvent, TradeInspectResponse, inspectTrade } from '@/lib/api';
import { money, fmtCents, dtParts, pnlCls } from '@/lib/helpers';

interface InspectorModalProps {
  open: boolean;
  onClose: () => void;
  trade: Trade | null;
}

const CATEGORY_BADGE: Record<string, string> = {
  trace: 'bg-violet-950 text-violet-400 border-violet-800/50',
  price: 'bg-slate-800 text-slate-300 border-slate-700/50',
  fill_entry: 'bg-emerald-950 text-emerald-400 border-emerald-800/50',
  fill_exit: 'bg-amber-950 text-amber-400 border-amber-800/50',
};

function FillTable({ levels, label, color }: { levels: { price: number; qty: number; cost: number }[]; label: string; color: string }) {
  if (!levels || levels.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1.5">{label}</div>
      <div className="rounded-lg overflow-hidden" style={{ background: '#060610', border: '1px solid #12121e' }}>
        <div className="grid grid-cols-3 gap-1 px-3 py-1.5 text-[9px] text-slate-600 uppercase tracking-widest border-b border-[#12121e]">
          <span>Price</span><span className="text-right">Qty</span><span className="text-right">Cost</span>
        </div>
        {levels.map((l, i) => (
          <div key={i} className="grid grid-cols-3 gap-1 px-3 py-1 text-[10px] font-mono items-center">
            <span className={color}>{(l.price * 100).toFixed(1)}&cent;</span>
            <span className="text-right text-slate-300">{l.qty.toFixed(2)}</span>
            <span className="text-right text-slate-400">${l.cost.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Orderbook Depth for Price Snapshots ──────────────────────────────────── */

function DepthRow({ price, size, maxSize, side }: { price: number; size: number; maxSize: number; side: 'bid' | 'ask' }) {
  const pct = maxSize > 0 ? (size / maxSize) * 100 : 0;
  const barColor = side === 'bid' ? 'bg-emerald-500/15' : 'bg-rose-500/15';
  const textColor = side === 'bid' ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className="relative flex items-center justify-between py-[3px] px-1.5 rounded-sm">
      <div
        className={`absolute inset-y-0 ${side === 'bid' ? 'right-0' : 'left-0'} ${barColor} rounded-sm transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
      <span className={`relative z-10 font-mono text-[11px] font-semibold ${textColor}`}>
        {(price * 100).toFixed(1)}&cent;
      </span>
      <span className="relative z-10 font-mono text-[11px] text-slate-400">
        {size.toFixed(2)}
      </span>
    </div>
  );
}

function PriceSnapshotBook({ data }: { data: Record<string, unknown> }) {
  const rawBids = (data.bids ?? []) as [number, number][];
  const rawAsks = (data.asks ?? []) as [number, number][];

  const MAX_LEVELS = 10;
  const bids = rawBids.slice(0, MAX_LEVELS);
  const asks = rawAsks.slice(0, MAX_LEVELS);

  const maxSize = useMemo(() => {
    const allSizes = [...bids.map(([, s]) => s), ...asks.map(([, s]) => s)];
    return allSizes.length > 0 ? Math.max(...allSizes) : 1;
  }, [bids, asks]);

  const totalBidSize = bids.reduce((s, [, sz]) => s + sz, 0);
  const totalAskSize = asks.reduce((s, [, sz]) => s + sz, 0);
  const spread = bids.length > 0 && asks.length > 0
    ? ((asks[0][0] - bids[0][0]) * 100).toFixed(1)
    : null;

  if (bids.length === 0 && asks.length === 0) {
    return <div className="text-[10px] text-slate-600 text-center py-2">No orderbook data</div>;
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: '#060610', border: '1px solid #12121e' }}>
      {/* Spread indicator */}
      {spread != null && (
        <div className="flex items-center justify-center gap-2 py-1.5 border-b border-[#12121e]">
          <span className="text-[9px] text-slate-600 uppercase tracking-wide">Spread</span>
          <span className="text-[10px] font-mono font-semibold text-slate-400">{spread}&cent;</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-0 divide-x divide-[#12121e]">
        {/* Bids */}
        <div className="px-2 py-2">
          <div className="flex items-center justify-between mb-1.5 px-1.5">
            <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Bids</span>
            <span className="text-[9px] text-slate-500 font-mono">{totalBidSize.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-[8px] text-slate-600 uppercase tracking-wide pb-1 px-1.5">
            <span>Price</span>
            <span>Size</span>
          </div>
          <div className="space-y-px">
            {bids.map(([price, size], i) => (
              <DepthRow key={`bid-${i}`} price={price} size={size} maxSize={maxSize} side="bid" />
            ))}
          </div>
          {rawBids.length > MAX_LEVELS && (
            <div className="text-[9px] text-slate-600 text-center pt-1">+{rawBids.length - MAX_LEVELS} more</div>
          )}
        </div>

        {/* Asks */}
        <div className="px-2 py-2">
          <div className="flex items-center justify-between mb-1.5 px-1.5">
            <span className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide">Asks</span>
            <span className="text-[9px] text-slate-500 font-mono">{totalAskSize.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-[8px] text-slate-600 uppercase tracking-wide pb-1 px-1.5">
            <span>Price</span>
            <span>Size</span>
          </div>
          <div className="space-y-px">
            {asks.map(([price, size], i) => (
              <DepthRow key={`ask-${i}`} price={price} size={size} maxSize={maxSize} side="ask" />
            ))}
          </div>
          {rawAsks.length > MAX_LEVELS && (
            <div className="text-[9px] text-slate-600 text-center pt-1">+{rawAsks.length - MAX_LEVELS} more</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Check if event data looks like a price snapshot (has bids/asks arrays). */
function isPriceSnapshot(evt: TimelineEvent): boolean {
  if (evt.category !== 'price' || evt.data == null || Array.isArray(evt.data)) return false;
  const d = evt.data as Record<string, unknown>;
  return Array.isArray(d.bids) || Array.isArray(d.asks);
}

export default function InspectorModal({ open, onClose, trade }: InspectorModalProps) {
  const [data, setData] = useState<TradeInspectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !trade) { setData(null); setError(''); return; }
    setLoading(true);
    setError('');
    setExpandedEvent(null);
    inspectTrade(trade.id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [open, trade?.id]);

  if (!open || !trade) return null;

  const created = dtParts(trade.created_at);
  const resultCls = trade.result === 'WIN' ? 'text-emerald-400' : trade.result === 'LOSS' ? 'text-rose-400' : 'text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-card w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: '#0e0e1a', border: '1px solid #1f1f32' }}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[#1a1a2a] shrink-0">
          <div className="absolute inset-x-0 top-0 h-16 blur-3xl opacity-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%,#7c3aed,transparent 70%)' }} />
          <button onClick={onClose} className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)', boxShadow: '0 0 20px rgba(124,58,237,.3)' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-200">Inspector</h3>
              <p className="text-[11px] text-slate-500">
                #{trade.id} &middot; {trade.symbol} &middot; {trade.timeframe} &middot;{' '}
                <span className={trade.forecast === 'GREEN' ? 'text-emerald-400' : 'text-rose-400'}>{trade.forecast}</span>
                {created && <span> &middot; {created.date}</span>}
              </p>
            </div>
          </div>

          {/* Trade summary row */}
          {data && (
            <div className="relative mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
              <span className="text-slate-500">Amount <span className="text-slate-200 font-medium">{money(trade.amount)}</span></span>
              <span className="text-slate-500">Avg <span className="text-slate-200 font-mono">{fmtCents(trade.avg_price)}</span></span>
              <span className="text-slate-500">Shares <span className="text-slate-200 font-mono">{trade.num_shares?.toFixed(2) ?? '-'}</span></span>
              <span className="text-slate-500">Result <span className={`font-semibold ${resultCls}`}>{trade.result}</span></span>
              {trade.profit != null && (
                <span className="text-slate-500">P&L <span className={`font-medium ${pnlCls(trade.profit)}`}>{money(trade.profit)}</span></span>
              )}
              <span className="text-slate-500">Session <span className="text-slate-300 font-mono">{data.session.direction} {new Date(data.session.session_start * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(data.session.session_end * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-slate-500 text-xs">Loading timeline...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-rose-400 text-xs">{error}</div>
            </div>
          ) : data ? (
            <div>
              {/* Walk prices */}
              {trade.walk_prices && (trade.walk_prices.entry?.length || trade.walk_prices.exit?.length) && (
                <div className="px-6 py-4 border-b border-[#1a1a2a] grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {trade.walk_prices.entry && trade.walk_prices.entry.length > 0 && (
                    <FillTable levels={trade.walk_prices.entry} label="Entry Fill Levels" color="text-emerald-300" />
                  )}
                  {trade.walk_prices.exit && trade.walk_prices.exit.length > 0 && (
                    <FillTable levels={trade.walk_prices.exit} label="Exit Fill Levels" color="text-amber-300" />
                  )}
                </div>
              )}

              {/* Timeline */}
              <div className="px-6 py-3 border-b border-[#1a1a2a] flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">Timeline</span>
                <span className="text-[10px] text-slate-600">{data.timeline.length} event(s)</span>
              </div>

              {data.timeline.length === 0 ? (
                <div className="px-6 py-10 text-center text-slate-600 text-xs">No timeline events</div>
              ) : (
                <div className="divide-y divide-[#111122]">
                  {data.timeline.map((evt, i) => (
                    <div key={i}>
                      <div
                        className="flex items-start gap-3 px-6 py-2.5 hover:bg-white/[.02] cursor-pointer transition-colors"
                        onClick={() => setExpandedEvent(expandedEvent === i ? null : i)}
                      >
                        <div className="text-[10px] text-slate-600 font-mono whitespace-nowrap min-w-[70px] pt-0.5">
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                        </div>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium border whitespace-nowrap ${CATEGORY_BADGE[evt.category] || 'bg-slate-800 text-slate-400 border-slate-700/50'}`}>
                          {evt.category === 'fill_entry' ? 'entry' : evt.category === 'fill_exit' ? 'exit' : evt.category}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-slate-200 font-medium">{evt.action}</span>
                          {evt.details && <span className="text-[11px] text-slate-500 ml-2">{evt.details}</span>}
                        </div>
                        {evt.data != null && (
                          <span className={`text-[10px] text-slate-600 transition-transform ${expandedEvent === i ? 'rotate-90' : ''}`}>&#9654;</span>
                        )}
                      </div>
                      {expandedEvent === i && evt.data != null && (
                        <div className="px-6 pb-2.5">
                          {isPriceSnapshot(evt) ? (
                            <PriceSnapshotBook data={evt.data as Record<string, unknown>} />
                          ) : (
                            <pre className="text-[10px] text-slate-400 bg-[#080814] rounded-lg p-3 overflow-x-auto max-h-40 overflow-y-auto font-mono">
                              {JSON.stringify(evt.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1a1a2a] shrink-0">
          <button onClick={onClose} className="w-full h-9 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-[#1a1a2a] transition-all border border-[#1f1f32]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
