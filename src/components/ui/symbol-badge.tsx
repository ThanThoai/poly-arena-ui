'use client';

const STYLES: Record<string, string> = {
  BTC: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  ETH: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  SOL: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  XRP: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
};

export default function SymbolBadge({ symbol }: { symbol: string }) {
  const cls = STYLES[symbol] || 'text-slate-400 bg-slate-400/10 border-slate-400/20';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{symbol}</span>;
}
