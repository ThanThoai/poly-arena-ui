'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BalanceChartProps {
  bots: Bot[];
  balanceHistory: BalanceHistory[];
  trades: Trade[];
  onBotFilterChange?: (selected: Set<string>) => void;
}

const endLabelPlugin: Plugin<'line'> = {
  id: 'endLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.data || !ds.data.length) return;
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      const last = meta.data[meta.data.length - 1];
      if (!last) return;
      const raw = ds.data[ds.data.length - 1] as { y: number };
      const val = raw?.y ?? 0;
      const valLabel = '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      const x = last.x + 8;
      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = ds.borderColor as string;
      ctx.font = '10px sans-serif';
      ctx.fillText(ds.label || '', x, last.y - 7);
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(valLabel, x, last.y + 5);
      ctx.restore();
    });
  },
};

export default function BalanceChart({ bots, balanceHistory, trades, onBotFilterChange }: BalanceChartProps) {
  const [balanceTf, setBalanceTf] = useState('M5');
  const [pnlBotFilter, setPnlBotFilter] = useState<Set<string>>(new Set());

  const allBotNames = useMemo(() => bots.map((b) => b.bot_name).sort(), [bots]);
  const visibleBots = pnlBotFilter.size > 0 ? allBotNames.filter((b) => pnlBotFilter.has(b)) : allBotNames;

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
  };

  const initBalance = bots[0]?.initial_balance ?? 10000;
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
          tension: 0,
          fill: false,
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
        tension: 0,
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
        display: true,
        labels: {
          boxWidth: 20,
          padding: 14,
          font: { size: 10 },
          usePointStyle: true,
          pointStyle: 'line',
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const d = new Date(items[0].parsed.x as number);
            return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          },
          label: (c) =>
            ` ${c.dataset.label}: $${Number(c.parsed.y).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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

  const allSel = pnlBotFilter.size === 0;

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
                onClick={() => setBalanceTf(tf)}
              >
                {tf === 'M5' ? '5m' : tf === 'M15' ? '15m' : '1h'}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-600 hidden sm:block">click to toggle</span>
        </div>
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
              </button>
            );
          })}
        </div>
      </div>
      <div className="h-[480px]">
        <Line data={{ datasets }} options={options} plugins={[endLabelPlugin]} />
      </div>
    </div>
  );
}
