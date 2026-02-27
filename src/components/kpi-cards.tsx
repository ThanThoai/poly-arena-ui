'use client';

import { Trade, Bot } from '@/lib/api';
import { money, computeTopStreaks } from '@/lib/helpers';

interface KpiCardsProps {
  trades: Trade[];
  bots: Bot[];
}

export default function KpiCards({ trades, bots }: KpiCardsProps) {
  const settled = trades.filter((t) => t.result !== 'PENDING' && t.profit != null);
  const botMap: Record<string, { name: string; balance: number; initial: number }> = {};
  bots.forEach((b) => {
    botMap[b.bot_name] = { name: b.bot_name, balance: b.initial_balance, initial: b.initial_balance };
  });
  settled.forEach((t) => {
    if (botMap[t.bot_name]) botMap[t.bot_name].balance += t.profit!;
  });

  const botList = Object.values(botMap);
  let topWinVal = '\u2014', topWinMeta = 'No data';
  let topLossVal = '\u2014', topLossMeta = 'No data';

  if (botList.length) {
    const withPnl = botList.map((b) => ({ ...b, pnl: b.balance - b.initial }));
    const topWin = withPnl.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    topWinVal = money(topWin.pnl);
    topWinMeta = `${topWin.name} \u00B7 $${topWin.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const topLoss = withPnl.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    topLossVal = money(topLoss.pnl);
    topLossMeta = `${topLoss.name} \u00B7 $${topLoss.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  const { topWinStreak, topLoseStreak } = computeTopStreaks(trades);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Top Win */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#052016' }}>
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h14M5 3a2 2 0 00-2 2v3a7 7 0 0014 0V5a2 2 0 00-2-2M5 3H3m18 0h-2M9 17v2m6-2v2m-6 2h6" />
            </svg>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Top Win</p>
        </div>
        <p className="text-2xl font-bold text-emerald-400">{topWinVal}</p>
        <p className="text-[11px] text-slate-600 mt-1.5 truncate">{topWinMeta}</p>
      </div>

      {/* Top Loss */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#200508' }}>
            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Top Loss</p>
        </div>
        <p className="text-2xl font-bold text-rose-400">{topLossVal}</p>
        <p className="text-[11px] text-slate-600 mt-1.5 truncate">{topLossMeta}</p>
      </div>

      {/* Win Streak */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#052016' }}>
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Win Streak</p>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-bold text-emerald-400">{topWinStreak.count || '\u2014'}</p>
          {topWinStreak.count > 0 && <p className="text-[11px] text-emerald-700 mb-0.5">wins</p>}
        </div>
        <p className="text-[11px] text-slate-600 mt-1.5 truncate">{topWinStreak.count ? topWinStreak.bot : 'No data'}</p>
      </div>

      {/* Lose Streak */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#200508' }}>
            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Lose Streak</p>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-bold text-rose-400">{topLoseStreak.count || '\u2014'}</p>
          {topLoseStreak.count > 0 && <p className="text-[11px] text-rose-900 mb-0.5">losses</p>}
        </div>
        <p className="text-[11px] text-slate-600 mt-1.5 truncate">{topLoseStreak.count ? topLoseStreak.bot : 'No data'}</p>
      </div>
    </div>
  );
}
