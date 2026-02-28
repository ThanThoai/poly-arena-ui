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
import { Bot, BalanceHistory, Trade } from '@/lib/api';
import { BOT_PALETTE, BALANCE_TF_MS, TF_WINDOW, compact, parseUTC, money, pnlCls } from '@/lib/helpers';
import type { BalanceChartSettings } from '@/lib/settings-types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BalanceChartProps {
  bots: Bot[];
  balanceHistory: BalanceHistory[];
  trades: Trade[];
  onBotFilterChange?: (selected: Set<string>) => void;
  initialSettings?: BalanceChartSettings;
  onSettingsChange?: (s: BalanceChartSettings) => void;
}

const endLabelPlugin: Plugin<'line'> = {
  id: 'endLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const LINE_H = 28; // total height per label block (name + value + pct)

    // Collect visible label positions first
    const labels: { x: number; y: number; label: string; val: string; pct: string; pctColor: string; color: string }[] = [];
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.data || !ds.data.length) return;
      // Skip baseline dataset (has borderDash)
      if ((ds as any).borderDash) return;
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      const last = meta.data[meta.data.length - 1];
      if (!last) return;
      const raw = ds.data[ds.data.length - 1] as { y: number };
      const val = raw?.y ?? 0;
      const init = (ds as any).initBalance || 0;
      const pctVal = init > 0 ? ((val - init) / init) * 100 : 0;
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

    // Sort by Y position and push overlapping labels apart
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) {
      const gap = labels[i].y - labels[i - 1].y;
      if (gap < LINE_H) {
        const push = (LINE_H - gap) / 2;
        labels[i - 1].y -= push;
        labels[i].y += push;
      }
    }

    // Draw labels
    for (const l of labels) {
      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = l.color;
      ctx.font = '10px sans-serif';
      ctx.fillText(l.label, l.x, l.y - 7);
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(l.val, l.x, l.y + 5);
      // Draw % after dollar value
      const valWidth = ctx.measureText(l.val).width;
      ctx.font = '9px sans-serif';
      ctx.fillStyle = l.pctColor;
      ctx.fillText(` ${l.pct}`, l.x + valWidth, l.y + 5);
      ctx.restore();
    }
  },
};

/* ── Gradient area fill plugin ── */
const gradientFillPlugin: Plugin<'line'> = {
  id: 'gradientFill',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    chart.data.datasets.forEach((ds) => {
      // Skip baseline dataset
      if ((ds as any).borderDash) return;
      const color = ds.borderColor as string;
      if (!color) return;
      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, color + '33'); // 20% opacity at top
      gradient.addColorStop(1, color + '00'); // transparent at bottom
      ds.backgroundColor = gradient;
      ds.fill = true;
    });
  },
};

/* ── Crosshair plugin ── */
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

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(cx, chartArea.top);
    ctx.lineTo(cx, chartArea.bottom);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(chartArea.left, cy);
    ctx.lineTo(chartArea.right, cy);
    ctx.stroke();

    ctx.restore();
  },
};

export default function BalanceChart({ bots, balanceHistory, trades, onBotFilterChange, initialSettings, onSettingsChange }: BalanceChartProps) {
  const [balanceTf, setBalanceTf] = useState(initialSettings?.timeframe ?? 'M5');
  const [pnlBotFilter, setPnlBotFilter] = useState<Set<string>>(
    new Set(initialSettings?.selectedBots ?? []),
  );
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);

  // Sync restored bot filter to parent on mount
  useEffect(() => {
    if (pnlBotFilter.size > 0) onBotFilterChange?.(pnlBotFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unique owner names from bots
  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const b of bots) {
      if (b.owner_name) set.add(b.owner_name);
    }
    return [...set].sort();
  }, [bots]);

  // Bots filtered by owner (before individual bot filter)
  const ownerFilteredBots = useMemo(() => {
    if (!ownerFilter) return bots;
    return bots.filter((b) => b.owner_name === ownerFilter);
  }, [bots, ownerFilter]);

  const allBotNames = useMemo(() => ownerFilteredBots.map((b) => b.bot_name).sort(), [ownerFilteredBots]);
  const visibleBots = pnlBotFilter.size > 0 ? allBotNames.filter((b) => pnlBotFilter.has(b)) : allBotNames;

  const handleOwnerFilter = (owner: string | null) => {
    setOwnerFilter(owner);
    // Reset bot filter when switching owner
    setPnlBotFilter(new Set());
    onBotFilterChange?.(new Set());
    onSettingsChange?.({ timeframe: balanceTf, selectedBots: [] });
  };

  const handleSetFilter = (botName: string | null) => {
    let newFilter: Set<string>;
    if (botName === null) {
      newFilter = new Set();
    } else if (pnlBotFilter.size === 0) {
      newFilter = new Set([botName]);
    } else {
      newFilter = new Set(pnlBotFilter);
      if (newFilter.has(botName)) newFilter.delete(botName);
      else newFilter.add(botName);
      if (newFilter.size === 0) newFilter = new Set();
    }
    setPnlBotFilter(newFilter);
    onBotFilterChange?.(newFilter);
    onSettingsChange?.({ timeframe: balanceTf, selectedBots: [...newFilter] });
  };

  const handleTfChange = (tf: string) => {
    setBalanceTf(tf);
    onSettingsChange?.({ timeframe: tf, selectedBots: [...pnlBotFilter] });
  };

  const initBalance = ownerFilteredBots[0]?.initial_balance ?? 10000;
  const intervalMs = BALANCE_TF_MS[balanceTf] ?? BALANCE_TF_MS.H1;
  const tEnd = Date.now();
  const windowStart = tEnd - (TF_WINDOW[balanceTf] ?? TF_WINDOW.H1);

  const datasets = useMemo(() => {
    const ds = visibleBots
      .map((bot) => {
        const color = BOT_PALETTE[allBotNames.indexOf(bot) % BOT_PALETTE.length];
        const botMeta = bots.find((b) => b.bot_name === bot);
        const init = botMeta ? botMeta.initial_balance : initBalance;

        const hist = balanceHistory
          .filter((h) => h.bot_name === bot && h.recorded_at)
          .map((h) => ({ ts: parseUTC(h.recorded_at)!.getTime(), balance: h.balance }))
          .sort((a, b) => a.ts - b.ts);

        if (!hist.length) return null;

        let baseBalance = init;
        let idx = 0;
        while (idx < hist.length && hist[idx].ts < windowStart) {
          baseBalance = hist[idx].balance;
          idx++;
        }

        const tStart = Math.floor(windowStart / intervalMs) * intervalMs;
        const data: { x: number; y: number }[] = [];
        let cur = baseBalance;

        for (let t = tStart; t <= tEnd; t += intervalMs) {
          while (idx < hist.length && hist[idx].ts <= t) {
            cur = hist[idx].balance;
            idx++;
          }
          data.push({ x: t, y: +cur.toFixed(2) });
        }

        while (idx < hist.length) {
          cur = hist[idx].balance;
          idx++;
        }
        if (data.length && data[data.length - 1].x < tEnd) {
          data.push({ x: tEnd, y: +cur.toFixed(2) });
        }

        const lastIdx = data.length - 1;
        return {
          label: bot,
          data,
          borderColor: color,
          backgroundColor: color + '33',
          borderWidth: 1.5,
          tension: 0.3,
          fill: false,
          initBalance: init,
          pointRadius: data.map((_, i) => (i === 0 || i === lastIdx) ? 7 : 0),
          pointHoverRadius: 9,
          pointBackgroundColor: color,
          pointBorderColor: '#07070d',
          pointBorderWidth: 1.5,
        };
      })
      .filter(Boolean) as any[];

    const xMin = ds.reduce((m: number, d: any) => (d.data.length ? Math.min(m, d.data[0].x) : m), Infinity);
    if (xMin !== Infinity) {
      ds.push({
        label: `Baseline ($${compact(initBalance)})`,
        data: [{ x: xMin, y: initBalance }, { x: tEnd, y: initBalance }],
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
  }, [visibleBots, allBotNames, bots, balanceHistory, initBalance, intervalMs, windowStart, tEnd]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false as any,
    layout: { padding: { right: 100 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: false,
      },
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
            const formatted = '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (init && init > 0) {
              const pnl = val - init;
              const pctVal = ((pnl) / init) * 100;
              const sign = pnl >= 0 ? '+' : '';
              return ` ${c.dataset.label}: ${formatted} (P&L: ${sign}$${Math.abs(pnl).toFixed(2)} / ${sign}${pctVal.toFixed(1)}%)`;
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
    if (!bots.length) return null;
    const visible = visibleBots
      .map((name) => {
        const b = bots.find((x) => x.bot_name === name);
        if (!b) return null;
        // Get last known balance from history
        const hist = balanceHistory
          .filter((h) => h.bot_name === name && h.recorded_at)
          .sort((a, bb) => (parseUTC(a.recorded_at)?.getTime() ?? 0) - (parseUTC(bb.recorded_at)?.getTime() ?? 0));
        const currentBal = hist.length ? hist[hist.length - 1].balance : b.initial_balance;
        const init = b.initial_balance;
        const pnl = currentBal - init;
        const pnlPct = init > 0 ? (pnl / init) * 100 : 0;
        return { name, currentBal, init, pnl, pnlPct };
      })
      .filter(Boolean) as { name: string; currentBal: number; init: number; pnl: number; pnlPct: number }[];

    if (!visible.length) return null;

    const totalBalance = visible.reduce((s, v) => s + v.currentBal, 0);
    const totalInit = visible.reduce((s, v) => s + v.init, 0);
    const totalPnl = totalBalance - totalInit;
    const totalPnlPct = totalInit > 0 ? (totalPnl / totalInit) * 100 : 0;
    const best = visible.reduce((a, b) => (b.pnlPct > a.pnlPct ? b : a), visible[0]);
    const worst = visible.reduce((a, b) => (b.pnlPct < a.pnlPct ? b : a), visible[0]);

    return { totalBalance, totalPnl, totalPnlPct, best, worst, count: visible.length };
  }, [bots, visibleBots, balanceHistory]);

  const allSel = pnlBotFilter.size === 0;

  /* ── Bot chip data (inline balance + P&L) ── */
  const botChipData = useMemo(() => {
    const map: Record<string, { balance: number; pnlPct: number }> = {};
    for (const name of allBotNames) {
      const b = bots.find((x) => x.bot_name === name);
      if (!b) continue;
      const hist = balanceHistory
        .filter((h) => h.bot_name === name && h.recorded_at)
        .sort((a, bb) => (parseUTC(a.recorded_at)?.getTime() ?? 0) - (parseUTC(bb.recorded_at)?.getTime() ?? 0));
      const currentBal = hist.length ? hist[hist.length - 1].balance : b.initial_balance;
      const pnlPct = b.initial_balance > 0 ? ((currentBal - b.initial_balance) / b.initial_balance) * 100 : 0;
      map[name] = { balance: currentBal, pnlPct };
    }
    return map;
  }, [allBotNames, bots, balanceHistory]);

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
          <span className="text-[10px] text-slate-600 hidden sm:block">click to toggle</span>
        </div>

        {/* Owner filter */}
        {owners.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-2 items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Owner</span>
            <button
              className="pnl-chip"
              style={{
                borderColor: !ownerFilter ? '#4d79ff' : '#1f1f32',
                color: !ownerFilter ? '#7b9fff' : '#475569',
                background: !ownerFilter ? 'rgba(77,121,255,.15)' : 'transparent',
              }}
              onClick={() => handleOwnerFilter(null)}
            >
              All
            </button>
            {owners.map((o) => {
              const active = ownerFilter === o;
              return (
                <button
                  key={o}
                  className="pnl-chip"
                  style={{
                    borderColor: active ? '#a78bfa' : '#1f1f32',
                    color: active ? '#c4b5fd' : '#475569',
                    background: active ? 'rgba(167,139,250,.15)' : 'transparent',
                  }}
                  onClick={() => handleOwnerFilter(o)}
                >
                  {o}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 min-h-[22px]">
          <button
            className="pnl-chip"
            style={{
              borderColor: allSel ? '#4d79ff' : '#1f1f32',
              color: allSel ? '#7b9fff' : '#475569',
              background: allSel ? 'rgba(77,121,255,.15)' : 'transparent',
            }}
            onClick={() => handleSetFilter(null)}
          >
            All
          </button>
          {allBotNames.map((n, i) => {
            const c = BOT_PALETTE[i % BOT_PALETTE.length];
            const on = allSel || pnlBotFilter.has(n);
            const chip = botChipData[n];
            return (
              <button
                key={n}
                className="pnl-chip"
                style={{
                  borderColor: on ? c : '#1f1f32',
                  color: on ? c : '#475569',
                  background: on ? c + '22' : 'transparent',
                }}
                onClick={() => handleSetFilter(n)}
              >
                {n}
                {chip && (
                  <span className="text-[10px] ml-1 opacity-80">
                    {' '}· ${compact(chip.balance)}{' '}
                    <span style={{ color: chip.pnlPct >= 0 ? '#34d399' : '#fb7185' }}>
                      ({chip.pnlPct >= 0 ? '+' : ''}{chip.pnlPct.toFixed(1)}%)
                    </span>
                  </span>
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
            <span className="text-slate-500">Total P&L</span>
            <span className={`ml-2 font-semibold ${pnlCls(summaryStats.totalPnl)}`}>
              {summaryStats.totalPnl >= 0 ? '+' : ''}${compact(Math.abs(summaryStats.totalPnl))}
              {' '}({summaryStats.totalPnlPct >= 0 ? '+' : ''}{summaryStats.totalPnlPct.toFixed(1)}%)
            </span>
          </div>
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
    </div>
  );
}
