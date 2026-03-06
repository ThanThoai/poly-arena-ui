'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Trade, Bot } from '@/lib/api';
import { BOT_PALETTE, parseUTC, dtMs, dtShort, dtParts, fmtDiff, fmtCents, TF_PERIOD_MS, money } from '@/lib/helpers';
import SymbolBadge from '@/components/ui/symbol-badge';
import { OrderTypeBadge, BracketBadges, OrderStatusBadge } from '@/components/ui/order-badges';
import CustomSelect from '@/components/ui/custom-select';
import OrderTraceModal from '@/components/modals/order-trace-modal';
import InspectorModal from '@/components/modals/inspector-modal';
import TraceTimeline from '@/components/ui/trace-timeline';
import type { PositionsSettings } from '@/lib/settings-types';

interface PositionsTableProps {
  trades: Trade[];
  bots: Bot[];
  isAdmin?: boolean;
  sessionOffset?: number;
  initialSettings?: PositionsSettings;
  onSettingsChange?: (s: PositionsSettings) => void;
}

type ViewMode = 'table' | 'group';

export default function PositionsTable({ trades, bots, isAdmin, sessionOffset, initialSettings, onSettingsChange }: PositionsTableProps) {
  const [userFilter, setUserFilter] = useState(initialSettings?.userFilter ?? '');
  const [botFilter, setBotFilter] = useState(initialSettings?.botFilter ?? '');
  const [symbolFilter, setSymbolFilter] = useState(initialSettings?.symbolFilter ?? '');
  const [timeframeFilter, setTimeframeFilter] = useState(initialSettings?.tfFilter ?? '');
  const [typeFilter, setTypeFilter] = useState(initialSettings?.typeFilter ?? '');
  const [forecastFilter, setForecastFilter] = useState(initialSettings?.forecastFilter ?? '');
  const [viewMode, setViewMode] = useState<ViewMode>(initialSettings?.viewMode ?? 'table');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [collapsedBots, setCollapsedBots] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [traceTrade, setTraceTrade] = useState<Trade | null>(null);
  const [inspectTrade, setInspectTrade] = useState<Trade | null>(null);

  const emitSettings = (patch: Partial<PositionsSettings>) => {
    onSettingsChange?.({ userFilter, botFilter, symbolFilter, tfFilter: timeframeFilter, typeFilter, forecastFilter, viewMode, ...patch });
  };

  // Derive user names + bot→owner mapping from bots
  const userNames = useMemo(() => {
    const names = new Set<string>();
    bots.forEach((b) => { if (b.owner_name) names.add(b.owner_name); });
    return [...names].sort();
  }, [bots]);
  const botOwnerMap = useMemo(() => {
    const m: Record<string, string> = {};
    bots.forEach((b) => { if (b.owner_name) m[b.bot_name] = b.owner_name; });
    return m;
  }, [bots]);

  const pending = useMemo(() => trades.filter((t) => t.result === 'PENDING'), [trades]);

  const filtered = useMemo(() => pending.filter((t) => {
    if (userFilter && botOwnerMap[t.bot_name] !== userFilter) return false;
    if (botFilter && t.bot_name !== botFilter) return false;
    if (symbolFilter && t.symbol !== symbolFilter) return false;
    if (timeframeFilter && t.timeframe !== timeframeFilter) return false;
    if (typeFilter === 'MARKET' && t.limit_price != null) return false;
    if (typeFilter === 'LIMIT' && t.limit_price == null) return false;
    if (forecastFilter && t.forecast !== forecastFilter) return false;
    const activeOffset = sessionOffset ?? 0;
    const periodMs = TF_PERIOD_MS[t.timeframe] ?? 300_000;
    const settleMs = t.settlement_at ? parseUTC(t.settlement_at)?.getTime() ?? 0 : 0;
    const candleOpenMs = settleMs > 0 ? settleMs - periodMs : 0;
    const nowMs = Date.now();
    const currentCandleOpen = nowMs - (nowMs % periodMs);
    const dynamicOffset = candleOpenMs > 0
      ? Math.max(0, Math.round((candleOpenMs - currentCandleOpen) / periodMs))
      : (t.session_offset ?? 0);
    if (dynamicOffset !== activeOffset) return false;
    return true;
  }), [pending, userFilter, botFilter, symbolFilter, timeframeFilter, typeFilter, forecastFilter, sessionOffset, tick, botOwnerMap]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (parseUTC(a.settlement_at)?.getTime() ?? 0) - (parseUTC(b.settlement_at)?.getTime() ?? 0)),
    [filtered],
  );

  // Filter bot list by selected user
  const botNames = useMemo(() => {
    let list = bots;
    if (userFilter) list = list.filter((b) => b.owner_name === userFilter);
    return list.map((b) => b.bot_name).sort();
  }, [bots, userFilter]);

  const filteredStats = useMemo(() => {
    const totalAmount = sorted.reduce((s, t) => s + t.amount, 0);
    const totalFees = sorted.reduce((s, t) => s + (t.entry_fee ?? 0), 0);
    return { totalAmount, totalFees, count: sorted.length };
  }, [sorted]);

  // Group by bot for group view
  const botGroups = useMemo(() => {
    if (viewMode !== 'group') return [];
    const map = new Map<string, Trade[]>();
    for (const t of sorted) {
      if (!map.has(t.bot_name)) map.set(t.bot_name, []);
      map.get(t.bot_name)!.push(t);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, trades]) => ({ name, trades }));
  }, [sorted, viewMode]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paged = sorted.slice(start, start + PAGE_SIZE);

  const hasActiveFilter = userFilter !== '' || botFilter !== '' || symbolFilter !== '' || timeframeFilter !== '' || typeFilter !== '' || forecastFilter !== '';
  const clearFilters = () => { setUserFilter(''); setBotFilter(''); setSymbolFilter(''); setTimeframeFilter(''); setTypeFilter(''); setForecastFilter(''); setCurrentPage(1); onSettingsChange?.({ userFilter: '', botFilter: '', symbolFilter: '', tfFilter: '', typeFilter: '', forecastFilter: '', viewMode }); };

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const toggleDetail = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBotGroup = (name: string) => {
    setCollapsedBots((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const now = Date.now();

  const tradeRowProps = (t: Trade) => {
    const isOpen = expandedRows.has(t.id);
    const fCls =
      t.forecast === 'GREEN'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    const botIdx = bots.findIndex((b) => b.bot_name === t.bot_name);
    const bColor = BOT_PALETTE[botIdx >= 0 ? botIdx % BOT_PALETTE.length : 0];
    const settleMs = t.settlement_at ? parseUTC(t.settlement_at)?.getTime() ?? 0 : 0;
    const diff = settleMs - now;
    const settling = diff <= 0 && settleMs > 0;
    const cd = diff > 0 ? fmtDiff(diff) : settling ? 'settling' : '\u2014';
    const isA1 = (t.session_offset ?? 0) > 0;
    const periodMs = TF_PERIOD_MS[t.timeframe] ?? 300_000;
    const candleOpenMs = settleMs > 0 ? settleMs - periodMs : 0;
    const candleStartDiff = candleOpenMs - now;
    const candleActive = candleStartDiff <= 0;
    const createdMs = t.created_at ? parseUTC(t.created_at)?.getTime() ?? 0 : 0;
    const total = settleMs - createdMs;
    const pctVal = total > 0 ? Math.min(100, Math.max(0, ((now - createdMs) / total) * 100)) : 100;
    const orderMs = t.order_received_at ? parseUTC(t.order_received_at)?.getTime() ?? null : null;
    const fillMs = t.ask_fetched_at ? parseUTC(t.ask_fetched_at)?.getTime() ?? null : null;
    const lat = orderMs != null && fillMs != null ? fillMs - orderMs : null;
    return {
      trade: t, open: isOpen, forecastCls: fCls, botColor: bColor, countdown: cd,
      pct: pctVal, now, latencyMs: lat, isA1, settling, candleStartDiff, candleActive,
      onToggle: () => toggleDetail(t.id), onTrace: () => setTraceTrade(t),
      isAdmin, onInspect: () => setInspectTrade(t),
    };
  };

  const switchMode = (m: ViewMode) => {
    setViewMode(m);
    if (m === 'group') {
      // Default all groups collapsed
      setCollapsedBots(new Set(sorted.map((t) => t.bot_name)));
    } else {
      setCollapsedBots(new Set());
    }
    emitSettings({ viewMode: m });
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 live-dot" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Open Positions</h3>
          {pending.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {filtered.length}{filtered.length !== pending.length && `/${pending.length}`}
            </span>
          )}
          {sessionOffset === 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              A+1
            </span>
          )}
          {filteredStats.count > 0 && (
            <span className="text-[11px] text-slate-500 ml-1">
              Locked <span className="font-semibold text-amber-400">{money(filteredStats.totalAmount)}</span>
              {filteredStats.totalFees > 0 && (
                <span className="text-slate-600 ml-1.5">Fees {money(filteredStats.totalFees)}</span>
              )}
            </span>
          )}

          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-[#1f1f32] overflow-hidden ml-2">
            <button
              onClick={() => switchMode('table')}
              className={`h-[26px] px-2.5 text-[10px] font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-violet-600/20 text-violet-400 border-r border-[#1f1f32]'
                  : 'text-slate-500 hover:text-slate-300 border-r border-[#1f1f32]'
              }`}
              title="Table view"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => switchMode('group')}
              className={`h-[26px] px-2.5 text-[10px] font-semibold transition-colors ${
                viewMode === 'group'
                  ? 'bg-violet-600/20 text-violet-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Group by Bot"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {userNames.length > 1 && (
            <CustomSelect
              placeholder="All Users"
              options={[{ value: '', label: 'All Users' }, ...userNames.map((n) => ({ value: n, label: n }))]}
              value={userFilter}
              onChange={(v) => { setUserFilter(v); setBotFilter(''); emitSettings({ userFilter: v, botFilter: '' }); }}
              searchable
            />
          )}
          <CustomSelect
            placeholder="All Bots"
            options={[{ value: '', label: 'All Bots' }, ...botNames.map((n) => ({ value: n, label: n }))]}
            value={botFilter}
            onChange={(v) => { setBotFilter(v); emitSettings({ botFilter: v }); }}
            searchable
          />
          <CustomSelect
            placeholder="All Symbols"
            options={[
              { value: '', label: 'All Symbols' },
              { value: 'BTC', label: '\u20BF BTC' },
              { value: 'ETH', label: '\u039E ETH' },
              { value: 'SOL', label: '\u25CE SOL' },
              { value: 'XRP', label: '\u2715 XRP' },
            ]}
            value={symbolFilter}
            onChange={(v) => { setSymbolFilter(v); emitSettings({ symbolFilter: v }); }}
          />
          <CustomSelect
            placeholder="All TF"
            options={[
              { value: '', label: 'All TF' },
              { value: 'M5', label: '5m' },
              { value: 'M15', label: '15m' },
              { value: 'H1', label: '1h' },
            ]}
            value={timeframeFilter}
            onChange={(v) => { setTimeframeFilter(v); emitSettings({ tfFilter: v }); }}
          />
          <CustomSelect
            placeholder="All Types"
            options={[
              { value: '', label: 'All Types' },
              { value: 'MARKET', label: 'MARKET' },
              { value: 'LIMIT', label: 'LIMIT' },
            ]}
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); emitSettings({ typeFilter: v }); }}
          />
          <CustomSelect
            placeholder="All Forecasts"
            options={[
              { value: '', label: 'All Forecasts' },
              { value: 'GREEN', label: '\u25CF GREEN' },
              { value: 'RED', label: '\u25CF RED' },
            ]}
            value={forecastFilter}
            onChange={(v) => { setForecastFilter(v); emitSettings({ forecastFilter: v }); }}
          />
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="h-[30px] px-2.5 rounded-lg border border-[#1f1f32] text-[11px] text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">#</th>
              <th className="px-4 py-2.5 text-left font-medium">Bot</th>
              <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-left font-medium">TF</th>
              <th className="px-4 py-2.5 text-left font-medium">Forecast</th>
              <th className="px-4 py-2.5 text-left font-medium">Type</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-right font-medium">Fee</th>
              <th className="px-4 py-2.5 text-right font-medium">Avg Price</th>
              <th className="px-4 py-2.5 text-right font-medium">Shares</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">TTL</th>
              <th className="px-4 py-2.5 text-left font-medium">Timing</th>
              <th className="px-4 py-2.5 text-left font-medium">Settles In</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={14} className="px-5 py-8 text-center text-slate-600">No open positions</td></tr>
            ) : viewMode === 'group' ? (
              botGroups.map((group) => {
                const collapsed = collapsedBots.has(group.name);
                const totalAmt = group.trades.reduce((s, t) => s + t.amount, 0);
                const totalFee = group.trades.reduce((s, t) => s + (t.entry_fee ?? 0), 0);
                const totalShares = group.trades.reduce((s, t) => s + (t.num_shares ?? 0), 0);
                const greenCount = group.trades.filter((t) => t.forecast === 'GREEN').length;
                const redCount = group.trades.filter((t) => t.forecast === 'RED').length;
                const botIdx = bots.findIndex((b) => b.bot_name === group.name);
                const botColor = BOT_PALETTE[botIdx >= 0 ? botIdx % BOT_PALETTE.length : 0];

                // Unique symbols & timeframes in this group
                const symbols = [...new Set(group.trades.map((t) => t.symbol))];
                const tfs = [...new Set(group.trades.map((t) => t.timeframe))];

                return (
                  <React.Fragment key={group.name}>
                    <tr
                      onClick={() => toggleBotGroup(group.name)}
                      className="border-b border-[#12121f] cursor-pointer select-none hover:bg-white/[.02] transition-colors"
                      style={{ background: 'rgba(124,58,237,.04)' }}
                    >
                      <td colSpan={14} className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {/* Expand/collapse arrow */}
                          <svg
                            className="w-3 h-3 text-violet-400 transition-transform duration-150 shrink-0"
                            style={{ transform: collapsed ? undefined : 'rotate(90deg)' }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>

                          {/* Bot color dot + name */}
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: botColor }} />
                          <span className="text-[12px] font-semibold text-slate-200">{group.name}</span>

                          {/* Count badge */}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
                            {group.trades.length}
                          </span>

                          {/* Symbols */}
                          <span className="text-[10px] text-slate-500">
                            {symbols.join(', ')}
                          </span>

                          {/* Timeframes */}
                          <span className="text-[10px] text-slate-600">
                            {tfs.join(', ')}
                          </span>

                          {/* Forecast breakdown */}
                          <span className="flex items-center gap-1.5 ml-1">
                            {greenCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {greenCount} GREEN
                              </span>
                            )}
                            {redCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                {redCount} RED
                              </span>
                            )}
                          </span>

                          {/* Aggregates */}
                          <span className="text-[10px] text-slate-500 ml-auto flex items-center gap-3">
                            <span>
                              Locked <span className="font-semibold text-amber-400">${totalAmt.toFixed(2)}</span>
                            </span>
                            {totalFee > 0 && (
                              <span>
                                Fee <span className="text-slate-400">${totalFee.toFixed(2)}</span>
                              </span>
                            )}
                            <span>
                              Shares <span className="text-sky-400">{totalShares.toFixed(2)}</span>
                            </span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!collapsed && group.trades.map((t) => (
                      <PositionRow key={t.id} {...tradeRowProps(t)} />
                    ))}
                  </React.Fragment>
                );
              })
            ) : (
              paged.map((t) => <PositionRow key={t.id} {...tradeRowProps(t)} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination + summary */}
      <div className="px-5 py-2.5 border-t border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] text-slate-600">
            {viewMode === 'group'
              ? `${sorted.length} position${sorted.length !== 1 ? 's' : ''} in ${botGroups.length} bot${botGroups.length !== 1 ? 's' : ''}`
              : sorted.length ? `${start + 1}\u2013${Math.min(start + PAGE_SIZE, sorted.length)} of ${sorted.length} position${sorted.length !== 1 ? 's' : ''}` : '0 positions'}
          </span>
        </div>
        {viewMode === 'table' && totalPages > 1 && <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />}
      </div>

      <OrderTraceModal open={traceTrade !== null} onClose={() => setTraceTrade(null)} trade={traceTrade} />
      <InspectorModal open={inspectTrade !== null} onClose={() => setInspectTrade(null)} trade={inspectTrade} />
    </div>
  );
}

function PositionRow({
  trade: t,
  open,
  forecastCls,
  botColor,
  countdown,
  pct,
  now,
  latencyMs,
  isA1,
  settling,
  candleStartDiff,
  candleActive,
  onToggle,
  onTrace,
  isAdmin,
  onInspect,
}: {
  trade: Trade;
  open: boolean;
  forecastCls: string;
  botColor: string;
  countdown: string;
  pct: number;
  now: number;
  latencyMs: number | null;
  isA1: boolean;
  settling: boolean;
  candleStartDiff: number;
  candleActive: boolean;
  onToggle: () => void;
  onTrace: () => void;
  isAdmin?: boolean;
  onInspect: () => void;
}) {
  const settled = dtParts(t.settlement_at);

  const winPayout =
    t.avg_price != null && t.num_shares != null
      ? '+$' + ((1 - t.avg_price) * t.num_shares).toFixed(2)
      : '\u2014';

  // TTL countdown — only relevant while order is still waiting for fill
  // Once filled (FILLED/CANCELED), TTL no longer matters.
  const ttlStillActive = t.ttl != null
    && t.me_order_status != null
    && t.me_order_status !== 'FILLED'
    && t.me_order_status !== 'CANCELED';

  let ttlRemaining: string | null = null;
  let ttlPct = 0;
  let ttlExpired = false;
  if (ttlStillActive && t.created_at) {
    const createdMs = parseUTC(t.created_at)?.getTime() ?? 0;
    const expireMs = createdMs + t.ttl! * 1000;
    const remaining = expireMs - now;
    if (remaining > 0) {
      ttlRemaining = fmtDiff(remaining);
      ttlPct = Math.min(100, Math.max(0, ((now - createdMs) / (t.ttl! * 1000)) * 100));
    } else {
      ttlRemaining = 'expired';
      ttlPct = 100;
      ttlExpired = true;
    }
  }

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-[#0e0e1a] transition-colors cursor-pointer select-none ${open ? 'bg-[#0e0e1c]' : 'hover:bg-[#0e0e1a]/60'}`}
      >
        <td className="px-4 py-2.5 text-slate-500">
          <span className="flex items-center gap-1">
            <svg
              className="w-3 h-3 text-slate-600 transition-transform duration-150 shrink-0"
              style={{ transform: open ? 'rotate(90deg)' : undefined }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            #{t.id}
            {t.session_offset != null && t.session_offset > 0 && (
              <span className="ml-1 px-1 py-px rounded text-[8px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                A+1
              </span>
            )}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: botColor }} />
            <span className="text-slate-300">{t.bot_name}</span>
          </span>
        </td>
        <td className="px-4 py-2.5"><SymbolBadge symbol={t.symbol} /></td>
        <td className="px-4 py-2.5 text-slate-400">{t.timeframe}</td>
        <td className="px-4 py-2.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] border ${forecastCls}`}>{t.forecast}</span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex flex-col gap-0.5">
            <OrderTypeBadge trade={t} />
            <BracketBadges trade={t} />
          </div>
        </td>
        <td className="px-4 py-2.5 text-right">
          <span className="text-slate-200">${t.amount.toFixed(2)}</span>
          {t.original_amount != null && t.original_amount !== t.amount && (
            <span className="block text-[9px] text-slate-600">${t.original_amount.toFixed(2)} orig</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right text-slate-500 text-[11px]">
          {t.entry_fee != null && t.entry_fee > 0 ? `$${t.entry_fee.toFixed(2)}` : '\u2014'}
        </td>
        <td className="px-4 py-2.5 text-right text-violet-400">{fmtCents(t.avg_price)}</td>
        <td className="px-4 py-2.5 text-right text-sky-400">{t.num_shares != null ? Number(t.num_shares).toFixed(2) : '\u2014'}</td>
        <td className="px-4 py-2.5">
          <OrderStatusBadge trade={t} />
        </td>
        <td className="px-4 py-2.5">
          {ttlStillActive ? (
            <div className="min-w-[70px]">
              <span className={`font-mono text-[11px] font-semibold ${ttlExpired ? 'text-slate-500' : 'text-orange-400'}`}>
                {ttlRemaining}
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2a' }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      background: ttlExpired ? '#64748b' : '#f97316',
                      width: `${ttlPct.toFixed(1)}%`,
                    }}
                  />
                </div>
              </div>
              <p className="text-[9px] text-slate-600 mt-0.5">{t.ttl}s total</p>
            </div>
          ) : (
            <span className="text-slate-600 text-[10px]">{'\u2014'}</span>
          )}
        </td>
        {/* Timing column */}
        <td className="px-4 py-2.5">
          <div className="min-w-[120px] space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-widest text-slate-600 w-8">order</span>
              <span className="font-mono text-[10px] text-slate-400">{dtMs(t.order_received_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-widest text-slate-600 w-8">fill</span>
              <span className="font-mono text-[10px] text-sky-400">{dtMs(t.ask_fetched_at)}</span>
            </div>
            {latencyMs != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] uppercase tracking-widest text-slate-600 w-8">lat</span>
                <span className={`font-mono text-[10px] font-semibold ${latencyMs < 100 ? 'text-emerald-400' : latencyMs < 500 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(2)}s`}
                </span>
              </div>
            )}
            {t.exit_at && t.exit_trigger && (
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] uppercase tracking-widest w-8 ${t.exit_trigger === 'TP' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.exit_trigger}</span>
                <span className={`font-mono text-[10px] font-semibold ${t.exit_trigger === 'TP' ? 'text-emerald-400' : 'text-rose-400'}`}>{dtMs(t.exit_at)}</span>
              </div>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5">
          {isA1 && !candleActive && candleStartDiff > 0 ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-indigo-400">starts</span>
                <span className="font-mono text-[11px] font-semibold text-indigo-400">{fmtDiff(candleStartDiff)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-amber-500/60">settles</span>
                <span className="font-mono text-[11px] font-semibold text-amber-500/60">{countdown}</span>
              </div>
            </div>
          ) : settling ? (
            <span className="font-mono text-[11px] font-semibold text-sky-400 animate-pulse">settling...</span>
          ) : (
            <span className="font-mono text-[11px] font-semibold text-amber-400">{countdown}</span>
          )}
          <p className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">{dtShort(t.settlement_at)}</p>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[#0e0e1a]">
          <td colSpan={14} style={{ background: '#09090f', borderLeft: '2px solid rgba(139,92,246,.3)' }}>
            <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-3">
              {/* Order Type */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Order Type</p>
                <div className="flex items-center gap-1.5">
                  <OrderTypeBadge trade={t} />
                  {t.session_offset != null && t.session_offset > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                      Next Session (A+1)
                    </span>
                  )}
                </div>
                {t.limit_price != null && (
                  <p className="text-[9px] text-slate-600 mt-0.5">limit @ {fmtCents(t.limit_price)}</p>
                )}
                {t.order_type && t.order_type !== 'FAK' && (
                  <p className="text-[9px] text-rose-400 mt-0.5">{t.order_type} (Fill-Or-Kill)</p>
                )}
                {t.ceiling_price != null && (
                  <p className="text-[9px] text-indigo-400 mt-0.5">ceiling @ {fmtCents(t.ceiling_price)}</p>
                )}
              </div>
              {/* Avg Price */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Avg Price</p>
                <p className={`font-mono text-xs font-semibold ${t.avg_price != null ? 'text-violet-300' : 'text-slate-600'}`}>{fmtCents(t.avg_price)}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">{t.limit_price != null ? 'limit fill price' : 'best ask at fill'}</p>
              </div>
              {/* Shares Held */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Shares Held</p>
                <p className={`font-mono text-xs font-semibold ${t.num_shares != null ? 'text-sky-300' : 'text-slate-600'}`}>
                  {t.num_shares != null ? Number(t.num_shares).toFixed(4) : '\u2014'}
                </p>
                {t.requested_quantity != null && t.filled_quantity != null && t.unfilled_quantity != null && t.unfilled_quantity > 0 && (
                  <p className="text-[9px] text-amber-500/70 mt-0.5">
                    {Number(t.filled_quantity).toFixed(2)} / {Number(t.requested_quantity).toFixed(2)} filled
                  </p>
                )}
              </div>
              {/* Win Payout */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Win Payout</p>
                <p className={`font-mono text-xs font-semibold ${t.num_shares != null ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {winPayout}
                </p>
                <p className="text-[9px] text-slate-600 mt-0.5">(1 - avg) x shares</p>
              </div>
              {/* Fill Breakdown — only for partial / queued orders */}
              {t.original_amount != null && t.me_order_status === 'PARTIAL' && (
                <div>
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Fill Status</p>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[80px]" style={{ background: '#1a1a2a' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            background: '#f59e0b',
                            width: `${Math.min(100, t.original_amount > 0 ? (t.amount / t.original_amount) * 100 : 0).toFixed(1)}%`
                          }}
                        />
                      </div>
                      <span className="font-mono text-[10px] font-semibold text-amber-400">
                        {t.original_amount > 0 ? ((t.amount / t.original_amount) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                    <p className="text-[9px] text-emerald-400">${t.amount.toFixed(2)} filled</p>
                    <p className="text-[9px] text-amber-400">${(t.original_amount - t.amount).toFixed(2)} queued to ME</p>
                    {t.limit_price != null && (
                      <p className="text-[9px] text-slate-600">waiting at limit {fmtCents(t.limit_price)}</p>
                    )}
                  </div>
                </div>
              )}
              {/* Bracket TP */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Take Profit</p>
                {t.tp_price != null ? (
                  <>
                    <p className="font-mono text-xs font-semibold text-emerald-400">{fmtCents(t.tp_price)}</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">
                      {t.exit_trigger === 'TP' ? 'triggered' : 'watching'}
                    </p>
                  </>
                ) : <p className="font-mono text-xs text-slate-600">{'\u2014'}</p>}
              </div>
              {/* Bracket SL */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Stop Loss</p>
                {t.sl_price != null ? (
                  <>
                    <p className="font-mono text-xs font-semibold text-rose-400">{fmtCents(t.sl_price)}</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">
                      {t.exit_trigger === 'SL' ? 'triggered' : 'watching'}
                    </p>
                  </>
                ) : <p className="font-mono text-xs text-slate-600">{'\u2014'}</p>}
              </div>
              {/* Exit Info — only shown if bracket fired */}
              {t.exit_trigger && (
                <>
                  <div>
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Exit Trigger</p>
                    <p className={`font-mono text-xs font-semibold ${t.exit_trigger === 'TP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.exit_trigger}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Exit Price</p>
                    <p className="font-mono text-xs font-semibold text-slate-200">{fmtCents(t.exit_price)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Exit Filled</p>
                    <p className="font-mono text-xs font-semibold text-slate-200">
                      {t.exit_filled != null ? Number(t.exit_filled).toFixed(4) : '\u2014'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Exit Time</p>
                    <p className="font-mono text-xs text-slate-300">{dtMs(t.exit_at)}</p>
                  </div>
                </>
              )}
              {/* Timing */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Order Received</p>
                <p className="font-mono text-xs text-slate-300">{dtMs(t.order_received_at)}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Ask Fetched</p>
                <p className="font-mono text-xs text-sky-400">{dtMs(t.ask_fetched_at)}</p>
              </div>
              {/* Settlement countdown */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Settles At</p>
                {settled ? (
                  <p className="text-xs text-slate-500">{settled.date} {settled.time}</p>
                ) : <p className="text-xs text-slate-600">{'\u2014'}</p>}
                {isA1 && !candleActive && candleStartDiff > 0 ? (
                  <>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] text-indigo-400 w-10">starts</span>
                      <span className="font-mono text-xs font-semibold text-indigo-400">{fmtDiff(candleStartDiff)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-amber-500/60 w-10">settles</span>
                      <span className="font-mono text-xs font-semibold text-amber-500/60">{countdown}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2a' }}>
                        <div className="h-full rounded-full transition-all duration-1000" style={{ background: '#818cf8', width: `${pct.toFixed(1)}%` }} />
                      </div>
                    </div>
                  </>
                ) : settling ? (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2a' }}>
                      <div className="h-full rounded-full" style={{ background: '#38bdf8', width: '100%' }} />
                    </div>
                    <span className="font-mono text-xs font-semibold text-sky-400 animate-pulse shrink-0">settling...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    {isA1 && candleActive && (
                      <span className="text-[9px] text-emerald-500 shrink-0">candle active</span>
                    )}
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2a' }}>
                      <div className="h-full rounded-full transition-all duration-1000" style={{ background: '#f59e0b', width: `${pct.toFixed(1)}%` }} />
                    </div>
                    <span className="font-mono text-xs font-semibold text-amber-400 shrink-0 w-14 text-right">{countdown}</span>
                  </div>
                )}
              </div>
              {t.ttl != null && (
                <div>
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">TTL</p>
                  {ttlStillActive ? (
                    <>
                      <p className="font-mono text-xs font-semibold text-amber-400">{t.ttl}s</p>
                      <p className="text-[9px] text-slate-600 mt-0.5">auto-cancel if unfilled</p>
                    </>
                  ) : (
                    <>
                      <p className="font-mono text-xs text-slate-500">{t.ttl}s</p>
                      <p className="text-[9px] text-emerald-500/60 mt-0.5">filled before expiry</p>
                    </>
                  )}
                </div>
              )}
              {t.reason && (
                <div className="col-span-2 sm:col-span-3 lg:col-span-6">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Reason</p>
                  <p className="text-xs text-amber-300/80 leading-relaxed">{t.reason}</p>
                </div>
              )}
              {/* Order Trace section */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-6 pt-1 flex items-center gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); onTrace(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Order Trace
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onInspect(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-500/40 hover:bg-sky-500/5 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Inspector
                </button>
                {t.traces && t.traces.length > 0 && (
                  <span className="text-[10px] text-slate-600">{t.traces.length} trace{t.traces.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              {/* Inline traces */}
              {t.traces && t.traces.length > 0 && (
                <div className="col-span-2 sm:col-span-3 lg:col-span-6">
                  <TraceTimeline traces={t.traces} />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Pagination({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  let pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('\u2026');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('\u2026');
    pages.push(totalPages);
  }

  const btn = (label: string | number, page: number, active = false, disabled = false) => (
    <button
      key={`${label}-${page}`}
      onClick={() => onPageChange(page)}
      disabled={disabled}
      className={`h-6 min-w-[24px] px-1.5 rounded text-[11px] font-medium transition-colors ${
        active
          ? 'bg-violet-600/80 text-white border border-violet-500'
          : disabled
            ? 'text-slate-700 cursor-not-allowed'
            : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1a2a] border border-transparent'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      {btn('\u2039', currentPage - 1, false, currentPage === 1)}
      {pages.map((p, i) =>
        typeof p === 'string' ? (
          <span key={`ellipsis-${i}`} className="text-[11px] text-slate-600 px-0.5 select-none">{p}</span>
        ) : (
          btn(p, p, p === currentPage)
        ),
      )}
      {btn('\u203A', currentPage + 1, false, currentPage === totalPages)}
    </div>
  );
}
