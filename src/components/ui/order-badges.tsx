'use client';

import { Trade } from '@/lib/api';
import { fmtCents } from '@/lib/helpers';

/** MARKET / LIMIT badge */
export function OrderTypeBadge({ trade }: { trade: Trade }) {
  if (trade.limit_price != null) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        LIMIT {fmtCents(trade.limit_price)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
      MKT
    </span>
  );
}

/** TP / SL bracket chips — shown when tp_price or sl_price exist */
export function BracketBadges({ trade }: { trade: Trade }) {
  if (trade.tp_price == null && trade.sl_price == null) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {trade.tp_price != null && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          TP {fmtCents(trade.tp_price)}
        </span>
      )}
      {trade.sl_price != null && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          SL {fmtCents(trade.sl_price)}
        </span>
      )}
    </span>
  );
}

/** Exit trigger badge — TP fired / SL fired */
export function ExitTriggerBadge({ trade }: { trade: Trade }) {
  if (!trade.exit_trigger) return null;
  const isTP = trade.exit_trigger === 'TP';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
      isTP
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    }`}>
      {isTP ? '\u25B2' : '\u25BC'} {trade.exit_trigger} @ {fmtCents(trade.exit_price)}
    </span>
  );
}

/**
 * Order status badge — shows lifecycle state:
 * PENDING (no fill) → FILLED (has avg_price) → BRACKET ACTIVE (has tp/sl) → TP/SL FIRED (exit_trigger)
 */
export function OrderStatusBadge({ trade }: { trade: Trade }) {
  // Exit triggered
  if (trade.exit_trigger) {
    const isTP = trade.exit_trigger === 'TP';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
        isTP
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
      }`}>
        <span className="w-1 h-1 rounded-full" style={{ background: isTP ? '#34d399' : '#f87171' }} />
        {trade.exit_trigger} Triggered
      </span>
    );
  }

  // Has bracket, waiting for TP/SL
  if (trade.result === 'PENDING' && (trade.tp_price != null || trade.sl_price != null) && trade.avg_price != null) {
    // Market orders fill immediately; limit orders track fill status via me_order_status
    const isFilled = trade.me_order_status === 'FILLED' || trade.limit_price == null;
    const isPartial = trade.me_order_status === 'PARTIAL';
    const isCanceled = trade.me_order_status === 'CANCELED';

    const filledCost = trade.avg_price != null && trade.num_shares != null
      ? trade.avg_price * trade.num_shares
      : 0;
    const unfilledAmount = Math.max(0, trade.amount - filledCost);

    return (
      <div className="inline-flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
          <span className="w-1 h-1 rounded-full bg-violet-400 live-dot" />
          Bracket Active
        </span>
        {isFilled && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ✓ Filled · {trade.num_shares != null ? Number(trade.num_shares).toFixed(2) : '—'} shares
          </span>
        )}
        {isPartial && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            ◑ Partial · {trade.num_shares != null ? Number(trade.num_shares).toFixed(2) : '—'} shares · ${unfilledAmount.toFixed(2)} unfilled
          </span>
        )}
        {isCanceled && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-500/10 text-orange-400 border border-orange-500/20">
            ⊘ Expired · {trade.num_shares != null ? Number(trade.num_shares).toFixed(2) : '0'} shares filled
          </span>
        )}
        {!isFilled && !isPartial && !isCanceled && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            ⏳ Pending fill
          </span>
        )}
      </div>
    );
  }

  // Filled (has avg_price) but no bracket
  if (trade.result === 'PENDING' && trade.avg_price != null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <span className="w-1 h-1 rounded-full bg-sky-400 live-dot" />
        Filled
      </span>
    );
  }

  // PENDING, waiting for fill (limit order not yet matched)
  if (trade.result === 'PENDING' && trade.avg_price == null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span className="w-1 h-1 rounded-full bg-amber-400 live-dot" />
        Pending Fill
        {trade.ttl != null && <span className="text-[9px] text-amber-500/60 ml-0.5">TTL {trade.ttl}s</span>}
      </span>
    );
  }

  // Expired (TTL timeout without fill)
  if (trade.result === 'CANCELLED' && trade.ttl != null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
        <span className="w-1 h-1 rounded-full bg-orange-400" />
        Expired
        <span className="text-[9px] text-orange-500/60 ml-0.5">TTL {trade.ttl}s</span>
      </span>
    );
  }

  // Cancelled (other reasons)
  if (trade.result === 'CANCELLED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
        <span className="w-1 h-1 rounded-full bg-slate-400" />
        Cancelled
      </span>
    );
  }

  // Settled
  return null;
}
