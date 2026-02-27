'use client';

import { useState, useEffect, useMemo } from 'react';
import { Trade, Bot } from '@/lib/api';
import { BOT_PALETTE, parseUTC, dtMs, dtShort, dtParts, fmtDiff, fmtCents } from '@/lib/helpers';
import SymbolBadge from '@/components/ui/symbol-badge';
import { OrderTypeBadge, BracketBadges, OrderStatusBadge } from '@/components/ui/order-badges';
import CustomSelect from '@/components/ui/custom-select';

interface PositionsTableProps {
  trades: Trade[];
  bots: Bot[];
}

export default function PositionsTable({ trades, bots }: PositionsTableProps) {
  const [botFilter, setBotFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [timeframeFilter, setTimeframeFilter] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [, setTick] = useState(0);

  const pending = useMemo(() => trades.filter((t) => t.result === 'PENDING'), [trades]);
  const filtered = useMemo(() => pending.filter((t) => {
    if (botFilter && t.bot_name !== botFilter) return false;
    if (symbolFilter && t.symbol !== symbolFilter) return false;
    if (timeframeFilter && t.timeframe !== timeframeFilter) return false;
    return true;
  }), [pending, botFilter, symbolFilter, timeframeFilter]);
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (parseUTC(a.settlement_at)?.getTime() ?? 0) - (parseUTC(b.settlement_at)?.getTime() ?? 0)),
    [filtered],
  );

  const botNames = useMemo(() => bots.map((b) => b.bot_name).sort(), [bots]);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paged = sorted.slice(start, start + PAGE_SIZE);

  const hasActiveFilter = botFilter !== '' || symbolFilter !== '' || timeframeFilter !== '';
  const clearFilters = () => { setBotFilter(''); setSymbolFilter(''); setTimeframeFilter(''); setCurrentPage(1); };

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

  const now = Date.now();

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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect
            placeholder="All Bots"
            options={[{ value: '', label: 'All Bots' }, ...botNames.map((n) => ({ value: n, label: n }))]}
            value={botFilter}
            onChange={setBotFilter}
            searchable
          />
          <CustomSelect
            placeholder="All Symbols"
            options={[
              { value: '', label: 'All Symbols' },
              { value: 'BTC', label: '₿ BTC' },
              { value: 'ETH', label: 'Ξ ETH' },
              { value: 'SOL', label: '◎ SOL' },
              { value: 'XRP', label: '✕ XRP' },
            ]}
            value={symbolFilter}
            onChange={setSymbolFilter}
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
            onChange={setTimeframeFilter}
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
              <th className="px-4 py-2.5 text-right font-medium">Avg Price</th>
              <th className="px-4 py-2.5 text-right font-medium">Shares</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">TTL</th>
              <th className="px-4 py-2.5 text-left font-medium">Timing</th>
              <th className="px-4 py-2.5 text-left font-medium">Settles In</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={14} className="px-5 py-8 text-center text-slate-600">No open positions</td></tr>
            ) : (
              paged.map((t) => {
                const open = expandedRows.has(t.id);
                const forecastCls =
                  t.forecast === 'GREEN'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                const botIdx = bots.findIndex((b) => b.bot_name === t.bot_name);
                const botColor = BOT_PALETTE[botIdx >= 0 ? botIdx % BOT_PALETTE.length : 0];
                const settleMs = t.settlement_at ? parseUTC(t.settlement_at)?.getTime() ?? 0 : 0;
                const diff = settleMs - now;
                const countdown = diff > 0 ? fmtDiff(diff) : '\u2014';

                const createdMs = t.created_at ? parseUTC(t.created_at)?.getTime() ?? 0 : 0;
                const total = settleMs - createdMs;
                const pct = total > 0 ? Math.min(100, Math.max(0, ((now - createdMs) / total) * 100)) : 100;

                // Latency: ms between order_received_at and ask_fetched_at
                const orderMs = t.order_received_at ? parseUTC(t.order_received_at)?.getTime() ?? null : null;
                const fillMs  = t.ask_fetched_at   ? parseUTC(t.ask_fetched_at)?.getTime()   ?? null : null;
                const latencyMs = orderMs != null && fillMs != null ? fillMs - orderMs : null;

                return (
                  <PositionRow
                    key={t.id}
                    trade={t}
                    open={open}
                    forecastCls={forecastCls}
                    botColor={botColor}
                    countdown={countdown}
                    pct={pct}
                    now={now}
                    latencyMs={latencyMs}
                    onToggle={() => toggleDetail(t.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-2.5 border-t border-[#1a1a2a] flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-slate-600">
            {sorted.length ? `${start + 1}\u2013${Math.min(start + PAGE_SIZE, sorted.length)} of ${sorted.length}` : '0'}
          </span>
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      )}
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
  onToggle,
}: {
  trade: Trade;
  open: boolean;
  forecastCls: string;
  botColor: string;
  countdown: string;
  pct: number;
  now: number;
  latencyMs: number | null;
  onToggle: () => void;
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
      <tr className={`border-b border-[#0e0e1a] transition-colors ${open ? 'bg-[#0e0e1c]' : 'hover:bg-[#0e0e1a]/60'}`}>
        <td className="px-4 py-2.5 text-slate-500">#{t.id}</td>
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
        <td className="px-4 py-2.5 text-right text-slate-200">${t.amount.toFixed(2)}</td>
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
          <span className="font-mono text-[11px] font-semibold text-amber-400">{countdown}</span>
          <p className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">{dtShort(t.settlement_at)}</p>
        </td>
        <td className="px-4 py-2.5">
          <button
            onClick={onToggle}
            className={`flex items-center gap-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${open ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <svg
              className="w-3 h-3 transition-transform duration-150"
              style={{ transform: open ? 'rotate(90deg)' : undefined }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Detail
          </button>
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
                <p className="text-[9px] text-slate-600 mt-0.5">{t.limit_price != null ? 'limit fill price' : 'best ask at fill'}</p>
              </div>
              {/* Shares Held */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Shares Held</p>
                <p className={`font-mono text-xs font-semibold ${t.num_shares != null ? 'text-sky-300' : 'text-slate-600'}`}>
                  {t.num_shares != null ? Number(t.num_shares).toFixed(4) : '\u2014'}
                </p>
              </div>
              {/* Win Payout */}
              <div>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">Win Payout</p>
                <p className={`font-mono text-xs font-semibold ${t.num_shares != null ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {winPayout}
                </p>
                <p className="text-[9px] text-slate-600 mt-0.5">(1 - avg) x shares</p>
              </div>
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
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2a' }}>
                    <div className="h-full rounded-full transition-all duration-1000" style={{ background: '#f59e0b', width: `${pct.toFixed(1)}%` }} />
                  </div>
                  <span className="font-mono text-xs font-semibold text-amber-400 shrink-0 w-14 text-right">{countdown}</span>
                </div>
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
