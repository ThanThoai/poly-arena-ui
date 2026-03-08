'use client';

import { useMemo, useState } from 'react';
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
import { Bot, BotPnl, BalanceHistory, Trade } from '@/lib/api';
import { BOT_PALETTE, BALANCE_TF_MS, TF_WINDOW, compact, parseUTC, pnlCls } from '@/lib/helpers';
import type { BalanceChartSettings } from '@/lib/settings-types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BalanceChartProps {
  bots: Bot[];
  botPnls: BotPnl[];
  balanceHistory: BalanceHistory[];
  trades: Trade[];
  initialSettings?: BalanceChartSettings;
  onSettingsChange?: (s: BalanceChartSettings) => void;
}

/* ── Chart.js plugins ── */

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
      ctx.fillStyle = l.color;
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

export default function BalanceChart({
  bots, botPnls, balanceHistory, trades,
  initialSettings, onSettingsChange,
}: BalanceChartProps) {
  const [balanceTf, setBalanceTf] = useState(initialSettings?.timeframe ?? 'M5');
  const [botFilter, setBotFilter] = useState<Set<string>>(new Set());

  const botPnlMap = useMemo(() => {
    const m = new Map<string, BotPnl>();
    for (const bp of botPnls) m.set(bp.bot_name, bp);
    return m;
  }, [botPnls]);

  const handleTfChange = (tf: string) => {
    setBalanceTf(tf);
    onSettingsChange?.({ timeframe: tf, selectedBots: [] });
  };

  const intervalMs = BALANCE_TF_MS[balanceTf] ?? BALANCE_TF_MS.H1;
  const tEnd = Date.now();

  // ── Bot filter ────────────────────────────────────────────────────────
  const allBotNames = useMemo(() => botPnls.map((bp) => bp.bot_name).sort(), [botPnls]);
  const visibleBots = botFilter.size > 0 ? allBotNames.filter((b) => botFilter.has(b)) : allBotNames;

  const handleBotClick = (name: string) => {
    const nf = new Set(botFilter);
    if (nf.has(name)) nf.delete(name); else nf.add(name);
    setBotFilter(nf.size === 0 ? new Set() : nf);
  };

  // ── Shared binning logic ──────────────────────────────────────────────
  const botBinnedData = useMemo(() => {
    const MAX_EVENTS = 100;
    const result = new Map<string, { data: { x: number; y: number }[]; changeIdx: Set<number>; initBal: number; lastBalance: number }>();

    // Pass 1: collect & trim events per bot, find global earliest
    const botEvents = new Map<string, { events: { ts: number; balance: number }[]; initBal: number }>();
    let globalEarliest = tEnd;

    for (const botName of visibleBots) {
      const bot = bots.find((b) => b.bot_name === botName);
      const initBal = bot?.initial_balance ?? 0;
      if (!initBal) continue;

      const events: { ts: number; balance: number }[] = [];
      for (const bh of balanceHistory) {
        if (bh.bot_name !== botName) continue;
        const ts = bh.recorded_at ? parseUTC(bh.recorded_at)?.getTime() : null;
        if (!ts) continue;
        events.push({ ts, balance: bh.balance });
      }
      events.sort((a, b) => a.ts - b.ts);
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS);
      }

      if (events.length > 0 && events[0].ts < globalEarliest) {
        globalEarliest = events[0].ts;
      }

      botEvents.set(botName, { events, initBal });
    }

    // Pass 2: bin all bots from shared global earliest
    const tStart = Math.floor(globalEarliest / intervalMs) * intervalMs;

    for (const [botName, { events, initBal }] of botEvents) {
      let lastBefore = initBal;
      const data: { x: number; y: number }[] = [];
      let histIdx = 0;

      for (let t = tStart; t <= tEnd; t += intervalMs) {
        while (histIdx < events.length && events[histIdx].ts <= t) {
          lastBefore = events[histIdx].balance;
          histIdx++;
        }
        data.push({ x: t, y: lastBefore });
      }
      while (histIdx < events.length) { lastBefore = events[histIdx].balance; histIdx++; }
      if (data.length && data[data.length - 1].x < tEnd) {
        data.push({ x: tEnd, y: lastBefore });
      }
      if (!data.length) {
        data.push({ x: tStart, y: initBal });
        data.push({ x: tEnd, y: initBal });
      }

      const changeIdx = new Set<number>();
      for (let i = 1; i < data.length; i++) {
        if (Math.abs(data[i].y - data[i - 1].y) > 0.005) changeIdx.add(i);
      }

      result.set(botName, { data, changeIdx, initBal, lastBalance: lastBefore });
    }
    return result;
  }, [visibleBots, bots, balanceHistory, intervalMs, tEnd]);

  // ── Bot Balance datasets ──────────────────────────────────────────────
  const botBalanceDatasets = useMemo(() => {
    const ds = visibleBots.map((botName, idx) => {
      const binned = botBinnedData.get(botName);
      if (!binned) return null;
      const { data: rawData, changeIdx, initBal } = binned;
      const color = BOT_PALETTE[idx % BOT_PALETTE.length];
      const bp = botPnlMap.get(botName);

      const data = rawData.map((pt) => ({ x: pt.x, y: +pt.y.toFixed(2) }));
      const lastIdx = data.length - 1;
      return {
        label: botName,
        data,
        borderColor: color,
        backgroundColor: color + '33',
        borderWidth: 1.5,
        tension: 0,
        fill: false,
        initBalance: initBal,
        realizedPnl: bp?.realized_pnl ?? 0,
        pointRadius: data.map((_: any, i: number) =>
          i === 0 || i === lastIdx ? 7 : changeIdx.has(i) ? 4 : 0
        ),
        pointHoverRadius: 9,
        pointBackgroundColor: data.map((_: any, i: number) => {
          if (!changeIdx.has(i)) return color;
          const prev = i > 0 ? data[i - 1].y : initBal;
          return data[i].y >= prev ? '#34d399' : '#fb7185';
        }),
        pointBorderColor: '#07070d',
        pointBorderWidth: 1.5,
      };
    }).filter(Boolean) as any[];
    return ds;
  }, [visibleBots, botBinnedData, botPnlMap]);

  const activeDatasets = botBalanceDatasets;

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
          callback: (v) => {
            if (!v) return '';
            const d = new Date(v as number);
            if (balanceTf === 'M5') return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            if (balanceTf === 'M15') return d.toLocaleString(undefined, { day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          },
        },
      },
      y: {
        min: yBounds?.min,
        max: yBounds?.max,
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

  const chartPlugins = useMemo(() => {
    return [gradientFillPlugin, crosshairPlugin, endLabelPlugin];
  }, []);

  return (
    <div className="card p-5">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-200">Balance</span>
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

        {/* Bot filter chips */}
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
