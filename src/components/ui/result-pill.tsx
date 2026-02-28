'use client';

import type { Trade } from '@/lib/api';

const STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  WIN: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  LOSS: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  CANCELLED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  EXPIRED: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

/** Determine display result — distinguishes EXPIRED (TTL timeout) from CANCELLED */
export function displayResult(trade: Trade): string {
  if (trade.result === 'CANCELLED' && trade.ttl != null) {
    return 'EXPIRED';
  }
  return trade.result || 'PENDING';
}

export default function ResultPill({ result, trade }: { result: string; trade?: Trade }) {
  const display = trade ? displayResult(trade) : result;
  const cls = STYLES[display] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] border ${cls}`}>{display}</span>;
}
