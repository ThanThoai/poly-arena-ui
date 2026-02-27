'use client';

const STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  WIN: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  LOSS: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  CANCELLED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function ResultPill({ result }: { result: string }) {
  const cls = STYLES[result] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] border ${cls}`}>{result}</span>;
}
