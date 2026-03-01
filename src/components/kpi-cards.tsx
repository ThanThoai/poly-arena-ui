'use client';

import { useMemo } from 'react';
import { Trade, Bot } from '@/lib/api';

interface BotStats {
  bot_name: string;
  totalProfit: number;
  totalAmount: number;
  wins: number;
  losses: number;
  trades: number;
  roi: number;
  balance: number;
  initialBalance: number;
}

interface KpiCardsProps {
  trades: Trade[];
  bots: Bot[];
}

function computeBotStats(trades: Trade[], bots: Bot[]): BotStats[] {
  const map = new Map<string, BotStats>();

  for (const b of bots) {
    map.set(b.bot_name, {
      bot_name: b.bot_name,
      totalProfit: 0,
      totalAmount: 0,
      wins: 0,
      losses: 0,
      trades: 0,
      roi: 0,
      balance: b.balance,
      initialBalance: b.initial_balance,
    });
  }

  for (const t of trades) {
    if (t.result !== 'WIN' && t.result !== 'LOSS') continue;
    let s = map.get(t.bot_name);
    if (!s) {
      s = {
        bot_name: t.bot_name,
        totalProfit: 0,
        totalAmount: 0,
        wins: 0,
        losses: 0,
        trades: 0,
        roi: 0,
        balance: 0,
        initialBalance: 0,
      };
      map.set(t.bot_name, s);
    }
    s.totalProfit += t.profit ?? 0;
    s.totalAmount += t.amount;
    s.trades += 1;
    if (t.result === 'WIN') s.wins += 1;
    else s.losses += 1;
  }

  const result: BotStats[] = [];
  for (const s of map.values()) {
    s.roi = s.totalAmount > 0 ? (s.totalProfit / s.totalAmount) * 100 : 0;
    if (s.trades > 0) result.push(s);
  }
  return result;
}

interface UserStats {
  name: string;
  totalProfit: number;
  totalAmount: number;
  wins: number;
  losses: number;
  trades: number;
  roi: number;
}

function computeUserStats(trades: Trade[], bots: Bot[]): UserStats[] {
  const botOwner = new Map<string, string>();
  for (const b of bots) {
    if (b.owner_name) botOwner.set(b.bot_name, b.owner_name);
  }

  const map = new Map<string, UserStats>();
  for (const t of trades) {
    if (t.result !== 'WIN' && t.result !== 'LOSS') continue;
    const owner = botOwner.get(t.bot_name);
    if (!owner) continue;
    let s = map.get(owner);
    if (!s) {
      s = { name: owner, totalProfit: 0, totalAmount: 0, wins: 0, losses: 0, trades: 0, roi: 0 };
      map.set(owner, s);
    }
    s.totalProfit += t.profit ?? 0;
    s.totalAmount += t.amount;
    s.trades += 1;
    if (t.result === 'WIN') s.wins += 1;
    else s.losses += 1;
  }

  const result: UserStats[] = [];
  for (const s of map.values()) {
    s.roi = s.totalAmount > 0 ? (s.totalProfit / s.totalAmount) * 100 : 0;
    if (s.trades > 0) result.push(s);
  }
  return result;
}

interface CardDef {
  label: string;
  icon: string;
  name: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
  border: string;
}

export default function KpiCards({ trades, bots }: KpiCardsProps) {
  const botStats = useMemo(() => computeBotStats(trades, bots), [trades, bots]);
  const userStats = useMemo(() => computeUserStats(trades, bots), [trades, bots]);

  const cards = useMemo<CardDef[]>(() => {
    const fmt = (v: number) => (v < 0 ? '-$' : '+$') + Math.abs(v).toFixed(2);
    const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    const result: CardDef[] = [];

    if (botStats.length > 0) {
      const byProfit = [...botStats].sort((a, b) => b.totalProfit - a.totalProfit);
      const byLoss = [...botStats].sort((a, b) => a.totalProfit - b.totalProfit);
      const topWin = byProfit[0];
      const topLoss = byLoss[0];

      result.push(
        {
          label: 'Bot Top Win',
          icon: '\uD83E\uDD16',
          name: topWin.bot_name,
          value: fmt(topWin.totalProfit),
          sub: `ROI ${fmtPct(topWin.roi)} · ${topWin.wins}W/${topWin.losses}L`,
          color: '#34d399',
          bg: '#0a1a14',
          border: '#0d3d2a',
        },
        {
          label: 'Bot Top Loss',
          icon: '\uD83E\uDD16',
          name: topLoss.bot_name,
          value: fmt(topLoss.totalProfit),
          sub: `ROI ${fmtPct(topLoss.roi)} · ${topLoss.wins}W/${topLoss.losses}L`,
          color: '#f87171',
          bg: '#1a0a0a',
          border: '#3d0d0d',
        },
      );
    }

    if (userStats.length > 0) {
      const byProfit = [...userStats].sort((a, b) => b.totalProfit - a.totalProfit);
      const byLoss = [...userStats].sort((a, b) => a.totalProfit - b.totalProfit);
      const topWin = byProfit[0];
      const topLoss = byLoss[0];

      result.push(
        {
          label: 'User Top Win',
          icon: '\uD83D\uDC64',
          name: topWin.name,
          value: fmt(topWin.totalProfit),
          sub: `ROI ${fmtPct(topWin.roi)} · ${topWin.wins}W/${topWin.losses}L`,
          color: '#38bdf8',
          bg: '#0a141a',
          border: '#0d2a3d',
        },
        {
          label: 'User Top Loss',
          icon: '\uD83D\uDC64',
          name: topLoss.name,
          value: fmt(topLoss.totalProfit),
          sub: `ROI ${fmtPct(topLoss.roi)} · ${topLoss.wins}W/${topLoss.losses}L`,
          color: '#fb923c',
          bg: '#1a1208',
          border: '#3d280a',
        },
      );
    }

    return result;
  }, [botStats, userStats]);

  if (cards.length === 0) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#0e0e1a' }}>
                <span className="text-sm opacity-30">{'\uD83C\uDFC6'}</span>
              </div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest">Leaderboard</p>
            </div>
            <p className="text-sm text-slate-600">No data yet</p>
            <p className="text-[10px] text-slate-700 mt-1">Waiting for settled trades</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="card p-4 transition-all hover:scale-[1.02]"
          style={{ borderColor: c.border, background: c.bg }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-base"
              style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${c.border}` }}
            >
              {c.icon}
            </div>
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: c.color }}>
              {c.label}
            </p>
          </div>
          <p className="text-lg font-bold font-mono truncate" style={{ color: c.color }}>
            {c.value}
          </p>
          <p className="text-sm font-semibold text-slate-200 truncate mt-0.5" title={c.name}>
            {c.name}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
            {c.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
