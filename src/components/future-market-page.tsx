'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { Trade, Bot, BotPnl, BalanceHistory, apiFetch } from '@/lib/api';
import { money, pnlCls } from '@/lib/helpers';
import KpiCards from '@/components/kpi-cards';
import BalanceChart from '@/components/balance-chart';
import CustomSelect from '@/components/ui/custom-select';

/* -- Future-specific API types -- */

interface FuturePosition {
  id: number;
  bot_name: string;
  symbol: string;
  exchange: string;
  side: string;
  status: string;
  size: number;
  entry_price: number;
  exit_price: number | null;
  mark_price: number;
  leverage: number;
  margin: number;
  liquidation_price: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  entry_fee: number;
  exit_fee: number;
  tp_price: number | null;
  sl_price: number | null;
  exit_trigger: string | null;
  reason: string | null;
  created_at: string | null;
  closed_at: string | null;
}

interface FuturePrices {
  [symbol: string]: { price: number; updated_at: string };
}

/* -- Data hooks -- */

function useFutureData(intervalMs = 10_000) {
  const [positions, setPositions] = useState<FuturePosition[]>([]);
  const [closedTrades, setClosedTrades] = useState<FuturePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [pos, trades] = await Promise.all([
        apiFetch<FuturePosition[]>('/futures/positions?status=OPEN').catch(() => []),
        apiFetch<FuturePosition[]>('/futures/trades?limit=200').catch(() => []),
      ]);
      setPositions(pos);
      setClosedTrades(trades);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const start = () => { timerRef.current = setInterval(fetchAll, intervalMs); };
    const stop = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
    const onVis = () => { if (document.hidden) stop(); else { fetchAll(); start(); } };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchAll, intervalMs]);

  return { positions, closedTrades, loading, refresh: fetchAll };
}

function useFuturePrices(intervalMs = 3_000) {
  const [prices, setPrices] = useState<FuturePrices>({});

  useEffect(() => {
    let active = true;
    let id: ReturnType<typeof setInterval> | null = null;

    const doFetch = async () => {
      try {
        const resp = await apiFetch<{ prices: FuturePrices }>('/futures/prices');
        if (active) setPrices(resp.prices);
      } catch { /* keep previous */ }
    };

    const start = () => { doFetch(); id = setInterval(doFetch, intervalMs); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.hidden) stop(); else start(); };

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { active = false; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [intervalMs]);

  return prices;
}

/* -- Reason detail row -- */

function ReasonRow({ reason, colSpan }: { reason: string; colSpan: number }) {
  return (
    <tr className="bg-[#0a0a18]">
      <td colSpan={colSpan} className="px-6 py-2">
        <div className="flex items-start gap-2 text-[11px]">
          <span className="text-slate-500 shrink-0">Reason:</span>
          <span className="text-slate-300">{reason}</span>
        </div>
      </td>
    </tr>
  );
}

/* -- Live Prices Ticker -- */

const FUTURES_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];

function FuturesPriceTicker({ prices }: { prices: FuturePrices }) {
  const hasAny = Object.keys(prices).length > 0;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a2a] flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${hasAny ? 'bg-emerald-400 live-dot' : 'bg-slate-600'}`} />
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Binance Futures — Mark Prices</h3>
        <span className="text-[10px] text-slate-600 ml-auto">
          {hasAny ? `${Object.keys(prices).length} feeds` : 'Connecting...'}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#1a1a2a]">
        {FUTURES_SYMBOLS.map((sym) => {
          const p = prices[sym];
          return (
            <div key={sym} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-slate-200">{sym}</span>
                <span className="text-[9px] text-slate-600">USDT</span>
              </div>
              {p ? (
                <span className="text-lg font-bold font-mono text-white">
                  ${Number(p.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-sm text-slate-600 font-mono">--</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -- Open Positions Table -- */

function FuturePositionsTable({ positions, botNames }: { positions: FuturePosition[]; botNames: string[] }) {
  const [botFilter, setBotFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [sideFilter, setSideFilter] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const symbols = useMemo(() => [...new Set(positions.map((p) => p.symbol))].sort(), [positions]);
  const exchanges = useMemo(() => [...new Set(positions.map((p) => p.exchange))].sort(), [positions]);

  const filtered = useMemo(() => positions.filter((p) => {
    if (botFilter && p.bot_name !== botFilter) return false;
    if (symbolFilter && p.symbol !== symbolFilter) return false;
    if (sideFilter && p.side !== sideFilter) return false;
    if (exchangeFilter && p.exchange !== exchangeFilter) return false;
    return true;
  }), [positions, botFilter, symbolFilter, sideFilter, exchangeFilter]);

  const totalUnrealizedPnl = useMemo(() => filtered.reduce((s, p) => s + p.unrealized_pnl, 0), [filtered]);
  const totalMargin = useMemo(() => filtered.reduce((s, p) => s + p.margin, 0), [filtered]);

  const COL_COUNT = 13;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a2a] flex items-center gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Open Positions</h3>
        <span className="text-[10px] text-slate-600">{filtered.length} position{filtered.length !== 1 ? 's' : ''}</span>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-slate-500">Margin: <span className="text-slate-300 font-semibold">{money(totalMargin)}</span></span>
          <span className={`font-semibold ${pnlCls(totalUnrealizedPnl)}`}>
            uPnL: {money(totalUnrealizedPnl)}
          </span>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-[#0e0e1a] flex items-center gap-2 flex-wrap">
        <CustomSelect
          placeholder="All Bots"
          options={[{ value: '', label: 'All Bots' }, ...botNames.map((n) => ({ value: n, label: n }))]}
          value={botFilter}
          onChange={setBotFilter}
          searchable
          minWidth="140px"
        />
        <CustomSelect
          placeholder="All Symbols"
          options={[{ value: '', label: 'All Symbols' }, ...symbols.map((s) => ({ value: s, label: s }))]}
          value={symbolFilter}
          onChange={setSymbolFilter}
          minWidth="120px"
        />
        <CustomSelect
          placeholder="All Sides"
          options={[
            { value: '', label: 'All Sides' },
            { value: 'LONG', label: 'Long' },
            { value: 'SHORT', label: 'Short' },
          ]}
          value={sideFilter}
          onChange={setSideFilter}
          minWidth="100px"
        />
        {exchanges.length > 1 && (
          <CustomSelect
            placeholder="All Exchanges"
            options={[{ value: '', label: 'All Exchanges' }, ...exchanges.map((e) => ({ value: e, label: e }))]}
            value={exchangeFilter}
            onChange={setExchangeFilter}
            minWidth="130px"
          />
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
              <th className="px-4 py-2 text-left font-medium">Bot</th>
              <th className="px-4 py-2 text-left font-medium">Symbol</th>
              <th className="px-4 py-2 text-left font-medium">Exchange</th>
              <th className="px-4 py-2 text-center font-medium">Side</th>
              <th className="px-4 py-2 text-right font-medium">Size</th>
              <th className="px-4 py-2 text-right font-medium">Entry</th>
              <th className="px-4 py-2 text-right font-medium">Mark</th>
              <th className="px-4 py-2 text-right font-medium">Lev</th>
              <th className="px-4 py-2 text-right font-medium">Margin</th>
              <th className="px-4 py-2 text-right font-medium">Liq Price</th>
              <th className="px-4 py-2 text-center font-medium">TP / SL</th>
              <th className="px-4 py-2 text-right font-medium">uPnL</th>
              <th className="px-4 py-2 text-right font-medium">ROE</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={COL_COUNT} className="px-4 py-8 text-center text-slate-600">No open positions</td></tr>
            ) : filtered.map((p) => {
              const roe = p.margin > 0 ? (p.unrealized_pnl / p.margin) * 100 : 0;
              const isExpanded = expandedId === p.id;
              return (
                <Fragment key={p.id}>
                  <tr
                    className={`border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60 ${p.reason ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-[#0e0e1a]/40' : ''}`}
                    onClick={() => p.reason && setExpandedId(isExpanded ? null : p.id)}
                  >
                    <td className="px-4 py-2 text-slate-300 font-medium">{p.bot_name}</td>
                    <td className="px-4 py-2 text-slate-200 font-semibold">{p.symbol}</td>
                    <td className="px-4 py-2 text-slate-500 text-[10px]">{p.exchange}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.side === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {p.side}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-200 font-mono">{p.size.toFixed(4)}</td>
                    <td className="px-4 py-2 text-right text-slate-300 font-mono">${p.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right text-slate-300 font-mono">${p.mark_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right text-amber-400 font-semibold">{p.leverage}x</td>
                    <td className="px-4 py-2 text-right text-slate-400">{money(p.margin)}</td>
                    <td className="px-4 py-2 text-right text-slate-500 font-mono text-[10px]">
                      {p.liquidation_price != null ? `$${p.liquidation_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-center text-[10px] font-mono">
                      {p.tp_price ? <span className="text-emerald-400">TP ${p.tp_price.toLocaleString()}</span> : null}
                      {p.tp_price && p.sl_price ? <span className="text-slate-600"> / </span> : null}
                      {p.sl_price ? <span className="text-rose-400">SL ${p.sl_price.toLocaleString()}</span> : null}
                      {!p.tp_price && !p.sl_price ? <span className="text-slate-600">{'\u2014'}</span> : null}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${pnlCls(p.unrealized_pnl)}`}>
                      {money(p.unrealized_pnl)}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold text-[10px] ${pnlCls(roe)}`}>
                      {roe >= 0 ? '+' : ''}{roe.toFixed(2)}%
                    </td>
                  </tr>
                  {isExpanded && p.reason && <ReasonRow reason={p.reason} colSpan={COL_COUNT} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -- Trade History Table -- */

const PAGE_SIZE_HIST = 15;

function FutureTradeHistory({ trades, botNames }: { trades: FuturePosition[]; botNames: string[] }) {
  const [botFilter, setBotFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [sideFilter, setSideFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))].sort(), [trades]);
  const exchanges = useMemo(() => [...new Set(trades.map((t) => t.exchange))].sort(), [trades]);

  const filtered = useMemo(() => trades.filter((t) => {
    if (botFilter && t.bot_name !== botFilter) return false;
    if (symbolFilter && t.symbol !== symbolFilter) return false;
    if (sideFilter && t.side !== sideFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (exchangeFilter && t.exchange !== exchangeFilter) return false;
    return true;
  }), [trades, botFilter, symbolFilter, sideFilter, statusFilter, exchangeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE_HIST));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE_HIST;
  const visible = filtered.slice(start, start + PAGE_SIZE_HIST);

  const totalPnl = useMemo(() => filtered.reduce((s, t) => s + t.realized_pnl, 0), [filtered]);
  const totalFees = useMemo(() => filtered.reduce((s, t) => s + (t.entry_fee || 0) + (t.exit_fee || 0), 0), [filtered]);
  const wins = useMemo(() => filtered.filter((t) => t.realized_pnl > 0).length, [filtered]);
  const losses = useMemo(() => filtered.filter((t) => t.realized_pnl <= 0).length, [filtered]);

  const COL_COUNT = 13;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a2a] flex items-center gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Trade History</h3>
        <span className="text-[10px] text-slate-600">{filtered.length} trade{filtered.length !== 1 ? 's' : ''}</span>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-slate-500">
            <span className="text-emerald-400">{wins}W</span>
            {' / '}
            <span className="text-rose-400">{losses}L</span>
          </span>
          <span className="text-slate-500">Fees: <span className="text-slate-400">{money(totalFees)}</span></span>
          <span className={`font-semibold ${pnlCls(totalPnl)}`}>
            PnL: {money(totalPnl)}
          </span>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-[#0e0e1a] flex items-center gap-2 flex-wrap">
        <CustomSelect
          placeholder="All Bots"
          options={[{ value: '', label: 'All Bots' }, ...botNames.map((n) => ({ value: n, label: n }))]}
          value={botFilter}
          onChange={(v) => { setBotFilter(v); setCurrentPage(1); }}
          searchable
          minWidth="140px"
        />
        <CustomSelect
          placeholder="All Symbols"
          options={[{ value: '', label: 'All Symbols' }, ...symbols.map((s) => ({ value: s, label: s }))]}
          value={symbolFilter}
          onChange={(v) => { setSymbolFilter(v); setCurrentPage(1); }}
          minWidth="120px"
        />
        <CustomSelect
          placeholder="All Sides"
          options={[
            { value: '', label: 'All Sides' },
            { value: 'LONG', label: 'Long' },
            { value: 'SHORT', label: 'Short' },
          ]}
          value={sideFilter}
          onChange={(v) => { setSideFilter(v); setCurrentPage(1); }}
          minWidth="100px"
        />
        <CustomSelect
          placeholder="All Status"
          options={[
            { value: '', label: 'All Status' },
            { value: 'CLOSED', label: 'Closed' },
            { value: 'LIQUIDATED', label: 'Liquidated' },
          ]}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}
          minWidth="110px"
        />
        {exchanges.length > 1 && (
          <CustomSelect
            placeholder="All Exchanges"
            options={[{ value: '', label: 'All Exchanges' }, ...exchanges.map((e) => ({ value: e, label: e }))]}
            value={exchangeFilter}
            onChange={(v) => { setExchangeFilter(v); setCurrentPage(1); }}
            minWidth="130px"
          />
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-[#1a1a2a] uppercase tracking-wide">
              <th className="px-4 py-2 text-left font-medium">Bot</th>
              <th className="px-4 py-2 text-left font-medium">Symbol</th>
              <th className="px-4 py-2 text-left font-medium">Exchange</th>
              <th className="px-4 py-2 text-center font-medium">Side</th>
              <th className="px-4 py-2 text-right font-medium">Size</th>
              <th className="px-4 py-2 text-right font-medium">Entry</th>
              <th className="px-4 py-2 text-right font-medium">Exit</th>
              <th className="px-4 py-2 text-right font-medium">Lev</th>
              <th className="px-4 py-2 text-right font-medium">Fees</th>
              <th className="px-4 py-2 text-center font-medium">Exit</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">PnL</th>
              <th className="px-4 py-2 text-right font-medium">Closed</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={COL_COUNT} className="px-4 py-8 text-center text-slate-600">No trades yet</td></tr>
            ) : visible.map((t) => {
              const totalFee = (t.entry_fee || 0) + (t.exit_fee || 0);
              const isExpanded = expandedId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr
                    className={`border-b border-[#0e0e1a] hover:bg-[#0e0e1a]/60 ${t.reason ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-[#0e0e1a]/40' : ''}`}
                    onClick={() => t.reason && setExpandedId(isExpanded ? null : t.id)}
                  >
                    <td className="px-4 py-2 text-slate-300 font-medium">{t.bot_name}</td>
                    <td className="px-4 py-2 text-slate-200 font-semibold">{t.symbol}</td>
                    <td className="px-4 py-2 text-slate-500 text-[10px]">{t.exchange}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        t.side === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {t.side}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-200 font-mono">{t.size.toFixed(4)}</td>
                    <td className="px-4 py-2 text-right text-slate-300 font-mono">${t.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right text-slate-300 font-mono">
                      {t.exit_price != null ? `$${t.exit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-right text-amber-400">{t.leverage}x</td>
                    <td className="px-4 py-2 text-right text-slate-500">{money(totalFee)}</td>
                    <td className="px-4 py-2 text-center">
                      {t.exit_trigger ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.exit_trigger === 'TP' ? 'bg-emerald-500/10 text-emerald-400'
                          : t.exit_trigger === 'SL' ? 'bg-rose-500/10 text-rose-400'
                          : t.exit_trigger === 'LIQ' ? 'bg-orange-500/10 text-orange-400'
                          : 'bg-sky-500/10 text-sky-400'
                        }`}>
                          {t.exit_trigger}
                        </span>
                      ) : <span className="text-slate-600">{'\u2014'}</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        t.status === 'CLOSED' ? 'bg-sky-500/10 text-sky-400'
                        : t.status === 'LIQUIDATED' ? 'bg-orange-500/10 text-orange-400'
                        : 'bg-slate-500/10 text-slate-400'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${pnlCls(t.realized_pnl)}`}>
                      {money(t.realized_pnl)}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500 text-[10px] font-mono">
                      {t.closed_at ? new Date(t.closed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014'}
                    </td>
                  </tr>
                  {isExpanded && t.reason && <ReasonRow reason={t.reason} colSpan={COL_COUNT} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-[#1a1a2a] flex items-center justify-between">
          <span className="text-[10px] text-slate-600">
            {start + 1}{'\u2013'}{Math.min(start + PAGE_SIZE_HIST, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-2 py-1 text-[10px] rounded border border-[#1f1f32] text-slate-400 hover:text-white disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-[10px] text-slate-500 px-2">{safePage}/{totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2 py-1 text-[10px] rounded border border-[#1f1f32] text-slate-400 hover:text-white disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -- Main Future Market Page -- */

interface FutureMarketPageProps {
  trades: Trade[];
  bots: Bot[];
  botPnls: BotPnl[];
  balanceHistory: BalanceHistory[];
}

export default function FutureMarketPage({ trades, bots, botPnls, balanceHistory }: FutureMarketPageProps) {
  const prices = useFuturePrices(3_000);
  const { positions, closedTrades, loading } = useFutureData(10_000);
  const botNames = useMemo(() => bots.map((b) => b.bot_name).sort(), [bots]);

  return (
    <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
      {/* Live mark prices */}
      <FuturesPriceTicker prices={prices} />

      {/* Shared leaderboard */}
      <KpiCards trades={trades} bots={bots} botPnls={botPnls} />

      {/* Shared balance chart */}
      <BalanceChart
        bots={bots}
        botPnls={botPnls}
        balanceHistory={balanceHistory}
        trades={trades}
      />

      {/* Open Positions */}
      <FuturePositionsTable positions={positions} botNames={botNames} />

      {/* Trade History */}
      <FutureTradeHistory trades={closedTrades} botNames={botNames} />
    </main>
  );
}
