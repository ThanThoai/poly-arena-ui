'use client';

import { Trade } from '@/lib/api';
import { money, fmtCents, parseUTC, dtMs, dtParts, pnlCls } from '@/lib/helpers';

interface OrderTraceModalProps {
  open: boolean;
  onClose: () => void;
  trade: Trade | null;
}

/* ── Flow step definition ── */

interface FillLevel {
  price: number;
  qty: number;
  cost: number;
}

interface FlowStep {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'skipped' | 'failed';
  icon: 'order' | 'price' | 'match' | 'bracket' | 'tp' | 'sl' | 'settle' | 'cancel';
  timestamp?: string | null;
  details: { label: string; value: string; cls?: string }[];
  fillLevels?: { label: string; levels: FillLevel[] };
}

function buildFlowSteps(t: Trade): FlowStep[] {
  const steps: FlowStep[] = [];
  const isLimit = t.limit_price != null;
  const hasBracket = t.tp_price != null || t.sl_price != null;
  const hasExit = !!t.exit_trigger;
  const isCancelled = t.result === 'CANCELLED';
  const isFilled = t.me_order_status === 'FILLED' || t.me_order_status === 'PARTIAL' || t.avg_price != null;

  // 1. Order Placed
  steps.push({
    id: 'placed',
    label: 'Order Placed',
    status: 'completed',
    icon: 'order',
    timestamp: t.order_received_at,
    details: [
      { label: 'Type', value: isLimit ? `LIMIT @ ${fmtCents(t.limit_price)}` : 'MARKET (IOC)' },
      { label: 'Side', value: `BUY ${t.forecast}` },
      { label: 'Symbol', value: `${t.symbol} / ${t.timeframe}` },
      { label: 'Amount', value: money(t.amount) },
      ...(t.ttl != null ? [{ label: 'TTL', value: `${t.ttl}s` }] : []),
      ...(t.me_order_id ? [{ label: 'ME Order', value: t.me_order_id.slice(0, 8) + '…' }] : []),
    ],
  });

  // 2. Price Fetched / Orderbook Snapshot
  steps.push({
    id: 'price',
    label: 'Price Fetched',
    status: t.ask_fetched_at ? 'completed' : isCancelled ? 'skipped' : 'active',
    icon: 'price',
    timestamp: t.ask_fetched_at,
    details: [
      ...(t.ask_fetched_at && t.order_received_at ? (() => {
        const recv = parseUTC(t.order_received_at)?.getTime();
        const fetched = parseUTC(t.ask_fetched_at)?.getTime();
        if (recv != null && fetched != null) {
          const lat = fetched - recv;
          return [{ label: 'Latency', value: lat < 1000 ? `${lat}ms` : `${(lat / 1000).toFixed(2)}s`, cls: lat < 100 ? 'text-emerald-400' : lat < 500 ? 'text-amber-400' : 'text-rose-400' }];
        }
        return [];
      })() : []),
    ],
  });

  // 3. Order Matched / Filled
  if (!isCancelled || isFilled) {
    steps.push({
      id: 'matched',
      label: isCancelled && !isFilled ? 'Order Expired' : 'Order Matched',
      status: isFilled ? 'completed' : isCancelled ? 'failed' : 'active',
      icon: isCancelled && !isFilled ? 'cancel' : 'match',
      timestamp: t.ask_fetched_at,
      details: [
        { label: 'Avg Price', value: fmtCents(t.avg_price), cls: t.avg_price != null ? 'text-violet-300' : undefined },
        { label: 'Shares', value: t.num_shares != null ? Number(t.num_shares).toFixed(4) : '—', cls: t.num_shares != null ? 'text-sky-300' : undefined },
        { label: 'ME Status', value: t.me_order_status ?? '—' },
        ...(t.num_shares != null && t.avg_price != null
          ? [{ label: 'Win Payout', value: '+$' + ((1 - t.avg_price) * t.num_shares).toFixed(2), cls: 'text-emerald-400' }]
          : []),
      ],
      ...(t.walk_prices?.entry && t.walk_prices.entry.length > 0
        ? { fillLevels: { label: 'Entry Fill Levels', levels: t.walk_prices.entry } }
        : {}),
    });
  } else {
    // Cancelled / Expired without fill
    const isExpired = t.ttl != null;
    steps.push({
      id: 'cancelled',
      label: isExpired ? 'Order Expired' : 'Order Cancelled',
      status: 'failed',
      icon: 'cancel',
      details: [
        { label: 'Reason', value: isExpired ? `TTL expired (${t.ttl}s)` : (t.reason ?? 'No fill') },
        { label: 'ME Status', value: t.me_order_status ?? 'CANCELED' },
      ],
    });
  }

  // 4. Bracket Setup (if TP/SL configured)
  if (hasBracket) {
    steps.push({
      id: 'bracket',
      label: 'Bracket Active',
      status: isFilled ? 'completed' : 'skipped',
      icon: 'bracket',
      details: [
        ...(t.tp_price != null ? [{ label: 'Take Profit', value: fmtCents(t.tp_price), cls: 'text-emerald-400' }] : []),
        ...(t.sl_price != null ? [{ label: 'Stop Loss', value: fmtCents(t.sl_price), cls: 'text-rose-400' }] : []),
        { label: 'Mode', value: t.tp_price != null && t.sl_price != null ? 'OCO (One-Cancels-Other)' : t.tp_price != null ? 'TP only' : 'SL only' },
      ],
    });
  }

  // 5. Bracket Triggered (if exit happened)
  if (hasExit) {
    const isTP = t.exit_trigger === 'TP';
    steps.push({
      id: 'exit',
      label: isTP ? 'Take Profit Triggered' : 'Stop Loss Triggered',
      status: 'completed',
      icon: isTP ? 'tp' : 'sl',
      timestamp: t.exit_at,
      details: [
        { label: 'Trigger', value: t.exit_trigger!, cls: isTP ? 'text-emerald-400' : 'text-rose-400' },
        { label: 'Exit Price', value: fmtCents(t.exit_price) },
        { label: 'Qty Exited', value: t.exit_filled != null ? Number(t.exit_filled).toFixed(4) : '—' },
        ...(t.exit_filled != null && t.exit_price != null && t.avg_price != null
          ? [{ label: 'Exit P&L', value: money((t.exit_price - t.avg_price) * t.exit_filled), cls: pnlCls((t.exit_price - t.avg_price) * t.exit_filled) }]
          : []),
      ],
      ...(t.walk_prices?.exit && t.walk_prices.exit.length > 0
        ? { fillLevels: { label: 'Exit Fill Levels', levels: t.walk_prices.exit } }
        : {}),
    });
  } else if (hasBracket && isFilled && !isCancelled) {
    // Bracket active but not triggered yet
    steps.push({
      id: 'exit-pending',
      label: 'Awaiting Bracket Trigger',
      status: 'active',
      icon: 'bracket',
      details: [
        { label: 'Status', value: 'Monitoring price for TP/SL' },
      ],
    });
  }

  // 6. Settlement
  if (t.result && t.result !== 'PENDING') {
    const isWin = t.result === 'WIN';
    const isLoss = t.result === 'LOSS';
    steps.push({
      id: 'settlement',
      label: isCancelled ? 'Cancelled' : 'Settled',
      status: isCancelled ? 'failed' : 'completed',
      icon: isCancelled ? 'cancel' : 'settle',
      timestamp: t.settlement_at,
      details: [
        { label: 'Result', value: t.result, cls: isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400' },
        ...(t.profit != null ? [{ label: 'Profit', value: money(t.profit), cls: pnlCls(t.profit) }] : []),
        ...(t.price_open != null ? [{ label: 'Price Open', value: Number(t.price_open).toFixed(2) }] : []),
        ...(t.price_close != null ? [{ label: 'Price Close', value: Number(t.price_close).toFixed(2) }] : []),
        ...(t.reason ? [{ label: 'Reason', value: t.reason }] : []),
      ],
    });
  }

  return steps;
}

/* ── Icon component ── */

function StepIcon({ icon, status }: { icon: FlowStep['icon']; status: FlowStep['status'] }) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative z-10';
  const bgMap: Record<FlowStep['status'], string> = {
    completed: 'bg-emerald-500/15 border border-emerald-500/40',
    active: 'bg-amber-500/15 border border-amber-500/40 animate-pulse',
    skipped: 'bg-slate-500/10 border border-slate-700',
    failed: 'bg-rose-500/15 border border-rose-500/40',
  };
  const colorMap: Record<FlowStep['status'], string> = {
    completed: 'text-emerald-400',
    active: 'text-amber-400',
    skipped: 'text-slate-600',
    failed: 'text-rose-400',
  };

  const iconSvg: Record<FlowStep['icon'], string> = {
    order: 'M12 4v16m8-8H4', // plus
    price: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', // chart
    match: 'M5 13l4 4L19 7', // check
    bracket: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', // shield
    tp: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', // trending up
    sl: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6', // trending down
    settle: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', // clipboard check
    cancel: 'M6 18L18 6M6 6l12 12', // X
  };

  return (
    <div className={`${base} ${bgMap[status]}`}>
      <svg className={`w-3.5 h-3.5 ${colorMap[status]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconSvg[icon]} />
      </svg>
    </div>
  );
}

/* ── Fill Levels sub-table ── */

function FillLevelsTable({ levels, label }: { levels: { price: number; qty: number; cost: number }[]; label: string }) {
  if (!levels || levels.length === 0) return null;
  const totalQty = levels.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="mt-2">
      <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">{label}</div>
      <div className="rounded-md overflow-hidden" style={{ background: '#060610', border: '1px solid #12121e' }}>
        {/* Header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_40px_1fr] gap-1 px-2.5 py-1.5 text-[9px] text-slate-600 uppercase tracking-widest border-b border-[#12121e]">
          <span>Price</span><span className="text-right">Qty</span><span className="text-right">Cost</span><span className="text-right">%</span><span></span>
        </div>
        {/* Rows */}
        {levels.map((l, i) => {
          const pct = totalQty > 0 ? (l.qty / totalQty) * 100 : 0;
          const barW = Math.max(4, Math.min(100, pct));
          return (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_40px_1fr] gap-1 px-2.5 py-1 text-[10px] font-mono items-center">
              <span className="text-violet-300">{(l.price * 100).toFixed(0)}¢</span>
              <span className="text-right text-sky-300">{l.qty.toFixed(2)}</span>
              <span className="text-right text-slate-400">${l.cost.toFixed(2)}</span>
              <span className="text-right text-slate-500">{pct.toFixed(0)}%</span>
              <div className="h-2 rounded-sm overflow-hidden" style={{ background: '#1a1a2a' }}>
                <div className="h-full rounded-sm" style={{ width: `${barW}%`, background: 'linear-gradient(90deg, #7c3aed, #a78bfa)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main modal ── */

export default function OrderTraceModal({ open, onClose, trade }: OrderTraceModalProps) {
  if (!open || !trade) return null;

  const steps = buildFlowSteps(trade);

  const created = dtParts(trade.created_at);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-card w-full max-w-lg mx-4 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: '#0e0e1a', border: '1px solid #1f1f32' }}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[#1a1a2a] shrink-0">
          <div className="absolute inset-x-0 top-0 h-16 blur-3xl opacity-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%,#7c3aed,transparent 70%)' }} />
          <button onClick={onClose} className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', boxShadow: '0 0 20px rgba(124,58,237,.3)' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-200">Order Trace</h3>
              <p className="text-[11px] text-slate-500">
                #{trade.id} &middot; {trade.symbol} &middot; {trade.timeframe} &middot;{' '}
                <span className={trade.forecast === 'GREEN' ? 'text-emerald-400' : 'text-rose-400'}>{trade.forecast}</span>
                {created && <span> &middot; {created.date}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Flow diagram */}
        <div className="px-6 py-5 overflow-y-auto flex-1 custom-scrollbar">
          <div className="relative">
            {steps.map((step, idx) => {
              const isLast = idx === steps.length - 1;
              const lineColor =
                step.status === 'completed' ? 'bg-emerald-500/30' :
                step.status === 'failed' ? 'bg-rose-500/30' :
                step.status === 'active' ? 'bg-amber-500/30' :
                'bg-slate-700/30';

              return (
                <div key={step.id} className="flex gap-4">
                  {/* Left: icon + connector line */}
                  <div className="flex flex-col items-center">
                    <StepIcon icon={step.icon} status={step.status} />
                    {!isLast && (
                      <div className={`w-0.5 flex-1 min-h-[16px] ${lineColor}`} />
                    )}
                  </div>

                  {/* Right: content */}
                  <div className={`flex-1 pb-5 ${isLast ? '' : ''}`}>
                    {/* Step header */}
                    <div className="flex items-center gap-2 -mt-0.5">
                      <span className={`text-xs font-semibold ${
                        step.status === 'completed' ? 'text-slate-200' :
                        step.status === 'active' ? 'text-amber-400' :
                        step.status === 'failed' ? 'text-rose-400' :
                        'text-slate-600'
                      }`}>
                        {step.label}
                      </span>
                      {step.timestamp && (
                        <span className="text-[10px] font-mono text-slate-600">{dtMs(step.timestamp)}</span>
                      )}
                    </div>

                    {/* Step details */}
                    {step.details.length > 0 && (
                      <div className="mt-2 rounded-lg p-3 space-y-1.5" style={{ background: '#09090f', border: '1px solid #151520' }}>
                        {step.details.map((d, di) => (
                          <div key={di} className="flex items-center justify-between gap-3">
                            <span className="text-[10px] text-slate-600 uppercase tracking-widest shrink-0">{d.label}</span>
                            <span className={`text-xs font-mono font-medium text-right ${d.cls ?? 'text-slate-300'}`}>{d.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Fill levels sub-table */}
                    {step.fillLevels && (
                      <FillLevelsTable levels={step.fillLevels.levels} label={step.fillLevels.label} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
