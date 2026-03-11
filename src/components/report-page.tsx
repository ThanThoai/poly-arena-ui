'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Trade, Bot, BotPnl, BalanceHistoryGrouped, BotAchievement, fetchBotOrderHistory } from '@/lib/api';
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

/* ── Stat computation helpers ── */

interface BotStats {
  wins: number;
  losses: number;
  cancelled: number;
  total: number;
  wr: string;
  pnl: number;
  avg: number;
  wlRatio: string;
}

function computeBotStats(settled: Trade[]): BotStats {
  const wins = settled.filter((t) => t.result === 'WIN').length;
  const losses = settled.filter((t) => t.result === 'LOSS').length;
  const cancelled = settled.filter((t) => t.result === 'CANCELLED').length;
  const total = settled.length;
  const wr = total - cancelled > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '—';
  const pnl = settled.reduce((s, t) => s + (t.profit || 0) - (t.entry_fee || 0), 0);
  const avg = wins + losses > 0 ? pnl / (wins + losses) : 0;
  const wlRatio = losses > 0 ? (wins / losses).toFixed(2) : wins > 0 ? '∞' : '—';
  return { wins, losses, cancelled, total, wr, pnl, avg, wlRatio };
}

interface DayBotRow { bot_name: string; wins: number; losses: number; pnl: number; fees: number; sessions: number }
interface DayRow { date: string; wins: number; losses: number; cancelled: number; total: number; pnl: number; fees: number; wr: string; bots: DayBotRow[] }

function computeByDayFromLedger(groups: BalanceHistoryGrouped[], selectedBot: string): DayRow[] {
  const map: Record<string, { wins: number; losses: number; pnl: number; fees: number; botMap: Record<string, DayBotRow> }> = {};
  for (const group of groups) {
    const d = parseUTC(group.settled_at);
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    if (!map[key]) map[key] = { wins: 0, losses: 0, pnl: 0, fees: 0, botMap: {} };
    const day = map[key];
    for (const entry of group.bots) {
      if (selectedBot && entry.bot_name !== selectedBot) continue;
      day.wins += entry.win_count ?? 0;
      day.losses += entry.loss_count ?? 0;
      day.pnl += entry.delta;
      day.fees += entry.total_fee;
      if (!day.botMap[entry.bot_name]) {
        day.botMap[entry.bot_name] = { bot_name: entry.bot_name, wins: 0, losses: 0, pnl: 0, fees: 0, sessions: 0 };
      }
      const b = day.botMap[entry.bot_name];
      b.wins += entry.win_count ?? 0;
      b.losses += entry.loss_count ?? 0;
      b.pnl += entry.delta;
      b.fees += entry.total_fee;
      b.sessions += 1;
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, v]) => {
      const decided = v.wins + v.losses;
      const bots = Object.values(v.botMap).sort((a, b) => b.pnl - a.pnl);
      return { date, wins: v.wins, losses: v.losses, cancelled: 0, total: decided, pnl: v.pnl, fees: v.fees, wr: decided > 0 ? ((v.wins / decided) * 100).toFixed(1) + '%' : '\u2014', bots };
    });
}

function computeByDayFromTrades(settled: Trade[]): DayRow[] {
  const map: Record<string, { wins: number; losses: number; cancelled: number; pnl: number; fees: number; botMap: Record<string, DayBotRow> }> = {};
  settled.forEach((t) => {
    const d = parseUTC(t.created_at);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    if (!map[key]) map[key] = { wins: 0, losses: 0, cancelled: 0, pnl: 0, fees: 0, botMap: {} };
    const day = map[key];
    const tradePnl = (t.profit || 0) - (t.entry_fee || 0);
    if (t.result === 'WIN') { day.wins++; }
    else if (t.result === 'LOSS') { day.losses++; }
    else { day.cancelled++; }
    day.pnl += tradePnl;
    day.fees += t.entry_fee || 0;
    const bn = t.bot_name;
    if (!day.botMap[bn]) day.botMap[bn] = { bot_name: bn, wins: 0, losses: 0, pnl: 0, fees: 0, sessions: 0 };
    const b = day.botMap[bn];
    if (t.result === 'WIN') b.wins++;
    else if (t.result === 'LOSS') b.losses++;
    b.pnl += tradePnl;
    b.fees += t.entry_fee || 0;
  });
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, v]) => {
      const decided = v.wins + v.losses;
      const bots = Object.values(v.botMap).sort((a, b) => b.pnl - a.pnl);
      return { date, ...v, total: decided, wr: decided > 0 ? ((v.wins / decided) * 100).toFixed(1) + '%' : '\u2014', bots };
    });
}

interface SessionRow { label: string; hours: string; wins: number; losses: number; cancelled: number; total: number; wr: string }

function computeBySession(settled: Trade[]): SessionRow[] {
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
}

interface TfRow { tf: string; wins: number; losses: number; total: number; pnl: number; wr: string }

function computeByTimeframe(settled: Trade[]): TfRow[] {
  return ['M5', 'M15', 'H1'].map((tf) => {
    const sub = settled.filter((t) => t.timeframe === tf);
    const w = sub.filter((t) => t.result === 'WIN').length;
    const l = sub.filter((t) => t.result === 'LOSS').length;
    const tot = w + l;
    const p = sub.reduce((s, t) => s + (t.profit || 0) - (t.entry_fee || 0), 0);
    return { tf, wins: w, losses: l, total: tot, pnl: p, wr: tot > 0 ? ((w / tot) * 100).toFixed(1) + '%' : '—' };
  });
}

interface MarketSessionRow {
  symbol: string;
  tf: string;
  forecast: string;
  wins: number;
  losses: number;
  candles: number;
  pnl: number;
  wr: string;
  trades: number;
}

function computeByMarketSession(allTrades: Trade[]): MarketSessionRow[] {
  // Only count WIN/LOSS trades — skip CANCELLED/PENDING
  const decided = allTrades.filter((t) => t.result === 'WIN' || t.result === 'LOSS');

  // Group by (symbol, tf, forecast) → then by unique candle (candle_open)
  const groupMap: Record<string, Map<number, { result: string; pnl: number; count: number }>> = {};
  for (const t of decided) {
    const groupKey = `${t.symbol}|${t.timeframe}|${t.forecast}`;
    if (!groupMap[groupKey]) groupMap[groupKey] = new Map();
    const candleKey = t.candle_open ?? 0;
    const existing = groupMap[groupKey].get(candleKey);
    if (!existing) {
      groupMap[groupKey].set(candleKey, { result: t.result!, pnl: (t.profit || 0) - (t.entry_fee || 0), count: 1 });
    } else {
      existing.pnl += (t.profit || 0) - (t.entry_fee || 0);
      existing.count++;
    }
  }
  return Object.entries(groupMap)
    .map(([key, candles]) => {
      const [symbol, tf, forecast] = key.split('|');
      let wins = 0, losses = 0, pnl = 0, trades = 0;
      for (const c of candles.values()) {
        if (c.result === 'WIN') wins++;
        else losses++;
        pnl += c.pnl;
        trades += c.count;
      }
      const total = wins + losses;
      return {
        symbol, tf, forecast,
        wins, losses, candles: total, pnl, trades,
        wr: total > 0 ? ((wins / total) * 100).toFixed(1) + '%' : '—',
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.tf.localeCompare(b.tf) || a.forecast.localeCompare(b.forecast));
}

function computeRadarData(settled: Trade[]): number[] {
  const data: number[] = [];
  for (const sym of RADAR_SYMS) {
    for (const tf of RADAR_TFS) {
      const sub = settled.filter((t) => t.symbol === sym && t.timeframe === tf.val);
      const w = sub.filter((t) => t.result === 'WIN').length;
      data.push(sub.length ? +((w / sub.length) * 100).toFixed(1) : 0);
    }
  }
  return data;
}

const radarLabels: string[] = [];
for (const sym of RADAR_SYMS) for (const tf of RADAR_TFS) radarLabels.push(`${sym}\u00B7${tf.label}`);

const RADAR_OPTIONS: ChartOptions<'radar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 } } },
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

/* ── Per-bot computed data bundle ── */

interface BotCompareData {
  name: string;
  color: string;
  stats: BotStats;
  byDay: DayRow[];
  bySession: SessionRow[];
  byTf: TfRow[];
  radarData: number[];
}

/* ── Multi-bot Compare View ── */

function CompareView({ botsData }: { botsData: BotCompareData[] }) {
  const n = botsData.length;

  // KPI rows — highlight the best value in each metric
  const kpiMetrics: { label: string; values: string[]; numericValues: number[]; higherIsBetter: boolean }[] = [
    {
      label: 'Win Rate',
      values: botsData.map((b) => b.stats.wr === '—' ? '—' : b.stats.wr + '%'),
      numericValues: botsData.map((b) => b.stats.wr === '—' ? -Infinity : parseFloat(b.stats.wr)),
      higherIsBetter: true,
    },
    {
      label: 'Total Trades',
      values: botsData.map((b) => String(b.stats.total)),
      numericValues: botsData.map((b) => b.stats.total),
      higherIsBetter: true,
    },
    {
      label: 'P&L',
      values: botsData.map((b) => money(b.stats.pnl)),
      numericValues: botsData.map((b) => b.stats.pnl),
      higherIsBetter: true,
    },
    {
      label: 'Avg / Trade',
      values: botsData.map((b) => money(b.stats.avg)),
      numericValues: botsData.map((b) => b.stats.avg),
      higherIsBetter: true,
    },
    {
      label: 'W/L Ratio',
      values: botsData.map((b) => b.stats.wlRatio),
      numericValues: botsData.map((b) => b.stats.wlRatio === '∞' ? 999 : b.stats.wlRatio === '—' ? -Infinity : parseFloat(b.stats.wlRatio)),
      higherIsBetter: true,
    },
  ];

  // Merge all dates across bots
  const allDates = useMemo(() => {
    const set = new Set<string>();
    botsData.forEach((b) => b.byDay.forEach((r) => set.add(r.date)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [botsData]);

  return (
    <>
      {/* KPI Comparison Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1a2a]">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">KPI Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
                <th className="px-4 py-2 text-left font-medium">Metric</th>
                {botsData.map((b) => (
                  <th key={b.name} className="px-4 py-2 text-right font-medium whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: b.color }} />
                    {b.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpiMetrics.map((m) => {
                const best = Math.max(...m.numericValues.filter((v) => v !== -Infinity));
                const hasBest = m.numericValues.filter((v) => v === best).length === 1 && best !== -Infinity;
                return (
                  <tr key={m.label} className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60">
                    <td className="px-4 py-2 text-slate-400 font-medium">{m.label}</td>
                    {m.values.map((v, i) => (
                      <td key={i} className={`px-4 py-2 text-right font-semibold ${hasBest && m.numericValues[i] === best ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Timeframe comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {['M5', 'M15', 'H1'].map((tf, tfIdx) => (
          <div key={tf} className="card p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
              {tf === 'M5' ? '5 min' : tf === 'M15' ? '15 min' : '1 hour'}
            </div>
            <div className="space-y-2 text-xs">
              {botsData.map((b) => {
                const row = b.byTf[tfIdx];
                return (
                  <div key={b.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="shrink-0 ml-2">
                      <span className="text-emerald-400">{row.wins}W</span>{' '}
                      <span className="text-rose-400">{row.losses}L</span>{' '}
                      <span className="text-slate-400 font-semibold ml-1">{row.wr}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Radar overlay */}
      {botsData.some((b) => b.radarData.some((v) => v > 0)) && (
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-widest mb-4">
            Win Rate by Symbol &times; Timeframe
          </h3>
          <div style={{ height: 320, position: 'relative' }}>
            <Radar
              data={{
                labels: radarLabels,
                datasets: botsData.map((b) => ({
                  label: b.name,
                  data: b.radarData,
                  borderColor: b.color,
                  backgroundColor: b.color + '22',
                  borderWidth: 1.5,
                  pointRadius: 3,
                  pointBackgroundColor: b.color,
                  pointBorderColor: b.color,
                })),
              }}
              options={RADAR_OPTIONS}
            />
          </div>
        </div>
      )}

      {/* By Day comparison */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1a2a]">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">By Day</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
                <th className="px-4 py-2 text-left font-medium" rowSpan={2}>Date</th>
                {botsData.map((b) => (
                  <th key={b.name} className="px-2 py-2 text-right font-medium whitespace-nowrap" colSpan={2}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: b.color }} />
                    {b.name}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] text-slate-600 border-b border-[#1a1a2a] uppercase tracking-wide">
                {botsData.map((b) => (
                  <React.Fragment key={b.name}>
                    <th className="px-2 py-1 text-right font-medium">W/L</th>
                    <th className="px-2 py-1 text-right font-medium">WR</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDates.length === 0 ? (
                <tr><td colSpan={1 + n * 2} className="px-4 py-6 text-center text-slate-600">No data</td></tr>
              ) : allDates.map((date) => (
                <tr key={date} className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60">
                  <td className="px-4 py-2 text-slate-300 font-mono">{date}</td>
                  {botsData.map((b) => {
                    const row = b.byDay.find((r) => r.date === date);
                    return (
                      <React.Fragment key={b.name}>
                        <td className="px-2 py-2 text-right">
                          {row ? <><span className="text-emerald-400">{row.wins}</span>/<span className="text-rose-400">{row.losses}</span></> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-200">{row?.wr ?? '—'}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By ICT Session comparison */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1a2a]">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">By ICT Session</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
                <th className="px-4 py-2 text-left font-medium" rowSpan={2}>Session</th>
                <th className="px-4 py-2 text-left font-medium" rowSpan={2}>Hours</th>
                {botsData.map((b) => (
                  <th key={b.name} className="px-2 py-2 text-right font-medium whitespace-nowrap" colSpan={2}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: b.color }} />
                    {b.name}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] text-slate-600 border-b border-[#1a1a2a] uppercase tracking-wide">
                {botsData.map((b) => (
                  <React.Fragment key={b.name}>
                    <th className="px-2 py-1 text-right font-medium">W/L</th>
                    <th className="px-2 py-1 text-right font-medium">WR</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {ICT_SESSIONS.map((s, sIdx) => (
                <tr key={s.label} className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60">
                  <td className="px-4 py-2 text-slate-300 font-semibold">{s.label}</td>
                  <td className="px-4 py-2 text-slate-500 font-mono text-[10px]">
                    {utcHourToLocal(s.fromUTC)}–{utcHourToLocal(s.toUTC)}
                  </td>
                  {botsData.map((b) => {
                    const row = b.bySession[sIdx];
                    return (
                      <React.Fragment key={b.name}>
                        <td className="px-2 py-2 text-right">
                          <span className="text-emerald-400">{row.wins}</span>/<span className="text-rose-400">{row.losses}</span>
                        </td>
                        <td className="px-2 py-2 text-right text-slate-200">{row.wr}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ── Main Report Page ── */

const TIER_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string; glow: string }> = {
  BRONZE:   { bg: '#1a1408', border: '#3d2e0a', text: '#cd7f32', icon: '\uD83E\uDD49', glow: 'rgba(205,127,50,.08)' },
  SILVER:   { bg: '#121418', border: '#2a2e38', text: '#c0c0c0', icon: '\uD83E\uDD48', glow: 'rgba(192,192,192,.08)' },
  GOLD:     { bg: '#1a1608', border: '#3d360a', text: '#ffd700', icon: '\uD83E\uDD47', glow: 'rgba(255,215,0,.08)' },
  PLATINUM: { bg: '#0f1218', border: '#1e2a3e', text: '#a8e0ff', icon: '\uD83D\uDC8E', glow: 'rgba(168,224,255,.1)' },
};

function AchievementShowcase({ achievements }: { achievements: BotAchievement[] }) {
  if (achievements.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Achievements</h3>
        <p className="text-sm text-slate-600">No achievements earned yet. Keep trading!</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a2a] flex items-center gap-2">
        <span className="text-base">{'\uD83C\uDFC6'}</span>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Achievements
        </h3>
        <span className="ml-auto text-[10px] text-slate-600 font-mono">{achievements.length} earned</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {achievements.map((ach) => {
          const cfg = TIER_CONFIG[ach.tier] || TIER_CONFIG.BRONZE;
          const earned = ach.earned_at ? new Date(ach.earned_at) : null;
          return (
            <div
              key={ach.id}
              className="card-sm p-3.5 transition-all hover:scale-[1.02]"
              style={{ borderColor: cfg.border, boxShadow: `0 0 20px ${cfg.glow}` }}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  {cfg.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider" style={{ color: cfg.text, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      {ach.tier}
                    </span>
                    <span className="text-[9px] text-slate-600 truncate">{ach.slug}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-200 truncate" title={ach.name}>{ach.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{ach.description}</p>
                  {earned && (
                    <p className="text-[9px] text-slate-600 mt-1 font-mono">
                      {earned.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                      {earned.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ReportPageProps {
  trades: Trade[];
  bots: Bot[];
  botPnls?: BotPnl[];
  balanceHistoryGrouped?: BalanceHistoryGrouped[];
  botAchievements?: Record<number, BotAchievement[]>;
}

export default function ReportPage({ trades, bots, botPnls = [], balanceHistoryGrouped = [], botAchievements = {} }: ReportPageProps) {
  const botNames = useMemo(() => bots.map((b) => b.bot_name).sort(), [bots]);
  const [selectedBot, setSelectedBot] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [compareBots, setCompareBots] = useState<string[]>([]);

  const botTrades = useMemo(
    () => (selectedBot ? trades.filter((t) => t.bot_name === selectedBot) : trades),
    [trades, selectedBot],
  );
  const settled = useMemo(() => botTrades.filter((t) => t.result !== 'PENDING'), [botTrades]);

  // KPIs (single-bot mode) — P&L based on current_balance - initial_balance
  const stats = useMemo(() => {
    const base = computeBotStats(settled);
    // Override P&L: use balance-based calculation
    const targetBots = selectedBot ? bots.filter((b) => b.bot_name === selectedBot) : bots;
    const pnlMap = new Map<string, BotPnl>();
    for (const p of botPnls) pnlMap.set(p.bot_name, p);
    let totalPnl = 0;
    for (const bot of targetBots) {
      const bp = pnlMap.get(bot.bot_name);
      const equity = bp?.current_balance ?? bot.balance;
      totalPnl += equity - bot.initial_balance;
    }
    const decided = base.wins + base.losses;
    return { ...base, pnl: totalPnl, avg: decided > 0 ? totalPnl / decided : 0 };
  }, [settled, bots, botPnls, selectedBot]);

  // By Day — prefer ledger, fallback to trades
  const byDay = useMemo(() => {
    if (balanceHistoryGrouped.length > 0) return computeByDayFromLedger(balanceHistoryGrouped, selectedBot);
    return computeByDayFromTrades(settled);
  }, [settled, balanceHistoryGrouped, selectedBot]);

  // By ICT Session
  const bySession = useMemo(() => computeBySession(settled), [settled]);

  // By Timeframe
  const byTimeframe = useMemo(() => computeByTimeframe(settled), [settled]);

  // By Market Session (symbol × timeframe × forecast)
  const byMarketSession = useMemo(() => computeByMarketSession(settled), [settled]);

  // Radar
  const botColor = selectedBot
    ? BOT_PALETTE[botNames.indexOf(selectedBot) % BOT_PALETTE.length]
    : '#7b9fff';

  const radarData = useMemo(() => computeRadarData(settled), [settled]);

  const singleRadarOptions: ChartOptions<'radar'> = {
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

  // Fetch ALL orders for the selected bot (dashboard only has 500 latest across all bots)
  const [botAllTrades, setBotAllTrades] = useState<Trade[]>([]);
  const [botAllTradesLoading, setBotAllTradesLoading] = useState(false);
  const [botAllTradesName, setBotAllTradesName] = useState('');

  useEffect(() => {
    if (!selectedBot) {
      setBotAllTrades([]);
      setBotAllTradesName('');
      return;
    }
    // Skip re-fetch if same bot
    if (selectedBot === botAllTradesName && botAllTrades.length > 0) return;
    let cancelled = false;
    setBotAllTradesLoading(true);
    fetchBotOrderHistory({ bot_name: selectedBot, limit: 5000 })
      .then((res) => {
        if (cancelled) return;
        setBotAllTrades(res.orders);
        setBotAllTradesName(selectedBot);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback to filtered dashboard trades
        setBotAllTrades([]);
        setBotAllTradesName('');
      })
      .finally(() => { if (!cancelled) setBotAllTradesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use fetched bot trades if available, else fallback to dashboard filtered trades
  const tradesForHistory = selectedBot && botAllTradesName === selectedBot && botAllTrades.length > 0
    ? botAllTrades
    : filteredTrades;

  // Compare mode — compute data for each selected bot
  const botsCompareData: BotCompareData[] = useMemo(() => {
    if (!compareMode) return [];
    return compareBots.map((name) => {
      const botSettled = trades.filter((t) => t.bot_name === name && t.result !== 'PENDING');
      const color = BOT_PALETTE[botNames.indexOf(name) % BOT_PALETTE.length];
      return {
        name,
        color,
        stats: computeBotStats(botSettled),
        byDay: computeByDayFromTrades(botSettled),
        bySession: computeBySession(botSettled),
        byTf: computeByTimeframe(botSettled),
        radarData: computeRadarData(botSettled),
      };
    });
  }, [compareMode, compareBots, trades, botNames]);

  // Bots available to add in compare mode (not already selected)
  const availableForCompare = useMemo(
    () => botNames.filter((n) => !compareBots.includes(n)),
    [botNames, compareBots],
  );

  const handleEnterCompare = () => {
    setCompareMode(true);
    setCompareBots(selectedBot ? [selectedBot] : botNames.length > 0 ? [botNames[0]] : []);
  };

  const handleExitCompare = () => {
    setCompareMode(false);
    setCompareBots([]);
  };

  const addCompareBot = (name: string) => {
    if (name && !compareBots.includes(name)) {
      setCompareBots([...compareBots, name]);
    }
  };

  const removeCompareBot = (name: string) => {
    setCompareBots(compareBots.filter((b) => b !== name));
  };

  return (
    <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
      {/* Header Bar */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        {!compareMode ? (
          <>
            <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Report for</span>
            <CustomSelect
              placeholder="Select a bot"
              options={[{ value: '', label: 'All Bots' }, ...botNames.map((n) => ({ value: n, label: n }))]}
              value={selectedBot}
              onChange={setSelectedBot}
              searchable
              minWidth="180px"
            />
            {botNames.length >= 2 && (
              <button
                onClick={handleEnterCompare}
                className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-md border border-[#2a2a3e] text-slate-400 hover:text-slate-200 hover:border-[#3a3a5e] transition-colors"
              >
                Compare
              </button>
            )}
          </>
        ) : (
          <>
            <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold shrink-0">Compare</span>

            {/* Selected bot chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {compareBots.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-[#2a2a3e] text-slate-300"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: BOT_PALETTE[botNames.indexOf(name) % BOT_PALETTE.length] }}
                  />
                  {name}
                  <button
                    onClick={() => removeCompareBot(name)}
                    className="ml-0.5 text-slate-500 hover:text-slate-200 transition-colors"
                  >
                    &times;
                  </button>
                </span>
              ))}

              {/* Add bot dropdown */}
              {availableForCompare.length > 0 && (
                <CustomSelect
                  placeholder="+ Add bot"
                  options={availableForCompare.map((n) => ({ value: n, label: n }))}
                  value=""
                  onChange={(val) => addCompareBot(val)}
                  searchable
                  minWidth="130px"
                />
              )}
            </div>

            <button
              onClick={handleExitCompare}
              className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-md border border-[#2a2a3e] text-slate-400 hover:text-slate-200 hover:border-[#3a3a5e] transition-colors shrink-0"
            >
              Exit Compare
            </button>
          </>
        )}
      </div>

      {/* Compare Mode */}
      {compareMode && (
        <>
          {botsCompareData.length >= 2 ? (
            <CompareView botsData={botsCompareData} />
          ) : (
            <div className="card p-8 text-center text-slate-500 text-sm">
              Select at least 2 bots to compare their performance
            </div>
          )}
        </>
      )}

      {/* Single-bot mode */}
      {!compareMode && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Win Rate" value={stats.wr === '—' ? '—' : stats.wr + '%'} cls="text-emerald-400" />
            <KpiCard label="Total Trades" value={String(stats.total)} sub={`${stats.wins}W / ${stats.losses}L / ${stats.cancelled}C`} cls="text-slate-200" />
            <KpiCard label="P&L" value={money(stats.pnl)} cls={pnlCls(stats.pnl)} />
            <KpiCard label="Avg / Trade" value={money(stats.avg)} cls={pnlCls(stats.avg)} />
            <KpiCard label="Win / Loss" value={stats.wlRatio} cls="text-sky-400" />
          </div>

          {/* Per-bot summary table (All Bots) */}
          {!selectedBot && bots.length > 1 && (
            <BotSummaryTable trades={trades} bots={bots} botNames={botNames} botPnls={botPnls} balanceHistoryGrouped={balanceHistoryGrouped} />
          )}

          {/* Achievements */}
          {selectedBot && (() => {
            const bot = bots.find((b) => b.bot_name === selectedBot);
            const achs = bot ? (botAchievements[bot.id] || []) : [];
            return <AchievementShowcase achievements={achs} />;
          })()}

          {/* Daily Report — full width */}
          <DailyReport rows={byDay} showBotColumn={!selectedBot} />

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

          {/* By Market Session (Symbol × TF × Forecast) */}
          {byMarketSession.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1a1a2a]">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">By Market Session</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
                      <th className="px-4 py-2 text-left font-medium">Symbol</th>
                      <th className="px-4 py-2 text-left font-medium">TF</th>
                      <th className="px-4 py-2 text-left font-medium">Forecast</th>
                      <th className="px-4 py-2 text-right font-medium">W</th>
                      <th className="px-4 py-2 text-right font-medium">L</th>
                      <th className="px-4 py-2 text-right font-medium">Candles</th>
                      <th className="px-4 py-2 text-right font-medium">Trades</th>
                      <th className="px-4 py-2 text-right font-medium">Win Rate</th>
                      <th className="px-4 py-2 text-right font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMarketSession.map((r) => (
                      <tr key={`${r.symbol}-${r.tf}-${r.forecast}`} className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60">
                        <td className="px-4 py-2 text-slate-200 font-semibold">{r.symbol}</td>
                        <td className="px-4 py-2 text-slate-400">{r.tf}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${r.forecast === 'GREEN' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                            {r.forecast}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-emerald-400">{r.wins}</td>
                        <td className="px-4 py-2 text-right text-rose-400">{r.losses}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{r.candles}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{r.trades}</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-200">{r.wr}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${pnlCls(r.pnl)}`}>{money(r.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {byMarketSession.length > 1 && (() => {
                    const tW = byMarketSession.reduce((s, r) => s + r.wins, 0);
                    const tL = byMarketSession.reduce((s, r) => s + r.losses, 0);
                    const tCandles = byMarketSession.reduce((s, r) => s + r.candles, 0);
                    const tTrades = byMarketSession.reduce((s, r) => s + r.trades, 0);
                    const tP = byMarketSession.reduce((s, r) => s + r.pnl, 0);
                    const wr = tCandles > 0 ? ((tW / tCandles) * 100).toFixed(1) + '%' : '—';
                    return (
                      <tfoot>
                        <tr className="border-t border-[#1a1a2e] bg-[#0a0a14]">
                          <td colSpan={3} className="px-4 py-2 font-semibold text-slate-300">
                            Total ({byMarketSession.length} groups)
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-emerald-400">{tW}</td>
                          <td className="px-4 py-2 text-right font-semibold text-rose-400">{tL}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-300">{tCandles}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-500">{tTrades}</td>
                          <td className="px-4 py-2 text-right font-bold text-slate-200">{wr}</td>
                          <td className={`px-4 py-2 text-right font-bold ${pnlCls(tP)}`}>{money(tP)}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          )}

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
                  options={singleRadarOptions}
                />
              </div>
            </div>
          )}

          {/* Open Positions & Trade History */}
          <PositionsTable trades={filteredTrades} bots={filteredBots} />
          {botAllTradesLoading && selectedBot && (
            <div className="card p-4 text-center text-slate-500 text-xs">Loading all orders for {selectedBot}...</div>
          )}
          <TradeHistory trades={tradesForHistory} bots={filteredBots} />
        </>
      )}
    </main>
  );
}

/* ── Inline Order History for a bot on a specific date ── */

function BotDayOrders({ botName, date }: { botName: string; date: string }) {
  const [orders, setOrders] = useState<Trade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchBotOrderHistory({ bot_name: botName, date_from: date, date_to: date, limit: 200 })
      .then((res) => {
        if (cancelled) return;
        setOrders(res.orders);
        setTotal(res.total);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [botName, date]);

  if (loading) {
    return (
      <tr><td colSpan={7} className="px-8 py-3 text-center text-slate-500 text-[11px]">
        Loading orders...
      </td></tr>
    );
  }
  if (error) {
    return (
      <tr><td colSpan={7} className="px-8 py-3 text-center text-rose-400 text-[11px]">
        Error: {error}
      </td></tr>
    );
  }
  if (orders.length === 0) {
    return (
      <tr><td colSpan={7} className="px-8 py-3 text-center text-slate-600 text-[11px]">
        No orders found
      </td></tr>
    );
  }

  return (
    <>
      {/* Sub-header */}
      <tr className="bg-[#06061a]">
        <td colSpan={7} className="px-8 py-1.5">
          <div className="flex items-center gap-4 text-[10px] text-slate-500 uppercase tracking-wide font-medium">
            <span className="w-16">Time</span>
            <span className="w-12">Symbol</span>
            <span className="w-10">TF</span>
            <span className="w-14">Forecast</span>
            <span className="w-14 text-right">Amount</span>
            <span className="w-14 text-right">Result</span>
            <span className="w-20 text-right">P&L</span>
            <span className="w-14 text-right">Fee</span>
            <span className="w-14 text-right">Type</span>
            {total > orders.length && <span className="ml-auto text-slate-600">{orders.length}/{total}</span>}
          </div>
        </td>
      </tr>
      {orders.map((o) => {
        const d = parseUTC(o.created_at);
        const time = d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
        const netPnl = (o.profit || 0) - (o.entry_fee || 0);
        const resultCls = o.result === 'WIN' ? 'text-emerald-400 bg-emerald-400/10'
          : o.result === 'LOSS' ? 'text-rose-400 bg-rose-400/10'
          : o.result === 'CANCELLED' ? 'text-amber-400 bg-amber-400/10'
          : 'text-slate-400 bg-slate-400/10';
        return (
          <tr key={o.id} className="bg-[#050518] border-b border-[#0a0a1a] hover:bg-[#08081f]">
            <td colSpan={7} className="px-8 py-1.5">
              <div className="flex items-center gap-4 text-[11px]">
                <span className="w-16 text-slate-500 font-mono">{time}</span>
                <span className="w-12 text-slate-300 font-semibold">{o.symbol}</span>
                <span className="w-10 text-slate-400">{o.timeframe}</span>
                <span className="w-14">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${o.forecast === 'GREEN' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                    {o.forecast}
                  </span>
                </span>
                <span className="w-14 text-right text-slate-300">{money(o.amount)}</span>
                <span className="w-14 text-right">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${resultCls}`}>
                    {o.result || 'PENDING'}
                  </span>
                </span>
                <span className={`w-20 text-right font-medium ${pnlCls(netPnl)}`}>
                  {o.result && o.result !== 'PENDING' ? money(netPnl) : '—'}
                </span>
                <span className="w-14 text-right text-slate-600">
                  {o.entry_fee ? money(o.entry_fee) : '—'}
                </span>
                <span className="w-14 text-right text-slate-500">
                  {o.order_type || 'MKT'}
                  {o.limit_price ? ` @${o.limit_price.toFixed(2)}` : ''}
                </span>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}


function DailyReport({ rows, showBotColumn }: { rows: DayRow[]; showBotColumn: boolean }) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  // Track which bot+date pairs have their orders expanded
  const [expandedBotDay, setExpandedBotDay] = useState<string | null>(null); // "botName|date"

  const toggleBotDay = useCallback((botName: string, date: string) => {
    const key = `${botName}|${date}`;
    setExpandedBotDay((prev) => prev === key ? null : key);
  }, []);

  const totals = useMemo(() => {
    const wins = rows.reduce((s, r) => s + r.wins, 0);
    const losses = rows.reduce((s, r) => s + r.losses, 0);
    const decided = wins + losses;
    return {
      wins, losses,
      pnl: rows.reduce((s, r) => s + r.pnl, 0),
      fees: rows.reduce((s, r) => s + r.fees, 0),
      total: decided,
      wr: decided > 0 ? ((wins / decided) * 100).toFixed(1) + '%' : '\u2014',
    };
  }, [rows]);

  const COL_COUNT = showBotColumn ? 7 : 6;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a2a] flex items-center gap-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Daily Report</h3>
        <span className="text-[10px] text-slate-600">{rows.length} day{rows.length !== 1 ? 's' : ''}</span>
        {rows.length > 0 && (
          <div className="ml-auto flex items-center gap-3 text-[11px]">
            <span className="text-slate-500">
              <span className="text-emerald-400">{totals.wins}W</span>{' / '}<span className="text-rose-400">{totals.losses}L</span>
            </span>
            <span className={`font-semibold ${pnlCls(totals.pnl)}`}>{money(totals.pnl)}</span>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-right font-medium">W</th>
              <th className="px-4 py-2 text-right font-medium">L</th>
              <th className="px-4 py-2 text-right font-medium">WR</th>
              <th className="px-4 py-2 text-right font-medium">P&L</th>
              <th className="px-4 py-2 text-right font-medium">Fees</th>
              {showBotColumn && <th className="px-4 py-2 text-right font-medium">Bots</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={COL_COUNT} className="px-4 py-6 text-center text-slate-600">No data</td></tr>
            ) : rows.map((r) => {
              const isExpanded = expandedDate === r.date;
              const hasBots = showBotColumn && r.bots.length > 1;
              // In single-bot mode, the row itself is clickable to show orders
              const isSingleBot = !showBotColumn || r.bots.length === 1;
              const singleBotName = isSingleBot && r.bots.length > 0 ? r.bots[0].bot_name : null;
              const singleBotExpanded = singleBotName ? expandedBotDay === `${singleBotName}|${r.date}` : false;
              return (
                <React.Fragment key={r.date}>
                  <tr
                    className={`border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60 cursor-pointer ${isExpanded || singleBotExpanded ? 'bg-[#0e0e1a]/40' : ''}`}
                    onClick={() => {
                      if (isSingleBot && singleBotName) {
                        toggleBotDay(singleBotName, r.date);
                      } else if (hasBots) {
                        setExpandedDate(isExpanded ? null : r.date);
                        setExpandedBotDay(null);
                      }
                    }}
                  >
                    <td className="px-4 py-2 text-slate-300 font-mono">
                      <span className="flex items-center gap-1.5">
                        <svg className={`w-3 h-3 text-slate-500 transition-transform ${isExpanded || singleBotExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {r.date}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-400">{r.wins}</td>
                    <td className="px-4 py-2 text-right text-rose-400">{r.losses}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-200">{r.wr}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${pnlCls(r.pnl)}`}>{money(r.pnl)}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{r.fees > 0 ? money(r.fees) : '\u2014'}</td>
                    {showBotColumn && <td className="px-4 py-2 text-right text-slate-500">{r.bots.length}</td>}
                  </tr>
                  {/* Single-bot mode: show orders directly under the date row */}
                  {singleBotExpanded && singleBotName && (
                    <BotDayOrders botName={singleBotName} date={r.date} />
                  )}
                  {/* Multi-bot mode: expand to show per-bot rows, each clickable for orders */}
                  {isExpanded && r.bots.map((b) => {
                    const decided = b.wins + b.losses;
                    const wr = decided > 0 ? ((b.wins / decided) * 100).toFixed(1) + '%' : '\u2014';
                    const botDayKey = `${b.bot_name}|${r.date}`;
                    const isBotExpanded = expandedBotDay === botDayKey;
                    return (
                      <React.Fragment key={b.bot_name}>
                        <tr
                          className={`bg-[#08081a] border-b border-[#0e0e1a] cursor-pointer hover:bg-[#0c0c22] ${isBotExpanded ? 'bg-[#0c0c22]' : ''}`}
                          onClick={() => toggleBotDay(b.bot_name, r.date)}
                        >
                          <td className="pl-10 pr-4 py-1.5 text-slate-400 text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <svg className={`w-2.5 h-2.5 text-slate-600 transition-transform ${isBotExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {b.bot_name}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 text-right text-emerald-400/70 text-[11px]">{b.wins}</td>
                          <td className="px-4 py-1.5 text-right text-rose-400/70 text-[11px]">{b.losses}</td>
                          <td className="px-4 py-1.5 text-right text-slate-400 text-[11px]">{wr}</td>
                          <td className={`px-4 py-1.5 text-right text-[11px] font-medium ${pnlCls(b.pnl)}`}>{money(b.pnl)}</td>
                          <td className="px-4 py-1.5 text-right text-slate-600 text-[11px]">{b.fees > 0 ? money(b.fees) : '\u2014'}</td>
                          <td className="px-4 py-1.5 text-right text-slate-600 text-[11px]">{b.sessions}s</td>
                        </tr>
                        {isBotExpanded && (
                          <BotDayOrders botName={b.bot_name} date={r.date} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t border-[#1a1a2e] bg-[#0a0a14]">
                <td className="px-4 py-2.5 font-semibold text-slate-300">Total</td>
                <td className="px-4 py-2.5 text-right font-semibold text-emerald-400">{totals.wins}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-rose-400">{totals.losses}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-200">{totals.wr}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${pnlCls(totals.pnl)}`}>{money(totals.pnl)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-500">{totals.fees > 0 ? money(totals.fees) : '\u2014'}</td>
                {showBotColumn && <td className="px-4 py-2.5" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function BotSummaryTable({ trades, bots, botNames, botPnls = [], balanceHistoryGrouped = [] }: { trades: Trade[]; bots: Bot[]; botNames: string[]; botPnls?: BotPnl[]; balanceHistoryGrouped?: BalanceHistoryGrouped[] }) {
  const pnlMap = useMemo(() => {
    const m = new Map<string, BotPnl>();
    for (const p of botPnls) m.set(p.bot_name, p);
    return m;
  }, [botPnls]);

  // Aggregate session stats from ledger per bot
  const ledgerByBot = useMemo(() => {
    const m = new Map<string, { wins: number; losses: number; sessions: number; totalProfit: number; totalFee: number; trades: number }>();
    for (const group of balanceHistoryGrouped) {
      for (const entry of group.bots) {
        let agg = m.get(entry.bot_name);
        if (!agg) {
          agg = { wins: 0, losses: 0, sessions: 0, totalProfit: 0, totalFee: 0, trades: 0 };
          m.set(entry.bot_name, agg);
        }
        agg.wins += entry.win_count ?? 0;
        agg.losses += entry.loss_count ?? 0;
        agg.sessions += 1;
        agg.totalProfit += entry.total_profit;
        agg.totalFee += entry.total_fee;
        agg.trades += entry.trade_count ?? 0;
      }
    }
    return m;
  }, [balanceHistoryGrouped]);

  const rows = useMemo(() => {
    return botNames.map((name) => {
      const bot = bots.find((b) => b.bot_name === name);
      const initial = bot?.initial_balance ?? 0;
      const color = BOT_PALETTE[botNames.indexOf(name) % BOT_PALETTE.length];
      const bp = pnlMap.get(name);
      const ledger = ledgerByBot.get(name);

      const equity = bp?.current_balance ?? bot?.balance ?? initial;
      const pnl = equity - initial;
      const roi = initial > 0 ? (pnl / initial) * 100 : 0;

      // Use ledger/pnl data if available, fallback to trades
      if (bp && ledger) {
        const wins = bp.wins;
        const losses = bp.losses;
        const decided = wins + losses;
        const cancelled = ledger.trades - decided;
        const total = ledger.trades;
        const wr = decided > 0 ? (wins / decided) * 100 : 0;
        const fees = bp.total_fees;
        const avg = decided > 0 ? pnl / decided : 0;
        return { name, color, wins, losses, cancelled: Math.max(0, cancelled), total, decided, wr, pnl, fees, avg, initial, roi, sessions: ledger.sessions };
      }

      // Fallback to raw trades
      const botSettled = trades.filter((t) => t.bot_name === name && t.result !== 'PENDING');
      const wins = botSettled.filter((t) => t.result === 'WIN').length;
      const losses = botSettled.filter((t) => t.result === 'LOSS').length;
      const cancelled = botSettled.filter((t) => t.result === 'CANCELLED').length;
      const total = botSettled.length;
      const decided = wins + losses;
      const wr = decided > 0 ? (wins / decided) * 100 : 0;
      const fees = botSettled.reduce((s, t) => s + (t.entry_fee || 0), 0);
      const avg = decided > 0 ? pnl / decided : 0;
      return { name, color, wins, losses, cancelled, total, decided, wr, pnl, fees, avg, initial, roi, sessions: 0 };
    }).filter((r) => r.total > 0);
  }, [trades, bots, botNames, pnlMap, ledgerByBot]);

  const totals = useMemo(() => {
    const wins = rows.reduce((s, r) => s + r.wins, 0);
    const losses = rows.reduce((s, r) => s + r.losses, 0);
    const cancelled = rows.reduce((s, r) => s + r.cancelled, 0);
    const total = rows.reduce((s, r) => s + r.total, 0);
    const decided = wins + losses;
    const wr = decided > 0 ? (wins / decided) * 100 : 0;
    const pnl = rows.reduce((s, r) => s + r.pnl, 0);
    const fees = rows.reduce((s, r) => s + r.fees, 0);
    const avg = decided > 0 ? pnl / decided : 0;
    const initial = rows.reduce((s, r) => s + r.initial, 0);
    const roi = initial > 0 ? (pnl / initial) * 100 : 0;
    const sessions = rows.reduce((s, r) => s + r.sessions, 0);
    return { wins, losses, cancelled, total, decided, wr, pnl, fees, avg, initial, roi, sessions };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a2a]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Bot Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">Bot</th>
              <th className="px-4 py-2.5 text-right font-medium">Trades</th>
              <th className="px-4 py-2.5 text-right font-medium">W</th>
              <th className="px-4 py-2.5 text-right font-medium">L</th>
              <th className="px-4 py-2.5 text-right font-medium">C</th>
              <th className="px-4 py-2.5 text-right font-medium">Win Rate</th>
              <th className="px-4 py-2.5 text-right font-medium">P&L</th>
              <th className="px-4 py-2.5 text-right font-medium">Fees</th>
              <th className="px-4 py-2.5 text-right font-medium">Avg/Trade</th>
              <th className="px-4 py-2.5 text-right font-medium">ROI</th>
              <th className="px-4 py-2.5 text-right font-medium">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                    <span className="text-slate-200 font-medium">{r.name}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-300">{r.total}</td>
                <td className="px-4 py-2.5 text-right text-emerald-400">{r.wins}</td>
                <td className="px-4 py-2.5 text-right text-rose-400">{r.losses}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{r.cancelled}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-200">
                  {r.decided > 0 ? r.wr.toFixed(1) + '%' : '\u2014'}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold ${pnlCls(r.pnl)}`}>
                  {money(r.pnl)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-500">
                  {r.fees > 0 ? money(r.fees) : '\u2014'}
                </td>
                <td className={`px-4 py-2.5 text-right ${pnlCls(r.avg)}`}>
                  {money(r.avg)}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold ${pnlCls(r.roi)}`}>
                  {r.roi >= 0 ? '+' : ''}{r.roi.toFixed(2)}%
                </td>
                <td className="px-4 py-2.5 text-right text-slate-400">{r.sessions || '\u2014'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t border-[#1a1a2e] bg-[#0a0a14]">
                <td className="px-4 py-2.5 font-semibold text-slate-300">Total ({rows.length} bots)</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-300">{totals.total}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-emerald-400">{totals.wins}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-rose-400">{totals.losses}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-500">{totals.cancelled}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-200">
                  {totals.decided > 0 ? totals.wr.toFixed(1) + '%' : '\u2014'}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold ${pnlCls(totals.pnl)}`}>
                  {money(totals.pnl)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-500">
                  {totals.fees > 0 ? money(totals.fees) : '\u2014'}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold ${pnlCls(totals.avg)}`}>
                  {money(totals.avg)}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold ${pnlCls(totals.roi)}`}>
                  {totals.roi >= 0 ? '+' : ''}{totals.roi.toFixed(2)}%
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-400">{totals.sessions || '\u2014'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
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
