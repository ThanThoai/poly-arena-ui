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
import { Bot, BotPnl, BalanceHistory, BalanceHistoryGrouped, Trade } from '@/lib/api';
import { BOT_PALETTE, compact, parseUTC, pnlCls } from '@/lib/helpers';
import type { BalanceChartSettings } from '@/lib/settings-types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BalanceChartProps {
  bots: Bot[];
  botPnls: BotPnl[];
  balanceHistory: BalanceHistory[];
  balanceHistoryGrouped: BalanceHistoryGrouped[];
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
  bots, botPnls, balanceHistory, balanceHistoryGrouped, trades,
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

  const tEnd = Date.now();

  // ── Bot filter ────────────────────────────────────────────────────────
  const allBotNames = useMemo(() => botPnls.map((bp) => bp.bot_name).sort(), [botPnls]);
  const visibleBots = botFilter.size > 0 ? allBotNames.filter((b) => botFilter.has(b)) : allBotNames;

  const handleBotClick = (name: string) => {
    const nf = new Set(botFilter);
    if (nf.has(name)) nf.delete(name); else nf.add(name);
    setBotFilter(nf.size === 0 ? new Set() : nf);
  };

  // ── Build per-bot data from grouped settlement ledger ──
  // Each settled_at group can have MULTIPLE entries per bot (one per session, e.g. BTC + ETH).
  // We aggregate to ONE data point per bot per timestamp (last new_balance, summed deltas).
  interface AggMeta {
    delta: number;
    total_profit: number;
    total_fee: number;
    trade_count: number;
    win_count: number;
    loss_count: number;
    sessions: { session_id: string | null; session_result: string | null; delta: number }[];
  }

  const { botBinnedData, aggregatedMeta } = useMemo(() => {
    const MAX_POINTS = 150;
    const result = new Map<string, { data: { x: number; y: number }[]; changeIdx: Set<number>; initBal: number; lastBalance: number }>();
    const aggMeta = new Map<string, Map<number, AggMeta>>();

    if (balanceHistoryGrouped.length > 0) {
      // Per bot: aggregate multiple entries at the same timestamp into one point
      // The entries within a group are chained, so the LAST new_balance is the final balance.
      const botTimeline = new Map<string, Map<number, { balance: number; meta: AggMeta }>>();

      for (const group of balanceHistoryGrouped) {
        const ts = parseUTC(group.settled_at)?.getTime();
        if (!ts) continue;
        for (const entry of group.bots) {
          if (!botTimeline.has(entry.bot_name)) botTimeline.set(entry.bot_name, new Map());
          const timeline = botTimeline.get(entry.bot_name)!;
          const existing = timeline.get(ts);
          if (existing) {
            // Same bot, same timestamp — aggregate (balance chains, so take latest)
            existing.balance = entry.new_balance;
            existing.meta.delta += entry.delta;
            existing.meta.total_profit += entry.total_profit;
            existing.meta.total_fee += entry.total_fee;
            existing.meta.trade_count += entry.trade_count ?? 0;
            existing.meta.win_count += entry.win_count ?? 0;
            existing.meta.loss_count += entry.loss_count ?? 0;
            existing.meta.sessions.push({
              session_id: entry.session_id, session_result: entry.session_result, delta: entry.delta,
            });
          } else {
            timeline.set(ts, {
              balance: entry.new_balance,
              meta: {
                delta: entry.delta,
                total_profit: entry.total_profit,
                total_fee: entry.total_fee,
                trade_count: entry.trade_count ?? 0,
                win_count: entry.win_count ?? 0,
                loss_count: entry.loss_count ?? 0,
                sessions: [{ session_id: entry.session_id, session_result: entry.session_result, delta: entry.delta }],
              },
            });
          }
        }
      }

      for (const botName of visibleBots) {
        const bot = bots.find((b) => b.bot_name === botName);
        const initBal = bot?.initial_balance ?? 0;
        if (!initBal) continue;

        const timeline = botTimeline.get(botName);
        if (!timeline || timeline.size === 0) continue;

        // Sort by timestamp
        let entries = [...timeline.entries()].sort((a, b) => a[0] - b[0]);
        if (entries.length > MAX_POINTS) entries = entries.slice(entries.length - MAX_POINTS);

        const data = entries.map(([ts, v]) => ({ x: ts, y: v.balance }));
        const metaMap = new Map<number, AggMeta>();
        entries.forEach(([, v], i) => metaMap.set(i, v.meta));

        const lastBalance = data[data.length - 1].y;
        const changeIdx = new Set<number>();
        for (let i = 1; i < data.length; i++) {
          if (Math.abs(data[i].y - data[i - 1].y) > 0.005) changeIdx.add(i);
        }

        result.set(botName, { data, changeIdx, initBal, lastBalance });
        aggMeta.set(botName, metaMap);
      }
    } else {
      // Fallback to legacy flat balanceHistory
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
        if (events.length > MAX_POINTS) events.splice(0, events.length - MAX_POINTS);

        const data = events.map((ev) => ({ x: ev.ts, y: ev.balance }));
        if (!data.length) continue;

        const lastBalance = data[data.length - 1].y;
        const changeIdx = new Set<number>();
        for (let i = 1; i < data.length; i++) {
          if (Math.abs(data[i].y - data[i - 1].y) > 0.005) changeIdx.add(i);
        }

        result.set(botName, { data, changeIdx, initBal, lastBalance });
      }
    }
    return { botBinnedData: result, aggregatedMeta: aggMeta };
  }, [visibleBots, bots, balanceHistory, balanceHistoryGrouped, tEnd]);

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
        borderWidth: 1.8,
        tension: 0.35,
        cubicInterpolationMode: 'monotone' as const,
        fill: false,
        initBalance: initBal,
        realizedPnl: bp?.realized_pnl ?? 0,
        pointRadius: data.map((_: any, i: number) =>
          i === 0 || i === lastIdx ? 6 : changeIdx.has(i) ? 3 : 0
        ),
        pointHoverRadius: 7,
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

  // pointMeta is now derived from aggregatedMeta (computed alongside botBinnedData)
  // aggregatedMeta: Map<botName, Map<pointIndex, AggMeta>>

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
            const botName = ds?.label ?? '';
            const val = c.parsed.y ?? 0;
            const init = ds?.initBalance;
            const formatted = '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // Try to get rich session data from aggregatedMeta
            const botMeta = aggregatedMeta.get(botName);
            const pm = botMeta?.get(c.dataIndex);

            if (pm) {
              const deltaSign = pm.delta >= 0 ? '+' : '';
              const tradeInfo = pm.trade_count ? ` (${pm.win_count}W/${pm.loss_count}L)` : '';
              // Show per-session breakdown if multiple sessions in this point
              if (pm.sessions.length > 1) {
                const sessionTags = pm.sessions.map((s) => {
                  const sid = s.session_id?.split(':').slice(0, 2).join(':') ?? '?';
                  const res = s.session_result ? `${s.session_result}` : '';
                  const d = s.delta >= 0 ? '+' : '';
                  return `${sid} ${d}$${s.delta.toFixed(2)} ${res}`;
                }).join(' | ');
                return ` ${botName}: ${formatted} ${deltaSign}$${pm.delta.toFixed(2)}${tradeInfo} [${sessionTags}]`;
              }
              const resultTag = pm.sessions[0]?.session_result ? ` [${pm.sessions[0].session_result}]` : '';
              const sessionTag = pm.sessions[0]?.session_id ? ` ${pm.sessions[0].session_id}` : '';
              return ` ${botName}: ${formatted} ${deltaSign}$${pm.delta.toFixed(2)}${resultTag}${tradeInfo}${sessionTag}`;
            }

            // Fallback
            const realPnl = ds?.realizedPnl;
            if (init && init > 0 && realPnl !== undefined) {
              const pctVal = (realPnl / init) * 100;
              const sign = realPnl >= 0 ? '+' : '';
              return ` ${botName}: ${formatted} (${sign}$${Math.abs(realPnl).toFixed(2)} / ${sign}${pctVal.toFixed(1)}%)`;
            }
            return ` ${botName}: ${formatted}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        grid: { color: '#12121e' },
        afterBuildTicks: (axis) => {
          const allTs = new Set<number>();
          for (const ds of activeDatasets) {
            for (const pt of ds.data as { x: number }[]) allTs.add(pt.x);
          }
          const sorted = [...allTs].sort((a, b) => a - b);
          const maxTicks = 10;
          if (sorted.length <= maxTicks) {
            axis.ticks = sorted.map((v) => ({ value: v }));
          } else {
            const step = (sorted.length - 1) / (maxTicks - 1);
            axis.ticks = Array.from({ length: maxTicks }, (_, i) => ({
              value: sorted[Math.round(i * step)],
            }));
          }
        },
        ticks: {
          font: { size: 10 },
          callback: (v) => {
            if (!v) return '';
            const d = new Date(v as number);
            return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
