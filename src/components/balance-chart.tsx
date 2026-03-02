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
import { Bot, BotPnl, BalanceHistory, UserBalanceHistory, UserPnl, Trade } from '@/lib/api';
import { BOT_PALETTE, BALANCE_TF_MS, TF_WINDOW, compact, parseUTC, pnlCls } from '@/lib/helpers';
import type { BalanceChartSettings } from '@/lib/settings-types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BalanceChartProps {
  bots: Bot[];
  botPnls: BotPnl[];
  balanceHistory: BalanceHistory[];
  userBalanceHistory: UserBalanceHistory[];
  userPnls?: UserPnl[];
  trades: Trade[];
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
  wins: number;
  losses: number;
  winRate: number;
  totalFees: number;
}

type ChartTab = 'users' | 'bots';

const endLabelPlugin: Plugin<'line'> = {
  id: 'endLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const LINE_H = 28;
    const roiMode = (chart as any)._roiMode;

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

      if (roiMode) {
        const sign = val >= 0 ? '+' : '';
        labels.push({
          x: last.x + 8, y: last.y,
          label: ds.label || '',
          val: `${sign}${val.toFixed(2)}%`,
          pct: '',
          pctColor: val >= 0 ? '#34d399' : '#fb7185',
          color: ds.borderColor as string,
        });
      } else {
        const init = (ds as any).initBalance || 0;
        const realPnl = (ds as any).realizedPnl;
        const pctVal = realPnl !== undefined && init > 0
          ? (realPnl / init) * 100
          : init > 0 ? ((val - init) / init) * 100 : 0;
        const pctSign = pctVal >= 0 ? '+' : '';
        labels.push({
          x: last.x + 8, y: last.y,
          label: ds.label || '',
          val: '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
          pct: `${pctSign}${pctVal.toFixed(1)}%`,
          pctColor: pctVal >= 0 ? '#34d399' : '#fb7185',
          color: ds.borderColor as string,
        });
      }
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
      ctx.fillStyle = roiMode ? l.pctColor : l.color;
      ctx.fillText(l.val, l.x, l.y + 5);
      if (l.pct) {
        const valWidth = ctx.measureText(l.val).width;
        ctx.font = '9px sans-serif';
        ctx.fillStyle = l.pctColor;
        ctx.fillText(` ${l.pct}`, l.x + valWidth, l.y + 5);
      }
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

export default function BalanceChart({ bots, botPnls, balanceHistory, userBalanceHistory, userPnls, trades, initialSettings, onSettingsChange }: BalanceChartProps) {
  const [balanceTf, setBalanceTf] = useState(initialSettings?.timeframe ?? 'M5');
  const [chartTab, setChartTab] = useState<ChartTab>('users');
  const [userFilter, setUserFilter] = useState<Set<string>>(new Set());
  const [botFilter, setBotFilter] = useState<Set<string>>(new Set());

  // Build per-bot P&L map from server-provided /bots/pnl data (WIN/LOSS only)
  const botPnlMap = useMemo(() => {
    const m = new Map<string, BotPnl>();
    for (const bp of botPnls) {
      m.set(bp.bot_name, bp);
    }
    return m;
  }, [botPnls]);

  // Build user P&L lookup from server-provided /bots/user-pnl-all
  const userPnlMap = useMemo(() => {
    const m = new Map<string, UserPnl>();
    for (const up of (userPnls ?? [])) {
      m.set(up.username, up);
    }
    return m;
  }, [userPnls]);

  // Aggregate users from bots + server P&L data
  const users = useMemo<UserAgg[]>(() => {
    // If we have userPnls from server, use that as authoritative source
    if (userPnlMap.size > 0) {
      const result: UserAgg[] = [];
      for (const [username, up] of userPnlMap) {
        const botNames = up.bots.map(b => b.bot_name);
        const pendingAmount = trades
          .filter(t => botNames.includes(t.bot_name) && (t.result === 'PENDING' || t.result === null))
          .reduce((s, t) => s + t.amount, 0);
        result.push({
          name: username,
          botNames,
          totalBalance: up.current_balance,
          totalInit: up.initial_balance,
          realizedPnl: up.realized_pnl,
          pendingAmount,
          pnl: up.realized_pnl,
          pnlPct: up.realized_pnl_pct,
          wins: up.wins,
          losses: up.losses,
          winRate: up.win_rate,
          totalFees: up.total_fees ?? 0,
        });
      }
      return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Fallback: compute from bots + botPnls (original logic)
    const map = new Map<string, {
      botNames: string[];
      totalBotBalance: number;
      totalBotInit: number;
      userInitBalance: number;
      realizedPnl: number;
      pendingAmount: number;
      wins: number;
      losses: number;
    }>();
    for (const b of bots) {
      const owner = b.owner_name || b.bot_name;
      let u = map.get(owner);
      if (!u) {
        u = { botNames: [], totalBotBalance: 0, totalBotInit: 0, userInitBalance: 0, realizedPnl: 0, pendingAmount: 0, wins: 0, losses: 0 };
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
        u.realizedPnl += bp.realized_pnl;
        u.wins += bp.wins;
        u.losses += bp.losses;
        const pendingFromTrades = trades
          .filter(t => t.bot_name === b.bot_name && (t.result === 'PENDING' || t.result === null))
          .reduce((s, t) => s + t.amount, 0);
        u.pendingAmount += pendingFromTrades;
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
      const pnl = realizedPnl;
      const pnlPct = totalInit > 0 ? (pnl / totalInit) * 100 : 0;
      const decided = u.wins + u.losses;
      const winRate = decided > 0 ? (u.wins / decided) * 100 : 0;
      result.push({ name, botNames: u.botNames, totalBalance, totalInit, realizedPnl, pendingAmount, pnl, pnlPct, wins: u.wins, losses: u.losses, winRate, totalFees: 0 });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [bots, botPnlMap, userPnlMap, trades]);

  const userNames = useMemo(() => users.map((u) => u.name), [users]);
  const visibleUsers = userFilter.size > 0 ? userNames.filter((u) => userFilter.has(u)) : userNames;

  const handleUserClick = (name: string) => {
    const newFilter = new Set(userFilter);
    if (newFilter.has(name)) newFilter.delete(name);
    else newFilter.add(name);
    setUserFilter(newFilter.size === 0 ? new Set() : newFilter);
    onSettingsChange?.({ timeframe: balanceTf, selectedBots: [] });
  };

  const handleResetFilter = () => {
    setUserFilter(new Set());
    onSettingsChange?.({ timeframe: balanceTf, selectedBots: [] });
  };

  const handleTfChange = (tf: string) => {
    setBalanceTf(tf);
    onSettingsChange?.({ timeframe: tf, selectedBots: [...userFilter] });
  };

  const intervalMs = BALANCE_TF_MS[balanceTf] ?? BALANCE_TF_MS.H1;
  const tEnd = Date.now();
  const windowStart = tEnd - (TF_WINDOW[balanceTf] ?? TF_WINDOW.H1);

  // Build user-level balance timeline from balanceHistory (bot-level absolute balances)
  // This is more accurate than computing from trades because:
  // 1. balanceHistory records contain absolute balances, no accumulation needed
  // 2. Not affected by trade fetch limits (500)
  const userBalanceTimeline = useMemo(() => {
    // Map bot_name → owner_name and collect bots per owner
    const botOwner = new Map<string, string>();
    const ownerBots = new Map<string, Set<string>>();
    const botInitBalance = new Map<string, number>();
    for (const b of bots) {
      const owner = b.owner_name || b.bot_name;
      botOwner.set(b.bot_name, owner);
      botInitBalance.set(b.bot_name, b.initial_balance);
      let s = ownerBots.get(owner);
      if (!s) { s = new Set(); ownerBots.set(owner, s); }
      s.add(b.bot_name);
    }

    // Group balance history events by owner, sorted by time
    // Each event updates one bot's balance; user balance = sum(all bot balances) + available
    const ownerTimeline = new Map<string, { ts: number; balance: number }[]>();

    for (const [ownerName, botNameSet] of ownerBots) {
      // Get all balance history records for this owner's bots
      const events: { ts: number; botName: string; balance: number }[] = [];
      for (const bh of balanceHistory) {
        if (!botNameSet.has(bh.bot_name)) continue;
        const ts = bh.recorded_at ? parseUTC(bh.recorded_at)?.getTime() : null;
        if (!ts) continue;
        events.push({ ts, botName: bh.bot_name, balance: bh.balance });
      }
      events.sort((a, b) => a.ts - b.ts);

      // Compute available pool for this user
      const user = users.find(u => u.name === ownerName);
      const userInitBal = user?.totalInit ?? 0;
      const sumBotInit = Array.from(botNameSet).reduce((s, bn) => s + (botInitBalance.get(bn) ?? 0), 0);
      const hasUserPool = user && user.totalInit > sumBotInit;
      const available = hasUserPool ? Math.max(0, userInitBal - sumBotInit) : 0;

      // Replay events: track latest balance for each bot
      const latestBotBal = new Map<string, number>();
      for (const bn of botNameSet) {
        latestBotBal.set(bn, botInitBalance.get(bn) ?? 0);
      }

      const timeline: { ts: number; balance: number }[] = [];
      for (const ev of events) {
        latestBotBal.set(ev.botName, ev.balance);
        let total = available;
        for (const bal of latestBotBal.values()) total += bal;
        timeline.push({ ts: ev.ts, balance: +total.toFixed(2) });
      }

      ownerTimeline.set(ownerName, timeline);
    }

    return ownerTimeline;
  }, [balanceHistory, bots, users]);

  // Build user-level datasets from balance history
  const datasets = useMemo(() => {
    const ds = visibleUsers
      .map((userName, idx) => {
        const color = BOT_PALETTE[idx % BOT_PALETTE.length];
        const user = users.find((u) => u.name === userName);
        if (!user) return null;

        const initBalance = user.totalInit;
        const timeline = userBalanceTimeline.get(userName) || [];

        // Find the last known balance before window start
        let lastBefore = initBalance;
        let startIdx = 0;
        for (let i = 0; i < timeline.length; i++) {
          if (timeline[i].ts < windowStart) {
            lastBefore = timeline[i].balance;
            startIdx = i + 1;
          } else break;
        }

        const tStart = Math.floor(windowStart / intervalMs) * intervalMs;
        const data: { x: number; y: number }[] = [];
        let histIdx = startIdx;

        for (let t = tStart; t <= tEnd; t += intervalMs) {
          // Advance to latest event at or before this time bucket
          while (histIdx < timeline.length && timeline[histIdx].ts <= t) {
            lastBefore = timeline[histIdx].balance;
            histIdx++;
          }
          data.push({ x: t, y: lastBefore });
        }

        // Include any remaining events after last bucket
        while (histIdx < timeline.length) {
          lastBefore = timeline[histIdx].balance;
          histIdx++;
        }
        if (data.length && data[data.length - 1].x < tEnd) {
          data.push({ x: tEnd, y: lastBefore });
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
  }, [visibleUsers, users, userBalanceTimeline, intervalMs, windowStart, tEnd]);

  // ── Bot ROI tab ──────────────────────────────────────────────────────────
  const allBotNames = useMemo(() => botPnls.map(bp => bp.bot_name).sort(), [botPnls]);
  const visibleBots = botFilter.size > 0 ? allBotNames.filter(b => botFilter.has(b)) : allBotNames;

  const handleBotClick = (name: string) => {
    const nf = new Set(botFilter);
    if (nf.has(name)) nf.delete(name); else nf.add(name);
    setBotFilter(nf.size === 0 ? new Set() : nf);
  };

  // Build per-bot ROI timeline from balanceHistory
  const botRoiDatasets = useMemo(() => {
    const ds = visibleBots.map((botName, idx) => {
      const color = BOT_PALETTE[idx % BOT_PALETTE.length];
      const bot = bots.find(b => b.bot_name === botName);
      const initBal = bot?.initial_balance ?? 0;
      if (!initBal) return null;

      // Get balance history for this bot
      const events: { ts: number; balance: number }[] = [];
      for (const bh of balanceHistory) {
        if (bh.bot_name !== botName) continue;
        const ts = bh.recorded_at ? parseUTC(bh.recorded_at)?.getTime() : null;
        if (!ts) continue;
        events.push({ ts, balance: bh.balance });
      }
      events.sort((a, b) => a.ts - b.ts);

      // Convert to %ROI timeline
      let lastBefore = initBal;
      let startIdx = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].ts < windowStart) { lastBefore = events[i].balance; startIdx = i + 1; }
        else break;
      }

      const tStart = Math.floor(windowStart / intervalMs) * intervalMs;
      const data: { x: number; y: number }[] = [];
      let histIdx = startIdx;

      for (let t = tStart; t <= tEnd; t += intervalMs) {
        while (histIdx < events.length && events[histIdx].ts <= t) {
          lastBefore = events[histIdx].balance;
          histIdx++;
        }
        data.push({ x: t, y: +((lastBefore - initBal) / initBal * 100).toFixed(2) });
      }
      while (histIdx < events.length) { lastBefore = events[histIdx].balance; histIdx++; }
      if (data.length && data[data.length - 1].x < tEnd) {
        data.push({ x: tEnd, y: +((lastBefore - initBal) / initBal * 100).toFixed(2) });
      }
      if (!data.length) {
        const tStart2 = Math.floor(windowStart / intervalMs) * intervalMs;
        data.push({ x: tStart2, y: 0 });
        data.push({ x: tEnd, y: 0 });
      }

      const bp = botPnlMap.get(botName);
      const lastIdx = data.length - 1;
      return {
        label: botName,
        data,
        borderColor: color,
        backgroundColor: color + '33',
        borderWidth: 1.5,
        tension: 0.3,
        fill: false,
        initBalance: initBal,
        realizedPnl: bp?.realized_pnl ?? 0,
        pointRadius: data.map((_: any, i: number) => (i === 0 || i === lastIdx) ? 5 : 0),
        pointHoverRadius: 7,
        pointBackgroundColor: color,
        pointBorderColor: '#07070d',
        pointBorderWidth: 1.5,
      };
    }).filter(Boolean) as any[];

    // 0% baseline
    const xMin = ds.reduce((m: number, d: any) => (d.data.length ? Math.min(m, d.data[0].x) : m), Infinity);
    if (xMin !== Infinity) {
      ds.push({
        label: 'Baseline (0%)',
        data: [{ x: xMin, y: 0 }, { x: tEnd, y: 0 }],
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
  }, [visibleBots, bots, balanceHistory, botPnlMap, intervalMs, windowStart, tEnd]);

  // ── Active datasets + options based on tab ────────────────────────────────
  const activeDatasets = chartTab === 'users' ? datasets : botRoiDatasets;

  const yBounds = useMemo(() => {
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const ds of activeDatasets) {
      if ((ds as any).borderDash) continue;
      for (const pt of ds.data as { y: number }[]) {
        if (pt.y < yMin) yMin = pt.y;
        if (pt.y > yMax) yMax = pt.y;
      }
    }
    if (yMin === Infinity) return undefined;
    const range = yMax - yMin;
    const padding = Math.max(range * 0.3, Math.abs(yMax) * 0.02);
    return { min: yMin - padding, max: yMax + padding };
  }, [activeDatasets]);

  const isRoiMode = chartTab === 'bots';

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false as any,
    layout: { padding: { right: 120 } },
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
        filter: (item) => !(activeDatasets[item.datasetIndex] as any)?.borderDash,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const d = new Date(items[0].parsed.x as number);
            return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          },
          label: (c) => {
            const ds = activeDatasets[c.datasetIndex] as any;
            const val = c.parsed.y ?? 0;
            if (isRoiMode) {
              const sign = val >= 0 ? '+' : '';
              return ` ${c.dataset.label}: ${sign}${val.toFixed(2)}%`;
            }
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
        min: yBounds?.min,
        max: yBounds?.max,
        grid: { color: '#1e2235' },
        ticks: {
          callback: (v) => isRoiMode ? `${v as number >= 0 ? '+' : ''}${(v as number).toFixed(1)}%` : '$' + compact(v as number),
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
    const totalFees = visible.reduce((s, v) => s + v.totalFees, 0);
    const totalRealizedPct = totalInit > 0 ? (totalRealized / totalInit) * 100 : 0;
    const best = visible.reduce((a, b) => (b.pnlPct > a.pnlPct ? b : a), visible[0]);
    const worst = visible.reduce((a, b) => (b.pnlPct < a.pnlPct ? b : a), visible[0]);

    return { totalBalance, totalInit, totalRealized, totalRealizedPct, totalPending, totalFees, best, worst, count: visible.length };
  }, [users, visibleUsers]);

  const allUserSel = userFilter.size === 0;
  const allBotSel = botFilter.size === 0;

  // Set _roiMode on chart for plugin access
  const chartPlugins = useMemo(() => {
    const roiSetter: Plugin<'line'> = {
      id: 'roiSetter',
      beforeInit(chart) { (chart as any)._roiMode = isRoiMode; },
      beforeUpdate(chart) { (chart as any)._roiMode = isRoiMode; },
    };
    return [roiSetter, gradientFillPlugin, crosshairPlugin, endLabelPlugin];
  }, [isRoiMode]);

  return (
    <div className="card p-5">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <div className="flex items-center gap-0.5 mr-2">
              <button
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-l transition-colors ${
                  chartTab === 'users' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'bg-transparent text-slate-500 border border-slate-700 hover:text-slate-300'
                }`}
                onClick={() => setChartTab('users')}
              >
                Users
              </button>
              <button
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-r transition-colors ${
                  chartTab === 'bots' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'bg-transparent text-slate-500 border border-slate-700 hover:text-slate-300'
                }`}
                onClick={() => setChartTab('bots')}
              >
                Bots
              </button>
            </div>

            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest mr-2">
              {chartTab === 'users' ? 'Balance' : 'ROI %'}
            </span>
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
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5 min-h-[22px]">
          <button
            className="pnl-chip"
            style={{
              borderColor: (chartTab === 'users' ? allUserSel : allBotSel) ? '#4d79ff' : '#1f1f32',
              color: (chartTab === 'users' ? allUserSel : allBotSel) ? '#7b9fff' : '#475569',
              background: (chartTab === 'users' ? allUserSel : allBotSel) ? 'rgba(77,121,255,.15)' : 'transparent',
            }}
            onClick={() => { chartTab === 'users' ? handleResetFilter() : setBotFilter(new Set()); }}
          >
            All
          </button>

          {chartTab === 'users' ? (
            users.map((u, i) => {
              const c = BOT_PALETTE[i % BOT_PALETTE.length];
              const on = allUserSel || userFilter.has(u.name);
              const pSign = u.pnlPct >= 0 ? '+' : '';
              const decided = u.wins + u.losses;
              const wr = decided > 0 ? Math.round(u.winRate) : null;
              return (
                <button
                  key={u.name}
                  className="pnl-chip"
                  style={{
                    borderColor: on ? c : '#1f1f32',
                    color: on ? c : '#475569',
                    background: userFilter.has(u.name) ? c + '33' : on ? c + '22' : 'transparent',
                  }}
                  onClick={() => handleUserClick(u.name)}
                >
                  <span>{u.name}</span>
                  <span className={`ml-1 text-[9px] ${u.pnlPct >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                    {pSign}{u.pnlPct.toFixed(1)}%
                  </span>
                  {wr !== null && (
                    <span className="ml-1 text-[9px] text-slate-500">{wr}%W</span>
                  )}
                </button>
              );
            })
          ) : (
            allBotNames.map((bn, i) => {
              const c = BOT_PALETTE[i % BOT_PALETTE.length];
              const on = allBotSel || botFilter.has(bn);
              const bp = botPnlMap.get(bn);
              const roi = bp?.realized_pnl_pct ?? 0;
              const wr = bp ? (bp.wins + bp.losses > 0 ? Math.round(bp.win_rate) : null) : null;
              const rSign = roi >= 0 ? '+' : '';
              return (
                <button
                  key={bn}
                  className="pnl-chip"
                  style={{
                    borderColor: on ? c : '#1f1f32',
                    color: on ? c : '#475569',
                    background: botFilter.has(bn) ? c + '33' : on ? c + '22' : 'transparent',
                  }}
                  onClick={() => handleBotClick(bn)}
                >
                  <span>{bn}</span>
                  <span className={`ml-1 text-[9px] ${roi >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                    {rSign}{roi.toFixed(1)}%
                  </span>
                  {wr !== null && (
                    <span className="ml-1 text-[9px] text-slate-500">{wr}%W</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Summary stats row — users tab only */}
      {chartTab === 'users' && summaryStats && (
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
          {summaryStats.totalFees > 0 && (
            <div className="card-sm px-3 py-1.5 text-[11px]">
              <span className="text-slate-500">Fees</span>
              <span className="ml-2 font-semibold text-slate-400">${compact(summaryStats.totalFees)}</span>
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
        <Line data={{ datasets: activeDatasets }} options={options} plugins={chartPlugins} />
      </div>
    </div>
  );
}
