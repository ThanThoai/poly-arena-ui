'use client';

import { useMemo, useState } from 'react';
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
import { BOT_PALETTE, money, pnlCls, parseUTC } from '@/lib/helpers';
import CustomSelect from '@/components/ui/custom-select';
import PositionsTable from '@/components/positions-table';
import TradeHistory from '@/components/trade-history';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const RADAR_SYMS = ['BTC', 'ETH', 'SOL', 'XRP'];
const RADAR_TFS = [
  { label: '5m', val: 'M5' },
  { label: '15m', val: 'M15' },
  { label: '1h', val: 'H1' },
];

const ICT_SESSIONS = [
  { label: 'Asia', fromUTC: 0, toUTC: 8 },
  { label: 'London', fromUTC: 8, toUTC: 13 },
  { label: 'New York', fromUTC: 13, toUTC: 21 },
  { label: 'Off-hours', fromUTC: 21, toUTC: 24 },
];

function getICTSession(utcHour: number): string {
  for (const s of ICT_SESSIONS) {
    if (utcHour >= s.fromUTC && utcHour < s.toUTC) return s.label;
  }
  return 'Off-hours';
}

/** Convert a UTC hour (0–24) to local hour string HH:00 */
function utcHourToLocal(utcH: number): string {
  const d = new Date();
  d.setUTCHours(utcH % 24, 0, 0, 0);
  return String(d.getHours()).padStart(2, '0') + ':00';
}

function localOffsetLabel(): string {
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

interface ReportPageProps {
  trades: Trade[];
  bots: Bot[];
}

export default function ReportPage({ trades, bots }: ReportPageProps) {
  const botNames = useMemo(() => bots.map((b) => b.bot_name).sort(), [bots]);
  const [selectedBot, setSelectedBot] = useState('');

  const botTrades = useMemo(
    () => (selectedBot ? trades.filter((t) => t.bot_name === selectedBot) : []),
    [trades, selectedBot],
  );
  const settled = useMemo(() => botTrades.filter((t) => t.result !== 'PENDING'), [botTrades]);

  // KPIs
  const wins = settled.filter((t) => t.result === 'WIN').length;
  const losses = settled.filter((t) => t.result === 'LOSS').length;
  const cancelled = settled.filter((t) => t.result === 'CANCELLED').length;
  const total = settled.length;
  const wr = total - cancelled > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '—';
  const pnl = settled.reduce((s, t) => s + (t.profit || 0), 0);
  const avg = wins + losses > 0 ? pnl / (wins + losses) : 0;

  // By Day
  const byDay = useMemo(() => {
    const map: Record<string, { wins: number; losses: number; cancelled: number }> = {};
    settled.forEach((t) => {
      const d = parseUTC(t.created_at);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { wins: 0, losses: 0, cancelled: 0 };
      if (t.result === 'WIN') map[key].wins++;
      else if (t.result === 'LOSS') map[key].losses++;
      else map[key].cancelled++;
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, v]) => ({ date, ...v, total: v.wins + v.losses, wr: v.wins + v.losses > 0 ? ((v.wins / (v.wins + v.losses)) * 100).toFixed(1) + '%' : '—' }));
  }, [settled]);

  // By ICT Session
  const bySession = useMemo(() => {
    const map: Record<string, { wins: number; losses: number; cancelled: number }> = {};
    ICT_SESSIONS.forEach((s) => (map[s.label] = { wins: 0, losses: 0, cancelled: 0 }));
    settled.forEach((t) => {
      const d = parseUTC(t.created_at);
      if (!d) return;
      const session = getICTSession(d.getUTCHours());
      if (t.result === 'WIN') map[session].wins++;
      else if (t.result === 'LOSS') map[session].losses++;
      else map[session].cancelled++;
    });
    return ICT_SESSIONS.map((s) => {
      const v = map[s.label];
      const tot = v.wins + v.losses;
      return { label: s.label, hours: `${utcHourToLocal(s.fromUTC)}–${utcHourToLocal(s.toUTC)}`, ...v, total: tot, wr: tot > 0 ? ((v.wins / tot) * 100).toFixed(1) + '%' : '—' };
    });
  }, [settled]);

  // By Timeframe
  const byTimeframe = useMemo(() => {
    return ['M5', 'M15', 'H1'].map((tf) => {
      const sub = settled.filter((t) => t.timeframe === tf);
      const w = sub.filter((t) => t.result === 'WIN').length;
      const l = sub.filter((t) => t.result === 'LOSS').length;
      const tot = w + l;
      const p = sub.reduce((s, t) => s + (t.profit || 0), 0);
      return { tf, wins: w, losses: l, total: tot, pnl: p, wr: tot > 0 ? ((w / tot) * 100).toFixed(1) + '%' : '—' };
    });
  }, [settled]);

  // Radar
  const radarLabels: string[] = [];
  for (const sym of RADAR_SYMS) for (const tf of RADAR_TFS) radarLabels.push(`${sym}\u00B7${tf.label}`);

  const botColor = selectedBot
    ? BOT_PALETTE[botNames.indexOf(selectedBot) % BOT_PALETTE.length]
    : '#7b9fff';

  const radarData = useMemo(() => {
    const data: number[] = [];
    for (const sym of RADAR_SYMS) {
      for (const tf of RADAR_TFS) {
        const sub = settled.filter((t) => t.symbol === sym && t.timeframe === tf.val);
        const w = sub.filter((t) => t.result === 'WIN').length;
        data.push(sub.length ? +((w / sub.length) * 100).toFixed(1) : 0);
      }
    }
    return data;
  }, [settled]);

  const radarOptions: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
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

  // Filtered trades/bots for sub-components
  const filteredTrades = useMemo(
    () => (selectedBot ? trades.filter((t) => t.bot_name === selectedBot) : trades),
    [trades, selectedBot],
  );
  const filteredBots = useMemo(
    () => (selectedBot ? bots.filter((b) => b.bot_name === selectedBot) : bots),
    [bots, selectedBot],
  );

  return (
    <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
      {/* Bot Selector */}
      <div className="card p-4 flex items-center gap-3">
        <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Report for</span>
        <CustomSelect
          placeholder="Select a bot"
          options={[{ value: '', label: 'All Bots' }, ...botNames.map((n) => ({ value: n, label: n }))]}
          value={selectedBot}
          onChange={setSelectedBot}
          searchable
          minWidth="180px"
        />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Win Rate" value={wr === '—' ? '—' : wr + '%'} cls="text-emerald-400" />
        <KpiCard label="Total Trades" value={String(total)} sub={`${wins}W / ${losses}L / ${cancelled}C`} cls="text-slate-200" />
        <KpiCard label="P&L" value={money(pnl)} cls={pnlCls(pnl)} />
        <KpiCard label="Avg / Trade" value={money(avg)} cls={pnlCls(avg)} />
        <KpiCard label="Win / Loss" value={losses > 0 ? (wins / losses).toFixed(2) : wins > 0 ? '∞' : '—'} cls="text-sky-400" />
      </div>

      {/* Two columns: By Day | By ICT Session */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By Day */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a1a2a]">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">By Day</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">W</th>
                  <th className="px-4 py-2 text-right font-medium">L</th>
                  <th className="px-4 py-2 text-right font-medium">C</th>
                  <th className="px-4 py-2 text-right font-medium">WR</th>
                </tr>
              </thead>
              <tbody>
                {byDay.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-600">No data</td></tr>
                ) : byDay.map((r) => (
                  <tr key={r.date} className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60">
                    <td className="px-4 py-2 text-slate-300 font-mono">{r.date}</td>
                    <td className="px-4 py-2 text-right text-emerald-400">{r.wins}</td>
                    <td className="px-4 py-2 text-right text-rose-400">{r.losses}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{r.cancelled}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-200">{r.wr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By ICT Session */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a1a2a]">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">By ICT Session</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
                  <th className="px-4 py-2 text-left font-medium">Session</th>
                  <th className="px-4 py-2 text-left font-medium">Hours ({localOffsetLabel()})</th>
                  <th className="px-4 py-2 text-right font-medium">W</th>
                  <th className="px-4 py-2 text-right font-medium">L</th>
                  <th className="px-4 py-2 text-right font-medium">WR</th>
                </tr>
              </thead>
              <tbody>
                {bySession.map((r) => (
                  <tr key={r.label} className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60">
                    <td className="px-4 py-2 text-slate-300 font-semibold">{r.label}</td>
                    <td className="px-4 py-2 text-slate-500 font-mono text-[10px]">{r.hours}</td>
                    <td className="px-4 py-2 text-right text-emerald-400">{r.wins}</td>
                    <td className="px-4 py-2 text-right text-rose-400">{r.losses}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-200">{r.wr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* By Timeframe */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {byTimeframe.map((tf) => (
          <div key={tf.tf} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{tf.tf === 'M5' ? '5 min' : tf.tf === 'M15' ? '15 min' : '1 hour'}</span>
              <span className="text-sm font-bold text-slate-200">{tf.wr}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-400">{tf.wins}W</span>
              <span className="text-rose-400">{tf.losses}L</span>
              <span className="text-slate-500">{tf.total} total</span>
              <span className={`ml-auto font-semibold ${pnlCls(tf.pnl)}`}>{money(tf.pnl)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Radar Chart */}
      {selectedBot && settled.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full" style={{ background: botColor }} />
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest">
              Win Rate by Symbol &times; Timeframe
            </h3>
          </div>
          <div style={{ height: 320, position: 'relative' }}>
            <Radar
              data={{
                labels: radarLabels,
                datasets: [{
                  label: selectedBot,
                  data: radarData,
                  borderColor: botColor,
                  backgroundColor: botColor + '22',
                  borderWidth: 1.5,
                  pointRadius: 3,
                  pointBackgroundColor: botColor,
                  pointBorderColor: botColor,
                }],
              }}
              options={radarOptions}
            />
          </div>
        </div>
      )}

      {/* Open Positions */}
      <PositionsTable trades={filteredTrades} bots={filteredBots} />

      {/* Trade History */}
      <TradeHistory trades={filteredTrades} bots={filteredBots} />
    </main>
  );
}

function KpiCard({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls: string }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`font-bold text-lg ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}
