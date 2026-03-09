'use client';

import { useMemo } from 'react';
import { Trade, Bot, BotPnl, BalanceHistoryGrouped } from '@/lib/api';

interface KpiCardsProps {
  trades: Trade[];
  bots: Bot[];
  botPnls?: BotPnl[];
  balanceHistoryGrouped?: BalanceHistoryGrouped[];
}

interface SessionStat {
  bot_name: string;
  session_id: string;
  profit: number;
  trades: number;
  session_result: string | null;
}

function computeSessionStatsFromLedger(groups: BalanceHistoryGrouped[]): SessionStat[] {
  const stats: SessionStat[] = [];
  for (const group of groups) {
    for (const entry of group.bots) {
      if (!entry.session_id) continue;
      stats.push({
        bot_name: entry.bot_name,
        session_id: entry.session_id,
        profit: entry.delta, // profit - fee
        trades: entry.trade_count ?? 0,
        session_result: entry.session_result,
      });
    }
  }
  return stats;
}

function computeSessionStatsFromTrades(trades: Trade[]): SessionStat[] {
  const map = new Map<string, SessionStat>();
  for (const t of trades) {
    if (t.result !== 'WIN' && t.result !== 'LOSS') continue;
    if (!t.session_id) continue;
    const key = `${t.bot_name}::${t.session_id}`;
    let s = map.get(key);
    if (!s) {
      s = { bot_name: t.bot_name, session_id: t.session_id, profit: 0, trades: 0, session_result: null };
      map.set(key, s);
    }
    s.profit += t.profit ?? 0;
    s.trades += 1;
  }
  return [...map.values()];
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

export default function KpiCards({ trades, bots, botPnls = [], balanceHistoryGrouped = [] }: KpiCardsProps) {
  const sessionStats = useMemo(() => {
    if (balanceHistoryGrouped.length > 0) {
      return computeSessionStatsFromLedger(balanceHistoryGrouped);
    }
    return computeSessionStatsFromTrades(trades);
  }, [trades, balanceHistoryGrouped]);

  const pnlMap = useMemo(() => {
    const m = new Map<string, BotPnl>();
    for (const p of botPnls) m.set(p.bot_name, p);
    return m;
  }, [botPnls]);

  const cards = useMemo<CardDef[]>(() => {
    const fmtBal = (v: number) => '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtProfit = (v: number) => (v < 0 ? '-$' : '+$') + Math.abs(v).toFixed(2);
    const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    const result: CardDef[] = [];

    // Filter bots that have at least 1 settled trade
    const activeBots = bots.filter((b) =>
      trades.some((t) => t.bot_name === b.bot_name && (t.result === 'WIN' || t.result === 'LOSS'))
    );

    if (activeBots.length > 0) {
      const getEquity = (b: Bot) => pnlMap.get(b.bot_name)?.current_balance ?? b.balance;
      const byBalance = [...activeBots].sort((a, b) => getEquity(b) - getEquity(a));
      const topWin = byBalance[0];
      const topLoss = byBalance[byBalance.length - 1];
      const topWinEquity = getEquity(topWin);
      const topLossEquity = getEquity(topLoss);
      const topWinRoi = pnlMap.get(topWin.bot_name)?.realized_pnl_pct
        ?? (topWin.initial_balance > 0 ? ((topWinEquity - topWin.initial_balance) / topWin.initial_balance) * 100 : 0);
      const topLossRoi = pnlMap.get(topLoss.bot_name)?.realized_pnl_pct
        ?? (topLoss.initial_balance > 0 ? ((topLossEquity - topLoss.initial_balance) / topLoss.initial_balance) * 100 : 0);

      result.push(
        {
          label: 'Top Balance',
          icon: '\uD83E\uDD47',
          name: topWin.bot_name,
          value: fmtBal(topWinEquity),
          sub: `Init ${fmtBal(topWin.initial_balance)} · ROI ${fmtPct(topWinRoi)}`,
          color: '#34d399',
          bg: '#0a1a14',
          border: '#0d3d2a',
        },
        {
          label: 'Lowest Balance',
          icon: '\uD83E\uDD48',
          name: topLoss.bot_name,
          value: fmtBal(topLossEquity),
          sub: `Init ${fmtBal(topLoss.initial_balance)} · ROI ${fmtPct(topLossRoi)}`,
          color: '#f87171',
          bg: '#1a0a0a',
          border: '#3d0d0d',
        },
      );
    }

    if (sessionStats.length > 0) {
      const byProfit = [...sessionStats].sort((a, b) => b.profit - a.profit);
      const best = byProfit[0];
      const worst = byProfit[byProfit.length - 1];

      result.push(
        {
          label: 'Best Session',
          icon: '\uD83D\uDD25',
          name: best.bot_name,
          value: fmtProfit(best.profit),
          sub: `${best.trades} trade${best.trades > 1 ? 's' : ''} · ${best.session_id}`,
          color: '#38bdf8',
          bg: '#0a141a',
          border: '#0d2a3d',
        },
        {
          label: 'Worst Session',
          icon: '\u2744\uFE0F',
          name: worst.bot_name,
          value: fmtProfit(worst.profit),
          sub: `${worst.trades} trade${worst.trades > 1 ? 's' : ''} · ${worst.session_id}`,
          color: '#fb923c',
          bg: '#1a1208',
          border: '#3d280a',
        },
      );
    }

    return result;
  }, [bots, trades, sessionStats, pnlMap]);

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
