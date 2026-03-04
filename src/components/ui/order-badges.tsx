'use client';

import { Trade } from '@/lib/api';
import { fmtCents } from '@/lib/helpers';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Compute fill metrics from trade data */
function fillMetrics(t: Trade) {
  const originalBudget = t.original_amount ?? t.amount;
  const filledCost =
    t.avg_price != null && t.num_shares != null
      ? t.avg_price * t.num_shares
      : 0;
  const remainingBudget = Math.max(0, originalBudget - filledCost);
  const fillPct = originalBudget > 0 ? Math.min(100, (filledCost / originalBudget) * 100) : 0;
  const filledQty = t.filled_quantity ?? t.num_shares ?? 0;
  const requestedQty = t.requested_quantity ?? (t.limit_price && t.limit_price > 0 ? originalBudget / t.limit_price : filledQty);
  const unfilledQty = t.unfilled_quantity ?? Math.max(0, requestedQty - filledQty);
  return { originalBudget, filledCost, remainingBudget, fillPct, filledQty, requestedQty, unfilledQty };
}

// ── MARKET / LIMIT badge ──────────────────────────────────────────────────

export function OrderTypeBadge({ trade }: { trade: Trade }) {
  const ot = trade.order_type;
  const isLimit = trade.limit_price != null;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {isLimit ? (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          LIMIT {fmtCents(trade.limit_price)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
          MKT
        </span>
      )}
      {/* FAK / FOK badge — show for all MARKET orders */}
      {!isLimit && (
        <span className={`px-1 py-0.5 rounded text-[9px] font-bold border ${
          ot === 'FOK'
            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        }`}>
          {ot || 'FAK'}
        </span>
      )}
      {/* Ceiling price badge */}
      {trade.ceiling_price != null && (
        <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          ceil {fmtCents(trade.ceiling_price)}
        </span>
      )}
    </span>
  );
}

// ── TP / SL bracket chips ─────────────────────────────────────────────────

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

// ── Exit trigger badge ────────────────────────────────────────────────────

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

// ── Fill progress bar (reusable) ──────────────────────────────────────────

function FillProgressBar({ trade }: { trade: Trade }) {
  const { fillPct, filledQty, requestedQty, remainingBudget, originalBudget } = fillMetrics(trade);
  if (originalBudget <= 0) return null;

  const barColor = fillPct >= 100 ? '#34d399' : fillPct > 0 ? '#f59e0b' : '#64748b';

  return (
    <div className="mt-0.5 min-w-[110px]">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2a' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ background: barColor, width: `${Math.max(1, fillPct).toFixed(1)}%` }}
          />
        </div>
        <span className="text-[9px] font-mono font-semibold text-slate-400 shrink-0 w-8 text-right">
          {fillPct.toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[8px] text-slate-600">
          {filledQty > 0 ? `${filledQty.toFixed(2)}` : '0'}/{requestedQty > 0 ? requestedQty.toFixed(2) : '—'} shares
        </span>
        {remainingBudget > 0 && (
          <span className="text-[8px] text-amber-500/70">${remainingBudget.toFixed(2)} queued</span>
        )}
      </div>
    </div>
  );
}

// ── Order status badge ────────────────────────────────────────────────────

/**
 * Order status badge — shows lifecycle state:
 * PENDING (no fill) → PARTIAL → FILLED → BRACKET ACTIVE → TP/SL FIRED
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
    const isFilled = trade.me_order_status === 'FILLED' || trade.limit_price == null;
    const isPartial = trade.me_order_status === 'PARTIAL';
    const isCanceled = trade.me_order_status === 'CANCELED';

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
          <>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              ◑ Partial Fill
            </span>
            <FillProgressBar trade={trade} />
          </>
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

  // PARTIAL fill — no bracket but has some fills and remainder queued
  if (trade.result === 'PENDING' && trade.me_order_status === 'PARTIAL' && trade.avg_price != null) {
    return (
      <div className="inline-flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1 h-1 rounded-full bg-amber-400 live-dot" />
          Partial Fill
        </span>
        <FillProgressBar trade={trade} />
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
      <div className="inline-flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1 h-1 rounded-full bg-amber-400 live-dot" />
          Pending Fill
          {trade.ttl != null && <span className="text-[9px] text-amber-500/60 ml-0.5">TTL {trade.ttl}s</span>}
        </span>
        {trade.limit_price != null && (
          <span className="text-[8px] text-slate-600 pl-1">
            waiting for ask ≤ {fmtCents(trade.limit_price)}
          </span>
        )}
      </div>
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
