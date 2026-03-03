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
import { Bot, BotPnl, BalanceHistory, Trade, UserBalanceHistory, UserPnl } from '@/lib/api';
import { BOT_PALETTE, BALANCE_TF_MS, TF_WINDOW, compact, parseUTC, pnlCls } from '@/lib/helpers';
import type { BalanceChartSettings } from '@/lib/settings-types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BalanceChartProps {
  bots: Bot[];
  botPnls: BotPnl[];
  balanceHistory: BalanceHistory[];
  trades: Trade[];
  userBalanceHistory: UserBalanceHistory[];
  userPnls: UserPnl[];
  initialSettings?: BalanceChartSettings;
  onSettingsChange?: (s: BalanceChartSettings) => void;
}

/* ── Chart.js plugins ── */

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

/* ── Aggregate user balance from per-user balance history ── */
interface UserAgg {
  user_id: number;
  username: string;
  initial_balance: number;
  current_balance: number;
  realized_pnl: number;
  realized_pnl_pct: number;
}

export default function BalanceChart({
  bots, botPnls, balanceHistory, trades, userBalanceHistory, userPnls,
  initialSettings, onSettingsChange,
}: BalanceChartProps) {
  const [chartTab, setChartTab] = useState<'users' | 'bots'>(initialSettings?.chartTab as any ?? 'users');
  const [balanceTf, setBalanceTf] = useState(initialSettings?.timeframe ?? 'M5');
  const [botFilter, setBotFilter] = useState<Set<string>>(new Set());
  const [userFilter, setUserFilter] = useState<Set<number>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());

  const botPnlMap = useMemo(() => {
    const m = new Map<string, BotPnl>();
    for (const bp of botPnls) m.set(bp.bot_name, bp);
    return m;
  }, [botPnls]);

  const handleTfChange = (tf: string) => {
    setBalanceTf(tf);
    onSettingsChange?.({ timeframe: tf, selectedBots: [], chartTab });
  };

  const handleTabChange = (tab: 'users' | 'bots') => {
    setChartTab(tab);
    onSettingsChange?.({ timeframe: balanceTf, selectedBots: [], chartTab: tab });
  };

  const intervalMs = BALANCE_TF_MS[balanceTf] ?? BALANCE_TF_MS.H1;
  const tEnd = Date.now();
  const windowStart = tEnd - (TF_WINDOW[balanceTf] ?? TF_WINDOW.H1);

  // ── Users: aggregate from userPnls ──────────────────────────────────────
  const users: UserAgg[] = useMemo(() =>
    userPnls.map((up) => ({
      user_id: up.user_id,
      username: up.username,
      initial_balance: up.initial_balance,
      current_balance: up.current_balance,
      realized_pnl: up.realized_pnl,
      realized_pnl_pct: up.realized_pnl_pct,
    })),
  [userPnls]);

  const allUserIds = useMemo(() => users.map((u) => u.user_id), [users]);
  const visibleUsers = userFilter.size > 0 ? allUserIds.filter((id) => userFilter.has(id)) : allUserIds;

  const handleUserChipClick = (userId: number) => {
    const nf = new Set(userFilter);
    if (nf.has(userId)) nf.delete(userId); else nf.add(userId);
    setUserFilter(nf.size === 0 ? new Set() : nf);
  };

  const handleUserDetailClick = (userId: number) => {
    const ns = new Set(selectedUsers);
    if (ns.has(userId)) ns.delete(userId); else ns.add(userId);
    setSelectedUsers(ns);
  };

  // ── User balance timeline datasets ──────────────────────────────────────
  const userBalanceTimeline = useMemo(() => {
    const ds = visibleUsers.map((userId, idx) => {
      const user = users.find((u) => u.user_id === userId);
      if (!user) return null;
      const color = BOT_PALETTE[idx % BOT_PALETTE.length];
      const initBal = user.initial_balance || 0;

      const events: { ts: number; balance: number }[] = [];
      for (const ubh of userBalanceHistory) {
        if (ubh.user_id !== userId) continue;
        const ts = ubh.recorded_at ? parseUTC(ubh.recorded_at)?.getTime() : null;
        if (!ts) continue;
        events.push({ ts, balance: ubh.balance });
      }
      events.sort((a, b) => a.ts - b.ts);

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
        data.push({ x: t, y: +lastBefore.toFixed(2) });
      }
      while (histIdx < events.length) { lastBefore = events[histIdx].balance; histIdx++; }
      if (data.length && data[data.length - 1].x < tEnd) {
        data.push({ x: tEnd, y: +lastBefore.toFixed(2) });
      }
      if (!data.length) {
        const tStart2 = Math.floor(windowStart / intervalMs) * intervalMs;
        data.push({ x: tStart2, y: initBal });
        data.push({ x: tEnd, y: initBal });
      }

      const lastIdx = data.length - 1;
      return {
        label: user.username,
        data,
        borderColor: color,
        backgroundColor: color + '33',
        borderWidth: 1.5,
        tension: 0.3,
        fill: false,
        initBalance: initBal,
        realizedPnl: user.realized_pnl,
        pointRadius: data.map((_: any, i: number) => (i === 0 || i === lastIdx) ? 5 : 0),
        pointHoverRadius: 7,
        pointBackgroundColor: color,
        pointBorderColor: '#07070d',
        pointBorderWidth: 1.5,
      };
    }).filter(Boolean) as any[];
    return ds;
  }, [visibleUsers, users, userBalanceHistory, intervalMs, windowStart, tEnd]);

  // ── Bot ROI datasets ────────────────────────────────────────────────────
  const allBotNames = useMemo(() => botPnls.map((bp) => bp.bot_name).sort(), [botPnls]);
  const visibleBots = botFilter.size > 0 ? allBotNames.filter((b) => botFilter.has(b)) : allBotNames;

  const handleBotClick = (name: string) => {
    const nf = new Set(botFilter);
    if (nf.has(name)) nf.delete(name); else nf.add(name);
    setBotFilter(nf.size === 0 ? new Set() : nf);
  };

  const botRoiDatasets = useMemo(() => {
    const ds = visibleBots.map((botName, idx) => {
      const color = BOT_PALETTE[idx % BOT_PALETTE.length];
      const bot = bots.find((b) => b.bot_name === botName);
      const initBal = bot?.initial_balance ?? 0;
      if (!initBal) return null;

      const events: { ts: number; balance: number }[] = [];
      for (const bh of balanceHistory) {
        if (bh.bot_name !== botName) continue;
        const ts = bh.recorded_at ? parseUTC(bh.recorded_at)?.getTime() : null;
        if (!ts) continue;
        events.push({ ts, balance: bh.balance });
      }
      events.sort((a, b) => a.ts - b.ts);

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

  // ── Active datasets based on tab ────────────────────────────────────────
  const isRoiMode = chartTab === 'bots';
  const activeDatasets = isRoiMode ? botRoiDatasets : userBalanceTimeline;

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
              return ` ${c.dataset.label}: ${formatted} (${sign}$${Math.abs(realPnl).toFixed(2)} / ${sign}${pctVal.toFixed(1)}%)`;
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

  /* ── Summary stats (bot-level, shown in bots tab) ── */
  const summaryStats = useMemo(() => {
    const visible = visibleBots
      .map((name) => botPnlMap.get(name))
      .filter(Boolean) as BotPnl[];
    if (!visible.length) return null;

    const totalInit = visible.reduce((s, v) => s + v.initial_balance, 0);
    const totalBalance = visible.reduce((s, v) => s + v.current_balance, 0);
    const totalRealized = visible.reduce((s, v) => s + v.realized_pnl, 0);
    const totalFees = visible.reduce((s, v) => s + (v.total_fees ?? 0), 0);
    const totalRealizedPct = totalInit > 0 ? (totalRealized / totalInit) * 100 : 0;
    const best = visible.reduce((a, b) => (b.realized_pnl_pct > a.realized_pnl_pct ? b : a), visible[0]);
    const worst = visible.reduce((a, b) => (b.realized_pnl_pct < a.realized_pnl_pct ? b : a), visible[0]);

    return { totalBalance, totalInit, totalRealized, totalRealizedPct, totalFees, best, worst, count: visible.length };
  }, [visibleBots, botPnlMap]);

  const allBotSel = botFilter.size === 0;
  const allUserSel = userFilter.size === 0;

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
            <button
              className={`text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded ${chartTab === 'users' ? 'text-slate-200 bg-slate-700/50' : 'text-slate-500 hover:text-slate-400'}`}
              onClick={() => handleTabChange('users')}
            >
              Users
            </button>
            <button
              className={`text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded ${chartTab === 'bots' ? 'text-slate-200 bg-slate-700/50' : 'text-slate-500 hover:text-slate-400'}`}
              onClick={() => handleTabChange('bots')}
            >
              Bots ROI %
            </button>
            <span className="w-px h-4 bg-slate-700 mx-1" />
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

        {/* ── Users tab: user chips + detail rows ── */}
        {chartTab === 'users' && (
          <>
            <div className="flex flex-wrap gap-1.5 min-h-[22px]">
              <button
                className="pnl-chip"
                style={{
                  borderColor: allUserSel ? '#4d79ff' : '#1f1f32',
                  color: allUserSel ? '#7b9fff' : '#475569',
                  background: allUserSel ? 'rgba(77,121,255,.15)' : 'transparent',
                }}
                onClick={() => { setUserFilter(new Set()); setSelectedUsers(new Set()); }}
              >
                All
              </button>
              {users.map((u, i) => {
                const c = BOT_PALETTE[i % BOT_PALETTE.length];
                const on = allUserSel || userFilter.has(u.user_id);
                const detail = selectedUsers.has(u.user_id);
                const roi = u.realized_pnl_pct;
                const rSign = roi >= 0 ? '+' : '';
                return (
                  <button
                    key={u.user_id}
                    className="pnl-chip"
                    style={{
                      borderColor: on ? c : '#1f1f32',
                      color: on ? c : '#475569',
                      background: detail ? c + '44' : userFilter.has(u.user_id) ? c + '33' : on ? c + '22' : 'transparent',
                    }}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        handleUserDetailClick(u.user_id);
                      } else {
                        handleUserChipClick(u.user_id);
                        handleUserDetailClick(u.user_id);
                      }
                    }}
                  >
                    <span>{u.username}</span>
                    <span className={`ml-1 text-[9px] ${roi >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                      {rSign}{roi.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Detail rows right below chips */}
            {selectedUsers.size > 0 && (
              <div className="mt-2 space-y-1.5">
                {userPnls
                  .filter((up) => selectedUsers.has(up.user_id))
                  .map((up) => (
                    <div key={up.user_id} className="card-sm px-3 py-2">
                      <div className="flex items-center gap-3 text-[11px] flex-wrap">
                        <span className="text-slate-200 font-semibold min-w-[60px]">{up.username}</span>
                        <span className={`font-semibold ${pnlCls(up.realized_pnl)}`}>
                          {up.realized_pnl >= 0 ? '+' : ''}${compact(Math.abs(up.realized_pnl))}
                          {' '}({up.realized_pnl_pct >= 0 ? '+' : ''}{up.realized_pnl_pct.toFixed(1)}%)
                        </span>
                        <span className="text-slate-600">|</span>
                        <span><span className="text-slate-500">Bal</span> <span className="text-slate-300">${compact(up.current_balance)}</span></span>
                        <span><span className="text-slate-500">Init</span> <span className="text-slate-300">${compact(up.initial_balance)}</span></span>
                        <span><span className="text-slate-500">Alloc</span> <span className="text-slate-300">${compact(up.allocated_balance)}</span></span>
                        <span><span className="text-slate-500">Avail</span> <span className="text-slate-300">${compact(up.available_balance)}</span></span>
                        <span className="text-slate-600">|</span>
                        <span>
                          <span className="text-emerald-400">{up.wins}</span>
                          <span className="text-slate-600">/</span>
                          <span className="text-rose-400">{up.losses}</span>
                          {up.pending > 0 && <span className="text-slate-500 ml-0.5">({up.pending}p)</span>}
                        </span>
                        {up.total_fees > 0 && (
                          <span><span className="text-slate-500">Fees</span> <span className="text-slate-400">${compact(up.total_fees)}</span></span>
                        )}
                        <span>
                          <span className="text-slate-500">Avg</span>
                          <span className={`ml-0.5 ${pnlCls(up.avg_profit_per_trade)}`}>
                            {up.total_trades > 0
                              ? `${up.avg_profit_per_trade >= 0 ? '+' : ''}$${Math.abs(up.avg_profit_per_trade).toFixed(2)}`
                              : '—'}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {/* ── Bots tab: bot chips ── */}
        {chartTab === 'bots' && (
          <div className="flex flex-wrap gap-1.5 min-h-[22px]">
            <button
              className="pnl-chip"
              style={{
                borderColor: allBotSel ? '#4d79ff' : '#1f1f32',
                color: allBotSel ? '#7b9fff' : '#475569',
                background: allBotSel ? 'rgba(77,121,255,.15)' : 'transparent',
              }}
              onClick={() => setBotFilter(new Set())}
            >
              All
            </button>
            {allBotNames.map((bn, i) => {
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
            })}
          </div>
        )}
      </div>

      {/* Summary stats row (bots tab) */}
      {chartTab === 'bots' && summaryStats && (
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
                  {summaryStats.best.bot_name} ({summaryStats.best.realized_pnl_pct >= 0 ? '+' : ''}{summaryStats.best.realized_pnl_pct.toFixed(1)}%)
                </span>
              </div>
              <div className="card-sm px-3 py-1.5 text-[11px]">
                <span className="text-slate-500">Worst</span>
                <span className="ml-2 font-semibold text-rose-400">
                  {summaryStats.worst.bot_name} ({summaryStats.worst.realized_pnl_pct >= 0 ? '+' : ''}{summaryStats.worst.realized_pnl_pct.toFixed(1)}%)
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
