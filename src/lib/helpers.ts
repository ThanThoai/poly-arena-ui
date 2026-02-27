export const BOT_PALETTE = [
  '#7b9fff', '#34d399', '#f87171', '#fbbf24',
  '#a78bfa', '#fb923c', '#38bdf8', '#e879f9',
  '#4ade80', '#f472b6', '#facc15', '#67e8f9',
];

export const BALANCE_TF_MS: Record<string, number> = {
  M5: 5 * 60 * 1000,
  M15: 15 * 60 * 1000,
  H1: 60 * 60 * 1000,
};

export const TF_WINDOW: Record<string, number> = {
  M5: 6 * 60 * 60 * 1000,
  M15: 24 * 60 * 60 * 1000,
  H1: 7 * 24 * 60 * 60 * 1000,
};

export function compact(v: number): string {
  const a = Math.abs(v);
  return a >= 1e6
    ? (v / 1e6).toFixed(2) + 'M'
    : a >= 1e3
      ? (v / 1e3).toFixed(2) + 'K'
      : v.toFixed(2);
}

export function money(n: number | null): string {
  if (n == null) return '\u2014';
  return (n < 0 ? '-$' : '$') + compact(Math.abs(n));
}

export function pnlCls(v: number): string {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-500';
}

export function parseUTC(s: string | null): Date | null {
  if (!s) return null;
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function dtShort(d: string | null): string {
  if (!d) return '\u2014';
  const o = parseUTC(d);
  if (!o) return '\u2014';
  return (
    o.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    o.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export function dtParts(d: string | null): { date: string; time: string } | null {
  if (!d) return null;
  const o = parseUTC(d);
  if (!o) return null;
  return {
    date: o.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    time: o.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

export function dtMs(d: string | null): string {
  if (!d) return '\u2014';
  const o = parseUTC(d);
  if (!o) return '\u2014';
  const hh = String(o.getHours()).padStart(2, '0');
  const mm = String(o.getMinutes()).padStart(2, '0');
  const ss = String(o.getSeconds()).padStart(2, '0');
  const cs = String(Math.floor(o.getMilliseconds() / 10)).padStart(2, '0');
  return `${hh}:${mm}:${ss}.${cs}`;
}

export function dtMsFull(d: string | null): { date: string; time: string } | null {
  if (!d) return null;
  const o = parseUTC(d);
  if (!o) return null;
  return {
    date: o.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    time: dtMs(d),
  };
}

export function fmtDiff(diff: number): string {
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtCents(v: number | null): string {
  return v != null ? Math.round(Number(v) * 100) + '\u00A2' : '\u2014';
}

export function computeTopStreaks(trades: { bot_name: string; result: string | null; created_at: string | null }[]) {
  const groups: Record<string, typeof trades> = {};
  trades.forEach((t) => {
    if (t.result === 'PENDING') return;
    (groups[t.bot_name] = groups[t.bot_name] || []).push(t);
  });
  let topWinStreak = { count: 0, bot: '' };
  let topLoseStreak = { count: 0, bot: '' };
  for (const [bot, botTrades] of Object.entries(groups)) {
    const sorted = [...botTrades].sort(
      (a, b) => (parseUTC(a.created_at)?.getTime() ?? 0) - (parseUTC(b.created_at)?.getTime() ?? 0),
    );
    let wRun = 0,
      lRun = 0;
    for (const t of sorted) {
      if (t.result === 'WIN') {
        wRun++;
        lRun = 0;
        if (wRun > topWinStreak.count) topWinStreak = { count: wRun, bot };
      } else {
        lRun++;
        wRun = 0;
        if (lRun > topLoseStreak.count) topLoseStreak = { count: lRun, bot };
      }
    }
  }
  return { topWinStreak, topLoseStreak };
}
