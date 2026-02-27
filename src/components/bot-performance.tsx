'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { Trade, Bot } from '@/lib/api';
import { BOT_PALETTE, money, pnlCls } from '@/lib/helpers';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const RADAR_SYMS = ['BTC', 'ETH', 'SOL', 'XRP'];
const RADAR_TFS = [
  { label: '5m', val: 'M5' },
  { label: '15m', val: 'M15' },
  { label: '1h', val: 'H1' },
];

interface BotPerformanceProps {
  selectedBots: string[];
  trades: Trade[];
  bots: Bot[];
  onClose: () => void;
}

export default function BotPerformance({ selectedBots, trades, bots, onClose }: BotPerformanceProps) {
  const allBotNames = useMemo(() => bots.map((b) => b.bot_name).sort(), [bots]);

  if (!selectedBots.length) return null;

  const color0 = BOT_PALETTE[allBotNames.indexOf(selectedBots[0]) % BOT_PALETTE.length];

  const labels: string[] = [];
  for (const sym of RADAR_SYMS) for (const tf of RADAR_TFS) labels.push(`${sym}\u00B7${tf.label}`);

  const datasets = selectedBots.map((botName) => {
    const color = BOT_PALETTE[allBotNames.indexOf(botName) % BOT_PALETTE.length];
    const bt = trades.filter((t) => t.bot_name === botName && t.result !== 'PENDING');
    const data: number[] = [];
    for (const sym of RADAR_SYMS) {
      for (const tf of RADAR_TFS) {
        const sub = bt.filter((t) => t.symbol === sym && t.timeframe === tf.val);
        const w = sub.filter((t) => t.result === 'WIN').length;
        data.push(sub.length ? +((w / sub.length) * 100).toFixed(1) : 0);
      }
    }
    return {
      label: botName,
      data,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 1.5,
      pointRadius: 3,
      pointBackgroundColor: color,
      pointBorderColor: color,
    };
  });

  const options: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: selectedBots.length > 1,
        labels: { color: '#64748b', font: { size: 10 }, boxWidth: 10, padding: 12, usePointStyle: true },
      },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw}%` } },
    },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, display: false },
        grid: { color: '#1f1f32' },
        angleLines: { color: '#1f1f32' },
        pointLabels: { color: '#64748b', font: { size: 10 } },
      },
    },
  };

  return (
    <div className="card p-5 perf-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color0 }} />
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest">
            {selectedBots.length === 1 ? selectedBots[0] : `${selectedBots.length} Bots`}
          </h3>
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors text-lg leading-none">
          &#10005;
        </button>
      </div>

      <div className="space-y-2 mb-5">
        {selectedBots.map((botName) => {
          const color = BOT_PALETTE[allBotNames.indexOf(botName) % BOT_PALETTE.length];
          const bt = trades.filter((t) => t.bot_name === botName && t.result !== 'PENDING');
          const w = bt.filter((t) => t.result === 'WIN').length;
          const l = bt.filter((t) => t.result === 'LOSS').length;
          const tot = w + l;
          const pnl = bt.reduce((s, t) => s + (t.profit || 0), 0);
          const avg = tot ? pnl / tot : 0;
          const wr = tot ? (((w / tot) * 100).toFixed(1) + '%') : '\u2014';

          return (
            <div key={botName} className="card-sm px-3 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5">
              <div className="flex items-center gap-1.5 w-28 shrink-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="font-semibold text-xs text-slate-200 truncate">{botName}</span>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Win Rate</p>
                <p className="font-bold text-sm text-emerald-400">{wr}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Trades</p>
                <p className="font-bold text-sm text-slate-200">{tot}</p>
                <p className="text-[10px] text-slate-600">{w}W / {l}L</p>
              </div>
              <div className="ml-auto">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">P&amp;L</p>
                <p className={`font-bold text-sm ${pnlCls(pnl)}`}>{money(pnl)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Avg/Trade</p>
                <p className={`font-bold text-sm ${pnlCls(avg)}`}>{money(avg)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 280, position: 'relative' }}>
        <Radar data={{ labels, datasets }} options={options} />
      </div>
    </div>
  );
}
