'use client';

import { useState, useMemo } from 'react';
import { Trade, Bot } from '@/lib/api';
import { money, pnlCls, parseUTC, dtMs, dtParts, fmtCents } from '@/lib/helpers';
import SymbolBadge from '@/components/ui/symbol-badge';
import ResultPill, { displayResult } from '@/components/ui/result-pill';
import CustomSelect from '@/components/ui/custom-select';
import { OrderTypeBadge, BracketBadges, ExitTriggerBadge } from '@/components/ui/order-badges';
import OrderTraceModal from '@/components/modals/order-trace-modal';
import InspectorModal from '@/components/modals/inspector-modal';
import TraceTimeline from '@/components/ui/trace-timeline';
import type { TradeHistorySettings } from '@/lib/settings-types';

const PAGE_SIZE = 10;

interface TradeHistoryProps {
  trades: Trade[];
  bots: Bot[];
  isAdmin?: boolean;
  initialSettings?: TradeHistorySettings;
  onSettingsChange?: (s: TradeHistorySettings) => void;
}

export default function TradeHistory({ trades, bots, isAdmin, initialSettings, onSettingsChange }: TradeHistoryProps) {
  const [botFilter, setBotFilter] = useState(initialSettings?.botFilter ?? '');
  const [symbolFilter, setSymbolFilter] = useState(initialSettings?.symbolFilter ?? '');
  const [tfFilter, setTfFilter] = useState(initialSettings?.tfFilter ?? '');
  const [typeFilter, setTypeFilter] = useState(initialSettings?.typeFilter ?? '');
  const [forecastFilter, setForecastFilter] = useState(initialSettings?.forecastFilter ?? '');
  const [resultFilter, setResultFilter] = useState(initialSettings?.resultFilter ?? '');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(initialSettings?.open ?? true);
  const [traceTrade, setTraceTrade] = useState<Trade | null>(null);
  const [inspectTrade, setInspectTrade] = useState<Trade | null>(null);

  const emitSettings = (patch: Partial<TradeHistorySettings>) => {
    onSettingsChange?.({ botFilter, symbolFilter, tfFilter, typeFilter, forecastFilter, resultFilter, open: historyOpen, ...patch });
  };

  const botNames = useMemo(() => bots.map((b) => b.bot_name).sort(), [bots]);

  const filtered = useMemo(() => {
    return trades.filter(
      (t) =>
        t.result !== 'PENDING' &&
        (!botFilter || t.bot_name === botFilter) &&
        (!symbolFilter || t.symbol === symbolFilter) &&
        (!tfFilter || t.timeframe === tfFilter) &&
        (!typeFilter || (typeFilter === 'MARKET' ? t.limit_price == null : t.limit_price != null)) &&
        (!forecastFilter || t.forecast === forecastFilter) &&
        (!resultFilter || displayResult(t) === resultFilter),
    );
  }, [trades, botFilter, symbolFilter, tfFilter, typeFilter, forecastFilter, resultFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const vis = filtered.slice(start, start + PAGE_SIZE);

  const clearFilters = () => {
    setBotFilter('');
    setSymbolFilter('');
    setTfFilter('');
    setTypeFilter('');
    setForecastFilter('');
    setResultFilter('');
    setCurrentPage(1);
    emitSettings({ botFilter: '', symbolFilter: '', tfFilter: '', typeFilter: '', forecastFilter: '', resultFilter: '' });
  };

  const toggleDetail = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Symbol stats
  const symbolStats = useMemo(() => {
    if (!symbolFilter) return null;
    const st = trades.filter((t) => t.symbol === symbolFilter);
    if (!st.length) return null;
    const wins = st.filter((t) => t.result === 'WIN').length;
    const losses = st.filter((t) => t.result === 'LOSS').length;
    const pend = st.filter((t) => t.result === 'PENDING').length;
    const profit = st.reduce((s, t) => s + (t.profit || 0), 0);
    return { symbol: symbolFilter, total: st.length, wins, losses, pending: pend, profit };
  }, [trades, symbolFilter]);

  const from = filtered.length ? start + 1 : 0;
  const to = Math.min(start + PAGE_SIZE, filtered.length);

  const filteredStats = useMemo(() => {
    const wins = filtered.filter((t) => t.result === 'WIN').length;
    const losses = filtered.filter((t) => t.result === 'LOSS').length;
    const totalProfit = filtered.reduce((s, t) => s + (t.profit ?? 0), 0);
    const totalAmount = filtered.reduce((s, t) => s + t.amount, 0);
    const totalFees = filtered.reduce((s, t) => s + (t.entry_fee ?? 0), 0);
    return { wins, losses, totalProfit, totalAmount, totalFees };
  }, [filtered]);

  return (
    <div className="card overflow-hidden">
      {/* Filter row */}
      <div className="px-5 py-3.5 border-b border-[#1a1a2a] flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <button onClick={() => { setHistoryOpen(!historyOpen); emitSettings({ open: !historyOpen }); }} className="flex items-center gap-2 shrink-0 group">
          <span style={{ transform: historyOpen ? '' : 'rotate(-90deg)', transition: 'transform .25s ease', display: 'flex', alignItems: 'center' }}>
            <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <h3 className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 uppercase tracking-widest transition-colors">Trade History</h3>
          {filtered.length > 0 && (
            <span className="text-[11px] text-slate-500 ml-1">
              P&L <span className={`font-semibold ${pnlCls(filteredStats.totalProfit)}`}>{money(filteredStats.totalProfit)}</span>
              <span className="text-slate-600 ml-1.5">{filteredStats.wins}W / {filteredStats.losses}L</span>
              {filteredStats.totalFees > 0 && (
                <span className="text-slate-600 ml-1.5">Fee <span className="text-amber-400/70">{money(filteredStats.totalFees)}</span></span>
              )}
              <span className="text-slate-600 ml-1.5">Vol {money(filteredStats.totalAmount)}</span>
            </span>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect
            placeholder="All Bots"
            options={[{ value: '', label: 'All Bots' }, ...botNames.map((n) => ({ value: n, label: n }))]}
            value={botFilter}
            onChange={(v) => { setBotFilter(v); setCurrentPage(1); emitSettings({ botFilter: v }); }}
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
            onChange={(v) => { setSymbolFilter(v); setCurrentPage(1); emitSettings({ symbolFilter: v }); }}
          />
          <CustomSelect
            placeholder="All TF"
            options={[
              { value: '', label: 'All TF' },
              { value: 'M5', label: '5m' },
              { value: 'M15', label: '15m' },
              { value: 'H1', label: '1h' },
            ]}
            value={tfFilter}
            onChange={(v) => { setTfFilter(v); setCurrentPage(1); emitSettings({ tfFilter: v }); }}
          />
          <CustomSelect
            placeholder="All Types"
            options={[
              { value: '', label: 'All Types' },
              { value: 'MARKET', label: 'MARKET' },
              { value: 'LIMIT', label: 'LIMIT' },
            ]}
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setCurrentPage(1); emitSettings({ typeFilter: v }); }}
          />
          <CustomSelect
            placeholder="All Forecasts"
            options={[
              { value: '', label: 'All Forecasts' },
              { value: 'GREEN', label: '\u25CF GREEN' },
              { value: 'RED', label: '\u25CF RED' },
            ]}
            value={forecastFilter}
            onChange={(v) => { setForecastFilter(v); setCurrentPage(1); emitSettings({ forecastFilter: v }); }}
          />
          <CustomSelect
            placeholder="All Results"
            options={[
              { value: '', label: 'All Results' },
              { value: 'PENDING', label: 'PENDING' },
              { value: 'WIN', label: 'WIN' },
              { value: 'LOSS', label: 'LOSS' },
              { value: 'CANCELLED', label: 'CANCELLED' },
              { value: 'EXPIRED', label: 'EXPIRED' },
            ]}
            value={resultFilter}
            onChange={(v) => { setResultFilter(v); setCurrentPage(1); emitSettings({ resultFilter: v }); }}
          />
          <button
            onClick={clearFilters}
            className="h-[30px] px-2.5 rounded-lg border border-[#1f1f32] text-[11px] text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      </div>

      <div className={`collapsible ${historyOpen ? '' : 'collapsed'}`}>
        <div className="collapsible-inner">
          {/* Symbol stats panel */}
          {symbolStats && (
            <div className="border-b border-[#1a1a2a] px-5 py-3 perf-panel">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: '#0d0d2a', border: '1px solid #2a2a4a' }}>
                    <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Symbol</p>
                    <p className="font-bold text-sm text-violet-300"><SymbolBadge symbol={symbolStats.symbol} /></p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="font-bold text-sm text-emerald-400">{symbolStats.wins}</p>
                    <p className="text-[9px] text-slate-600">WIN</p>
                  </div>
                  <div className="w-px h-6 bg-[#1f1f32]" />
                  <div className="text-center">
                    <p className="font-bold text-sm text-rose-400">{symbolStats.losses}</p>
                    <p className="text-[9px] text-slate-600">LOSS</p>
                  </div>
                  <div className="w-px h-6 bg-[#1f1f32]" />
                  <div className="text-center">
                    <p className="font-bold text-sm text-amber-400">{symbolStats.pending}</p>
                    <p className="text-[9px] text-slate-600">PEND</p>
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <p className={`font-bold text-base ${pnlCls(symbolStats.profit)}`}>{money(symbolStats.profit)}</p>
                  <p className="text-[10px] text-slate-500">{symbolStats.total} trade{symbolStats.total !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
          )}

          {/* Trade table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">ID</th>
                  <th className="px-5 py-3 text-left font-medium">Bot</th>
                  <th className="px-5 py-3 text-left font-medium">Symbol</th>
                  <th className="px-5 py-3 text-left font-medium">TF</th>
                  <th className="px-5 py-3 text-left font-medium">Forecast</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-right font-medium">Fee</th>
                  <th className="px-5 py-3 text-right font-medium">Avg Price</th>
                  <th className="px-5 py-3 text-right font-medium">Shares</th>
                  <th className="px-5 py-3 text-left font-medium">Result</th>
                  <th className="px-5 py-3 text-left font-medium">Exit</th>
                  <th className="px-5 py-3 text-right font-medium">Profit</th>
                  <th className="px-5 py-3 text-left font-medium">Timing</th>
                </tr>
              </thead>
              <tbody>
                {vis.length === 0 ? (
                  <tr><td colSpan={14} className="px-5 py-12 text-center text-slate-600">No trades match filters</td></tr>
                ) : (
                  vis.map((t) => <TradeRow key={t.id} trade={t} open={expandedRows.has(t.id)} onToggle={() => toggleDetail(t.id)} onTrace={() => setTraceTrade(t)} isAdmin={isAdmin} onInspect={() => setInspectTrade(t)} />)
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination + summary */}
          <div className="px-5 py-2.5 border-t border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] text-slate-600">
                {filtered.length ? `${from}\u2013${to} of ${filtered.length} trade${filtered.length !== 1 ? 's' : ''}` : '0 trades'}
              </span>
            </div>
            <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>
      </div>

      <OrderTraceModal open={traceTrade !== null} onClose={() => setTraceTrade(null)} trade={traceTrade} />
      <InspectorModal open={inspectTrade !== null} onClose={() => setInspectTrade(null)} trade={inspectTrade} />
    </div>
  );
}

function TradeRow({ trade: t, open, onToggle, onTrace, isAdmin, onInspect }: { trade: Trade; open: boolean; onToggle: () => void; onTrace: () => void; isAdmin?: boolean; onInspect: () => void }) {
  const fHtml = t.forecast === 'GREEN'
    ? <span className="font-bold text-emerald-400">&bull; GREEN</span>
    : <span className="font-bold text-rose-400">&bull; RED</span>;

  const created = dtParts(t.created_at);
  const updated = dtParts(t.updated_at);
  const orderRecvFull = t.order_received_at ? { ...dtParts(t.order_received_at)!, time: dtMs(t.order_received_at) } : null;
  const askFetchedFull = t.ask_fetched_at ? { ...dtParts(t.ask_fetched_at)!, time: dtMs(t.ask_fetched_at) } : null;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-[#0e0e1a] transition-colors cursor-pointer select-none ${open ? 'bg-[#0e0e1c]' : 'hover:bg-[#0e0e1a]/60'}`}
      >
        <td className="px-5 py-2.5 text-slate-600">
          <span className="flex items-center gap-1">
            <svg
              className="w-3 h-3 text-slate-600 transition-transform duration-150 shrink-0"
              style={{ transform: open ? 'rotate(90deg)' : undefined }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            #{t.id}
          </span>
        </td>
        <td className="px-5 py-2.5 font-semibold">{t.bot_name}</td>
        <td className="px-5 py-2.5"><SymbolBadge symbol={t.symbol} /></td>
        <td className="px-5 py-2.5">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#0e0e1a', border: '1px solid #1f1f32' }}>{t.timeframe}</span>
        </td>
        <td className="px-5 py-2.5">{fHtml}</td>
        <td className="px-5 py-2.5">
          <div className="flex flex-col gap-0.5">
            <OrderTypeBadge trade={t} />
            <BracketBadges trade={t} />
          </div>
        </td>
        <td className="px-5 py-2.5 text-right font-medium">{money(t.amount)}</td>
        <td className="px-5 py-2.5 text-right text-slate-500 text-[11px]">
          {t.entry_fee != null && t.entry_fee > 0 ? `$${t.entry_fee.toFixed(2)}` : '\u2014'}
        </td>
        <td className={`px-5 py-2.5 text-right font-mono text-xs ${t.avg_price != null ? 'text-violet-300' : 'text-slate-600'}`}>
          {t.avg_price != null ? fmtCents(t.avg_price) : '\u2014'}
        </td>
        <td className="px-5 py-2.5 text-right text-sky-400">{t.num_shares != null ? Number(t.num_shares).toFixed(2) : '\u2014'}</td>
        <td className="px-5 py-2.5">{t.result ? <ResultPill result={t.result} trade={t} /> : '\u2014'}</td>
        <td className="px-5 py-2.5">
          {t.exit_trigger ? (
            <ExitTriggerBadge trade={t} />
          ) : (
            <span className="text-[10px] text-slate-600">{'\u2014'}</span>
          )}
        </td>
        <td className={`px-5 py-2.5 text-right font-semibold ${t.profit != null ? pnlCls(t.profit) : 'text-slate-600'}`}>
          {t.profit != null ? money(t.profit) : '\u2014'}
        </td>
        <td className="px-5 py-2.5">
          <TimingCell trade={t} />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[#0e0e1a]">
          <td colSpan={14} style={{ background: '#09090f', borderLeft: '2px solid rgba(139,92,246,.3)' }}>
            <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-3">
              {/* Order Type */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Order Type</p>
                <OrderTypeBadge trade={t} />
                {t.limit_price != null && (
                  <p className="text-[9px] text-slate-600 mt-0.5">limit @ {fmtCents(t.limit_price)}</p>
                )}
              </div>
              {/* Avg Price */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Avg Price</p>
                <p className={`font-mono text-xs font-semibold ${t.avg_price != null ? 'text-violet-300' : 'text-slate-600'}`}>{fmtCents(t.avg_price)}</p>
              </div>
              {/* Shares */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Shares</p>
                <p className={`font-mono text-xs font-semibold ${t.num_shares != null ? 'text-sky-300' : 'text-slate-600'}`}>
                  {t.num_shares != null ? Number(t.num_shares).toFixed(4) : '\u2014'}
                </p>
              </div>
              {/* Win Payout */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Win Payout</p>
                <p className={`font-mono text-xs font-semibold ${t.num_shares != null ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {t.num_shares != null && t.avg_price != null ? '+$' + ((1 - t.avg_price) * t.num_shares).toFixed(2) : '\u2014'}
                </p>
              </div>
              {/* Take Profit */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Take Profit</p>
                {t.tp_price != null ? (
                  <p className="font-mono text-xs font-semibold text-emerald-400">{fmtCents(t.tp_price)}</p>
                ) : <p className="font-mono text-xs text-slate-600">{'\u2014'}</p>}
              </div>
              {/* Stop Loss */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Stop Loss</p>
                {t.sl_price != null ? (
                  <p className="font-mono text-xs font-semibold text-rose-400">{fmtCents(t.sl_price)}</p>
                ) : <p className="font-mono text-xs text-slate-600">{'\u2014'}</p>}
              </div>
              {/* Exit Info */}
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
                {orderRecvFull ? (
                  <>
                    <span className="whitespace-nowrap text-xs text-slate-300">{orderRecvFull.date}</span>
                    <br />
                    <span className="text-[10px] text-slate-600 font-mono whitespace-nowrap">{orderRecvFull.time}</span>
                  </>
                ) : <p className="text-xs text-slate-600">{'\u2014'}</p>}
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Ask Fetched</p>
                {askFetchedFull ? (
                  <>
                    <span className="whitespace-nowrap text-xs text-sky-400">{askFetchedFull.date}</span>
                    <br />
                    <span className="text-[10px] text-slate-600 font-mono whitespace-nowrap">{askFetchedFull.time}</span>
                  </>
                ) : <p className="text-xs text-slate-600">{'\u2014'}</p>}
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Price Close</p>
                <p className={`font-mono text-xs font-semibold ${t.price_close != null ? 'text-slate-200' : 'text-slate-600'}`}>
                  {t.price_close != null ? Number(t.price_close).toFixed(5) : '\u2014'}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Opened</p>
                {created ? (
                  <>
                    <span className="whitespace-nowrap text-xs text-slate-400">{created.date}</span>
                    <br />
                    <span className="text-[10px] text-slate-600 whitespace-nowrap">{created.time}</span>
                  </>
                ) : <p className="text-xs text-slate-600">{'\u2014'}</p>}
              </div>
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Settled</p>
                {updated ? (
                  <>
                    <span className="whitespace-nowrap text-xs text-slate-400">{updated.date}</span>
                    <br />
                    <span className="text-[10px] text-slate-600 whitespace-nowrap">{updated.time}</span>
                  </>
                ) : <p className="text-xs text-slate-600">{'\u2014'}</p>}
              </div>
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

function TimingCell({ trade: t }: { trade: Trade }) {
  const orderMs = t.order_received_at ? parseUTC(t.order_received_at)?.getTime() ?? null : null;
  const fillMs  = t.ask_fetched_at   ? parseUTC(t.ask_fetched_at)?.getTime()   ?? null : null;
  const latencyMs = orderMs != null && fillMs != null ? fillMs - orderMs : null;

  return (
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
