'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { ChartOptions, Plugin } from 'chart.js';
import { Bot, BalanceHistory, UserBalanceHistory, Trade } from '@/lib/api';
import { BOT_PALETTE, BALANCE_TF_MS, TF_WINDOW, compact, parseUTC, pnlCls } from '@/lib/helpers';
import type { BalanceChartSettings } from '@/lib/settings-types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BalanceChartProps {
  bots: Bot[];
  balanceHistory: BalanceHistory[];
  userBalanceHistory: UserBalanceHistory[];
  trades: Trade[];
  onBotFilterChange?: (selected: Set<string>) => void;
  initialSettings?: BalanceChartSettings;
  onSettingsChange?: (s: BalanceChartSettings) => void;
}

/* ── Aggregate user data ── */
interface UserAgg {
  name: string;
  botNames: string[];
  totalBalance: number;    // sum(bot.balance) + available
  totalInit: number;       // user.initial_balance or sum(bot.initial_balance)
  realizedPnl: number;     // sum(profit) for settled orders
  pendingAmount: number;   // sum(amount) for PENDING orders (locked capital)
  pnl: number;             // realized only
  pnlPct: number;          // realized only
}

const endLabelPlugin: Plugin<'line'> = {
  id: 'endLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const LINE_H = 28;

    const labels: { x: number; y: number; label: string; val: string; pct: string; pctColor: string; color: string }[] = [];
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.data || !ds.data.length) return;
      if ((ds as any).borderDash) return;
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      const last = meta.data[meta.data.length - 1];
      if (!last) return;
      const raw = ds.data[ds.data.length - 1] as { y: number };
      const val = raw?.y ?? 0;
      const init = (ds as any).initBalance || 0;
      const realPnl = (ds as any).realizedPnl;
      // Use realized P&L if available, otherwise fall back to val-init
      const pctVal = realPnl !== undefined && init > 0
        ? (realPnl / init) * 100
        : init > 0 ? ((val - init) / init) * 100 : 0;
      const pctSign = pctVal >= 0 ? '+' : '';
      labels.push({
        x: last.x + 8,
        y: last.y,
        label: ds.label || '',
        val: '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
        pct: `${pctSign}${pctVal.toFixed(1)}%`,
        pctColor: pctVal >= 0 ? '#34d399' : '#fb7185',
        color: ds.borderColor as string,
      });
    });

    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) {
      const gap = labels[i].y - labels[i - 1].y;
      if (gap < LINE_H) {
        const push = (LINE_H - gap) / 2;
        labels[i - 1].y -= push;
        labels[i].y += push;
      }
    }

    for (const l of labels) {
      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = l.color;
      ctx.font = '10px sans-serif';
      ctx.fillText(l.label, l.x, l.y - 7);
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(l.val, l.x, l.y + 5);
      const valWidth = ctx.measureText(l.val).width;
      ctx.font = '9px sans-serif';
      ctx.fillStyle = l.pctColor;
      ctx.fillText(` ${l.pct}`, l.x + valWidth, l.y + 5);
      ctx.restore();
    }
  },
};

const gradientFillPlugin: Plugin<'line'> = {
  id: 'gradientFill',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    chart.data.datasets.forEach((ds) => {
      if ((ds as any).borderDash) return;
      const color = ds.borderColor as string;
      if (!color) return;
      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, color + '33');
      gradient.addColorStop(1, color + '00');
      ds.backgroundColor = gradient;
      ds.fill = true;
    });
  },
};

const crosshairPlugin: Plugin<'line'> = {
  id: 'crosshair',
  afterEvent(chart, args) {
    const event = args.event;
    if (event.type === 'mouseout') {
      (chart as any)._crosshairX = undefined;
      (chart as any)._crosshairY = undefined;
      chart.draw();
      return;
    }
    if (event.type === 'mousemove' && event.x != null && event.y != null) {
      const { chartArea } = chart;
      if (!chartArea) return;
      if (event.x >= chartArea.left && event.x <= chartArea.right &&
          event.y >= chartArea.top && event.y <= chartArea.bottom) {
        (chart as any)._crosshairX = event.x;
        (chart as any)._crosshairY = event.y;
      } else {
        (chart as any)._crosshairX = undefined;
        (chart as any)._crosshairY = undefined;
      }
    }
  },
  afterDraw(chart) {
    const cx = (chart as any)._crosshairX as number | undefined;
    const cy = (chart as any)._crosshairY as number | undefined;
    if (cx == null || cy == null) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(cx, chartArea.top);
    ctx.lineTo(cx, chartArea.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(chartArea.left, cy);
    ctx.lineTo(chartArea.right, cy);
    ctx.stroke();

    ctx.restore();
  },
};

export default function BalanceChart({ bots, balanceHistory, userBalanceHistory, trades, onBotFilterChange, initialSettings, onSettingsChange }: BalanceChartProps) {
  const [balanceTf, setBalanceTf] = useState(initialSettings?.timeframe ?? 'M5');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<Set<string>>(new Set());

  // Pre-compute per-bot P&L breakdown from trades
  const botPnlMap = useMemo(() => {
    const m = new Map<string, { realizedPnl: number; pendingAmount: number }>();
    for (const t of trades) {
      let entry = m.get(t.bot_name);
      if (!entry) { entry = { realizedPnl: 0, pendingAmount: 0 }; m.set(t.bot_name, entry); }
      if (t.result === 'WIN' || t.result === 'LOSS') {
        entry.realizedPnl += t.profit ?? 0;
      } else if (t.result === 'PENDING' || t.result === null) {
        entry.pendingAmount += t.amount;
      }
      // CANCELLED with profit=0 doesn't affect realized PnL
    }
    return m;
  }, [trades]);

  // Aggregate users from bots
  const users = useMemo<UserAgg[]>(() => {
    const map = new Map<string, {
      botNames: string[];
      totalBotBalance: number;
      totalBotInit: number;
      userInitBalance: number;
      realizedPnl: number;
      pendingAmount: number;
    }>();
    for (const b of bots) {
      const owner = b.owner_name || b.bot_name;
      let u = map.get(owner);
      if (!u) {
        u = { botNames: [], totalBotBalance: 0, totalBotInit: 0, userInitBalance: 0, realizedPnl: 0, pendingAmount: 0 };
        map.set(owner, u);
      }
      u.botNames.push(b.bot_name);
      u.totalBotBalance += b.balance;
      u.totalBotInit += b.initial_balance;
      if (b.user_initial_balance != null && b.user_initial_balance > 0) {
        u.userInitBalance = b.user_initial_balance;
      }
      const bp = botPnlMap.get(b.bot_name);
      if (bp) {
        u.realizedPnl += bp.realizedPnl;
        u.pendingAmount += bp.pendingAmount;
      }
    }
    const result: UserAgg[] = [];
    for (const [name, u] of map) {
      const hasUserPool = u.userInitBalance > 0;
      const available = hasUserPool ? Math.max(0, u.userInitBalance - u.totalBotInit) : 0;
      const totalBalance = u.totalBotBalance + available;
      const totalInit = hasUserPool ? u.userInitBalance : u.totalBotInit;
      const realizedPnl = u.realizedPnl;
      const pendingAmount = u.pendingAmount;
      // PnL % based on realized only
      const pnl = realizedPnl;
      const pnlPct = totalInit > 0 ? (pnl / totalInit) * 100 : 0;
      result.push({ name, botNames: u.botNames, totalBalance, totalInit, realizedPnl, pendingAmount, pnl, pnlPct });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [bots, botPnlMap]);

  const userNames = useMemo(() => users.map((u) => u.name), [users]);
  const visibleUsers = userFilter.size > 0 ? userNames.filter((u) => userFilter.has(u)) : userNames;

  // Bots of the selected user (for detail panel)
  const selectedUserBots = useMemo(() => {
    if (!selectedUser) return [];
    const u = users.find((x) => x.name === selectedUser);
    if (!u) return [];
    return u.botNames.map((bn) => {
      const b = bots.find((x) => x.bot_name === bn);
      if (!b) return null;
      const bp = botPnlMap.get(bn);
      const realizedPnl = bp?.realizedPnl ?? 0;
      const pendingAmt = bp?.pendingAmount ?? 0;
      const realizedPnlPct = b.initial_balance > 0 ? (realizedPnl / b.initial_balance) * 100 : 0;
      // Count trades
      const botTrades = trades.filter((t) => t.bot_name === bn && (t.result === 'WIN' || t.result === 'LOSS'));
      const pendingTrades = trades.filter((t) => t.bot_name === bn && (t.result === 'PENDING' || t.result === null));
      const wins = botTrades.filter((t) => t.result === 'WIN').length;
      const losses = botTrades.filter((t) => t.result === 'LOSS').length;
      return {
        name: bn, balance: b.balance, init: b.initial_balance,
        realizedPnl, realizedPnlPct, pendingAmt,
        wins, losses, total: botTrades.length, pendingCount: pendingTrades.length,
      };
    }).filter(Boolean) as {
      name: string; balance: number; init: number;
      realizedPnl: number; realizedPnlPct: number; pendingAmt: number;
      wins: number; losses: number; total: number; pendingCount: number;
    }[];
  }, [selectedUser, users, bots, botPnlMap, trades]);

  const handleUserClick = (name: string) => {
    setSelectedUser(selectedUser === name ? null : name);
  };

  const handleUserFilter = (name: string | null) => {
    if (name === null) {
      setUserFilter(new Set());
      onBotFilterChange?.(new Set());
    } else {
      const newFilter = new Set(userFilter);
      if (newFilter.has(name)) newFilter.delete(name);
      else newFilter.add(name);
      setUserFilter(newFilter.size === 0 ? new Set() : newFilter);
      // Propagate bot filter: all bots of visible users
      const allVisibleBots = new Set<string>();
      const activeUsers = newFilter.size > 0 ? newFilter : new Set(userNames);
      for (const u of users) {
        if (activeUsers.has(u.name)) {
          for (const bn of u.botNames) allVisibleBots.add(bn);
        }
      }
      onBotFilterChange?.(newFilter.size > 0 ? allVisibleBots : new Set());
    }
    onSettingsChange?.({ timeframe: balanceTf, selectedBots: [] });
  };

  const handleTfChange = (tf: string) => {
    setBalanceTf(tf);
    onSettingsChange?.({ timeframe: tf, selectedBots: [...userFilter] });
  };

  const intervalMs = BALANCE_TF_MS[balanceTf] ?? BALANCE_TF_MS.H1;
  const tEnd = Date.now();
  const windowStart = tEnd - (TF_WINDOW[balanceTf] ?? TF_WINDOW.H1);

  // Build realized P&L timeline per user from settled trades
  // Only trades with result WIN/LOSS/CANCELLED count — PENDING (open positions) are excluded
  const userRealizedTimeline = useMemo(() => {
    // Map bot_name → owner_name
    const botOwner = new Map<string, string>();
    for (const b of bots) {
      botOwner.set(b.bot_name, b.owner_name || b.bot_name);
    }

    // Collect settled trades with timestamps, grouped by owner
    const ownerEvents = new Map<string, { ts: number; profit: number }[]>();
    for (const t of trades) {
      if (t.result !== 'WIN' && t.result !== 'LOSS' && t.result !== 'CANCELLED') continue;
      const profit = t.profit ?? 0;
      // Use settlement_at or updated_at as the realized timestamp
      const tsStr = t.settlement_at || t.updated_at;
      if (!tsStr) continue;
      const ts = parseUTC(tsStr)?.getTime();
      if (!ts) continue;

      const owner = botOwner.get(t.bot_name) || t.bot_name;
      let arr = ownerEvents.get(owner);
      if (!arr) { arr = []; ownerEvents.set(owner, arr); }
      arr.push({ ts, profit });
    }

    // Sort each by timestamp
    for (const arr of ownerEvents.values()) arr.sort((a, b) => a.ts - b.ts);
    return ownerEvents;
  }, [trades, bots]);

  // Build user-level datasets based on realized P&L only
  const datasets = useMemo(() => {
    const ds = visibleUsers
      .map((userName, idx) => {
        const color = BOT_PALETTE[idx % BOT_PALETTE.length];
        const user = users.find((u) => u.name === userName);
        if (!user) return null;

        const initBalance = user.totalInit;
        const events = userRealizedTimeline.get(userName) || [];

        // Compute cumulative realized balance over time
        // Each event adds profit to running balance
        let histIdx = 0;
        let cumulativeProfit = 0;

        // Advance past events before window, accumulating their profit
        while (histIdx < events.length && events[histIdx].ts < windowStart) {
          cumulativeProfit += events[histIdx].profit;
          histIdx++;
        }

        const tStart = Math.floor(windowStart / intervalMs) * intervalMs;
        const data: { x: number; y: number }[] = [];

        for (let t = tStart; t <= tEnd; t += intervalMs) {
          while (histIdx < events.length && events[histIdx].ts <= t) {
            cumulativeProfit += events[histIdx].profit;
            histIdx++;
          }
          const balance = initBalance + cumulativeProfit;
          data.push({ x: t, y: +balance.toFixed(2) });
        }

        // Consume remaining events
        while (histIdx < events.length) {
          cumulativeProfit += events[histIdx].profit;
          histIdx++;
        }
        if (data.length && data[data.length - 1].x < tEnd) {
          const balance = initBalance + cumulativeProfit;
          data.push({ x: tEnd, y: +balance.toFixed(2) });
        }

        // If no data points at all, show flat line at initial balance
        if (!data.length) {
          const tStart2 = Math.floor(windowStart / intervalMs) * intervalMs;
          data.push({ x: tStart2, y: initBalance });
          data.push({ x: tEnd, y: initBalance });
        }

        const lastIdx = data.length - 1;
        return {
          label: userName,
          data,
          borderColor: color,
          backgroundColor: color + '33',
          borderWidth: 1.5,
          tension: 0.3,
          fill: false,
          initBalance: user.totalInit,
          realizedPnl: user.realizedPnl,
          pointRadius: data.map((_: any, i: number) => (i === 0 || i === lastIdx) ? 7 : 0),
          pointHoverRadius: 9,
          pointBackgroundColor: color,
          pointBorderColor: '#07070d',
          pointBorderWidth: 1.5,
        };
      })
      .filter(Boolean) as any[];

    // Baseline
    const totalInit = visibleUsers.reduce((s, un) => {
      const u = users.find((x) => x.name === un);
      return s + (u ? u.totalInit : 0);
    }, 0);
    const xMin = ds.reduce((m: number, d: any) => (d.data.length ? Math.min(m, d.data[0].x) : m), Infinity);
    if (xMin !== Infinity && totalInit > 0) {
      const baseVal = visibleUsers.length === 1
        ? (users.find((u) => u.name === visibleUsers[0])?.totalInit ?? totalInit)
        : totalInit;
      ds.push({
        label: `Baseline ($${compact(baseVal)})`,
        data: [{ x: xMin, y: baseVal }, { x: tEnd, y: baseVal }],
        borderColor: '#475569',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        order: 10,
      });
    }

    return ds;
  }, [visibleUsers, users, userRealizedTimeline, intervalMs, windowStart, tEnd]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false as any,
    layout: { padding: { right: 100 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0d0d1f',
        borderColor: '#1f1f32',
        borderWidth: 1,
        cornerRadius: 8,
        titleFont: { size: 11 },
        bodyFont: { size: 11 },
        padding: 10,
        filter: (item) => !(datasets[item.datasetIndex] as any)?.borderDash,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const d = new Date(items[0].parsed.x as number);
            return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          },
          label: (c) => {
            const ds = datasets[c.datasetIndex] as any;
            const val = c.parsed.y ?? 0;
            const init = ds?.initBalance;
            const realPnl = ds?.realizedPnl;
            const formatted = '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (init && init > 0 && realPnl !== undefined) {
              const pctVal = (realPnl / init) * 100;
              const sign = realPnl >= 0 ? '+' : '';
              return ` ${c.dataset.label}: ${formatted} (Realized: ${sign}$${Math.abs(realPnl).toFixed(2)} / ${sign}${pctVal.toFixed(1)}%)`;
            }
            return ` ${c.dataset.label}: ${formatted}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        grid: { color: '#12121e' },
        ticks: {
          maxTicksLimit: 8,
          font: { size: 10 },
          callback: (v) => (v ? new Date(v as number).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''),
        },
      },
      y: {
        grid: { color: '#1e2235' },
        ticks: {
          callback: (v) => '$' + compact(v as number),
          font: { size: 10 },
          maxTicksLimit: 6,
          padding: 4,
        },
        border: { display: false },
      },
    },
  };

  /* ── Summary stats ── */
  const summaryStats = useMemo(() => {
    if (!users.length) return null;
    const visible = visibleUsers
      .map((name) => users.find((u) => u.name === name))
      .filter(Boolean) as UserAgg[];
    if (!visible.length) return null;

    const totalBalance = visible.reduce((s, v) => s + v.totalBalance, 0);
    const totalInit = visible.reduce((s, v) => s + v.totalInit, 0);
    const totalRealized = visible.reduce((s, v) => s + v.realizedPnl, 0);
    const totalPending = visible.reduce((s, v) => s + v.pendingAmount, 0);
    const totalRealizedPct = totalInit > 0 ? (totalRealized / totalInit) * 100 : 0;
    const best = visible.reduce((a, b) => (b.pnlPct > a.pnlPct ? b : a), visible[0]);
    const worst = visible.reduce((a, b) => (b.pnlPct < a.pnlPct ? b : a), visible[0]);

    return { totalBalance, totalInit, totalRealized, totalRealizedPct, totalPending, best, worst, count: visible.length };
  }, [users, visibleUsers]);

  const allSel = userFilter.size === 0;

  return (
    <div className="card p-5">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mr-2">Balance</span>
            {(['M5', 'M15', 'H1'] as const).map((tf) => (
              <button
                key={tf}
                className={`balance-tf-btn ${balanceTf === tf ? 'active' : ''}`}
                onClick={() => handleTfChange(tf)}
              >
                {tf === 'M5' ? '5m' : tf === 'M15' ? '15m' : '1h'}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-600 hidden sm:block">click user to see bots</span>
        </div>

        {/* User chips */}
        <div className="flex flex-wrap gap-1.5 min-h-[22px]">
          <button
            className="pnl-chip"
            style={{
              borderColor: allSel ? '#4d79ff' : '#1f1f32',
              color: allSel ? '#7b9fff' : '#475569',
              background: allSel ? 'rgba(77,121,255,.15)' : 'transparent',
            }}
            onClick={() => handleUserFilter(null)}
          >
            All
          </button>
          {users.map((u, i) => {
            const c = BOT_PALETTE[i % BOT_PALETTE.length];
            const on = allSel || userFilter.has(u.name);
            const isSelected = selectedUser === u.name;
            return (
              <button
                key={u.name}
                className="pnl-chip"
                style={{
                  borderColor: isSelected ? '#fff' : on ? c : '#1f1f32',
                  color: on ? c : '#475569',
                  background: isSelected ? c + '33' : on ? c + '22' : 'transparent',
                  borderWidth: isSelected ? '2px' : undefined,
                }}
                onClick={(e) => {
                  if (e.shiftKey) {
                    handleUserFilter(u.name);
                  } else {
                    handleUserClick(u.name);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleUserFilter(u.name);
                }}
              >
                {u.name}
                <span className="text-[10px] ml-1 opacity-80">
                  {' '}· ${compact(u.totalBalance)}{' '}
                  <span style={{ color: u.realizedPnl >= 0 ? '#34d399' : '#fb7185' }}>
                    ({u.realizedPnl >= 0 ? '+' : ''}{u.pnlPct.toFixed(1)}%)
                  </span>
                  {u.pendingAmount > 0 && (
                    <span className="text-amber-500/70"> [{compact(u.pendingAmount)}]</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary stats row */}
      {summaryStats && (
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="card-sm px-3 py-1.5 text-[11px]">
            <span className="text-slate-500">Total Balance</span>
            <span className="ml-2 font-semibold text-slate-200">${compact(summaryStats.totalBalance)}</span>
          </div>
          <div className="card-sm px-3 py-1.5 text-[11px]">
            <span className="text-slate-500">Realized P&L</span>
            <span className={`ml-2 font-semibold ${pnlCls(summaryStats.totalRealized)}`}>
              {summaryStats.totalRealized >= 0 ? '+' : ''}${compact(Math.abs(summaryStats.totalRealized))}
              {' '}({summaryStats.totalRealizedPct >= 0 ? '+' : ''}{summaryStats.totalRealizedPct.toFixed(1)}%)
            </span>
          </div>
          {summaryStats.totalPending > 0 && (
            <div className="card-sm px-3 py-1.5 text-[11px]">
              <span className="text-slate-500">Pending</span>
              <span className="ml-2 font-semibold text-amber-400">${compact(summaryStats.totalPending)}</span>
            </div>
          )}
          {summaryStats.count > 1 && (
            <>
              <div className="card-sm px-3 py-1.5 text-[11px]">
                <span className="text-slate-500">Best</span>
                <span className="ml-2 font-semibold text-emerald-400">
                  {summaryStats.best.name} ({summaryStats.best.pnlPct >= 0 ? '+' : ''}{summaryStats.best.pnlPct.toFixed(1)}%)
                </span>
              </div>
              <div className="card-sm px-3 py-1.5 text-[11px]">
                <span className="text-slate-500">Worst</span>
                <span className="ml-2 font-semibold text-rose-400">
                  {summaryStats.worst.name} ({summaryStats.worst.pnlPct >= 0 ? '+' : ''}{summaryStats.worst.pnlPct.toFixed(1)}%)
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="h-[480px]">
        <Line data={{ datasets }} options={options} plugins={[gradientFillPlugin, crosshairPlugin, endLabelPlugin]} />
      </div>

      {/* Bot detail panel — shown when a user is clicked */}
      {selectedUser && selectedUserBots.length > 0 && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {selectedUser}&apos;s Bots
            </span>
            <button
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              onClick={() => setSelectedUser(null)}
            >
              close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {selectedUserBots.map((bot) => {
              const pctColor = bot.realizedPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400';
              const pnlSign = bot.realizedPnl >= 0 ? '+' : '';
              const winRate = bot.total > 0 ? ((bot.wins / bot.total) * 100).toFixed(0) : '0';
              return (
                <div
                  key={bot.name}
                  className="card-sm px-3 py-2.5 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-300 truncate">{bot.name}</span>
                    <span className={`text-[11px] font-bold ${pctColor}`}>
                      {pnlSign}{bot.realizedPnlPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>${compact(bot.balance)}</span>
                    <span className={pctColor}>{pnlSign}${compact(Math.abs(bot.realizedPnl))}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-600 mt-0.5">
                    <span>{bot.total} trades</span>
                    <span className="text-emerald-600">{bot.wins}W</span>
                    <span className="text-rose-600">{bot.losses}L</span>
                    <span className="ml-auto text-slate-500">{winRate}% WR</span>
                  </div>
                  {bot.pendingCount > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-amber-500/70 mt-0.5">
                      <span>{bot.pendingCount} pending</span>
                      <span className="ml-auto">${compact(bot.pendingAmt)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
