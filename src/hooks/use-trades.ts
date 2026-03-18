'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, Trade, Bot, BotPnl, BalanceHistory, BalanceHistoryGrouped, SchedulerStatus, PriceEntry, OrderbookEntry, AchievementDef, BotAchievement, fetchTradeHistory, TradeHistoryFilters } from '@/lib/api';

export interface DashboardData {
  trades: Trade[];
  bots: Bot[];
  botPnls: BotPnl[];
  balanceHistory: BalanceHistory[];
  balanceHistoryGrouped: BalanceHistoryGrouped[];
  schedulerStatus: SchedulerStatus;
  achievementDefs: AchievementDef[];
  botAchievements: Record<number, BotAchievement[]>;
}

export function useDashboardData(intervalMs = 30_000) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [trades, bots, botPnls, balanceHistoryGrouped, schedulerStatus, achievementDefs, botAchievements] = await Promise.all([
        apiFetch<Trade[]>('/binary-options?limit=500'),
        apiFetch<Bot[]>('/bots'),
        apiFetch<BotPnl[]>('/bots/pnl').catch(() => [] as BotPnl[]),
        apiFetch<BalanceHistoryGrouped[]>('/bots/balance-history').catch(() => [] as BalanceHistoryGrouped[]),
        apiFetch<SchedulerStatus>('/dashboard/scheduler/status'),
        apiFetch<AchievementDef[]>('/achievements/').catch(() => [] as AchievementDef[]),
        apiFetch<Record<number, BotAchievement[]>>('/achievements/all-bots').catch(() => ({} as Record<number, BotAchievement[]>)),
      ]);
      // Flatten grouped data to legacy BalanceHistory[] for backward compat
      const balanceHistory: BalanceHistory[] = [];
      for (const group of balanceHistoryGrouped) {
        for (const entry of group.bots) {
          balanceHistory.push({
            id: 0,
            bot_name: entry.bot_name,
            balance: entry.new_balance,
            recorded_at: group.settled_at,
          });
        }
      }
      setData({ trades, bots, botPnls, balanceHistory, balanceHistoryGrouped, schedulerStatus, achievementDefs, botAchievements });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    const startPolling = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(fetchAll, intervalMs);
    };
    const stopPolling = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
    const onVisibility = () => {
      if (document.hidden) stopPolling();
      else { fetchAll(); startPolling(); }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAll, intervalMs]);

  return { data, loading, error, refresh: fetchAll };
}

/** Server-side paginated trade history — fetches ALL orders via backend pagination. */
export function useTradeHistory(filters: TradeHistoryFilters, pageSize = 20, pollMs = 30_000, enabled = true) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep latest filters/page in ref so polling always uses current values
  const stateRef = useRef({ filters, page, pageSize });
  stateRef.current = { filters, page, pageSize };

  // Reset to page 1 when filters change
  const filtersKey = JSON.stringify(filters);
  const prevFiltersKey = useRef(filtersKey);
  if (filtersKey !== prevFiltersKey.current) {
    prevFiltersKey.current = filtersKey;
    setPage(1);
    stateRef.current.page = 1;
  }

  const doFetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const { filters: f, page: p, pageSize: ps } = stateRef.current;
      const result = await fetchTradeHistory({ ...f, limit: ps, offset: (p - 1) * ps });
      setTrades(result.trades);
      setTotal(result.total);
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    doFetch();
  }, [doFetch, enabled, filtersKey, page, pageSize]);

  // Polling with visibility awareness
  useEffect(() => {
    if (!enabled) return;
    const start = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(doFetch, pollMs);
    };
    const stop = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else { doFetch(); start(); }
    };

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [doFetch, enabled, pollMs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { trades, total, page, setPage, totalPages, loading, refresh: doFetch };
}

/** Dedicated hook for live price feed — polls every 5s, pauses when tab hidden. */
export function usePrices() {
  const [prices, setPrices] = useState<PriceEntry[]>([]);

  useEffect(() => {
    let active = true;
    let id: ReturnType<typeof setInterval> | null = null;

    const doFetch = async () => {
      try {
        const resp = await apiFetch<{ prices: PriceEntry[] }>('/binary-options/engine/prices');
        if (active) setPrices(resp.prices);
      } catch {
        // keep previous prices on error
      }
    };

    const start = () => { doFetch(); id = setInterval(doFetch, 5_000); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.hidden) stop(); else start(); };

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { active = false; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return prices;
}

/**
 * WebSocket-based orderbook hook — real-time push, no HTTP polling.
 *
 * Flow:
 *   1. Connect to ws://.../poly-arena/ws/orderbook
 *   2. Server sends snapshot (current Redis state) immediately
 *   3. Server streams incremental updates via pub/sub
 *   4. Client sends filter {symbol, timeframe} on connect & on change
 *   5. Auto-reconnect with exponential backoff on disconnect
 *
 * Returns { orderbooks, connected }.
 */
export function useOrderbookWs(symbol?: string, timeframe?: string) {
  const [orderbooks, setOrderbooks] = useState<OrderbookEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef = useRef({ symbol, timeframe });

  // Keep filterRef in sync for use inside WS callbacks
  filterRef.current = { symbol, timeframe };

  useEffect(() => {
    let active = true;
    let backoff = 1000;

    const buildWsUrl = () => {
      // 1. Explicit WS URL override (full URL including path)
      const wsEnv = process.env.NEXT_PUBLIC_WS_URL;
      if (wsEnv) return wsEnv;

      // 2. Derive from API URL: http(s)://host/poly-arena → ws(s)://host/poly-arena/ws/orderbook
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      if (apiUrl && (apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
        return apiUrl.replace(/^http/, 'ws') + '/ws/orderbook';
      }

      // 3. Dev fallback: same host, port 8099, /poly-arena prefix
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.hostname}:8099/poly-arena/ws/orderbook`;
    };

    const sendFilter = (ws: WebSocket) => {
      const f = filterRef.current;
      const msg: Record<string, string> = {};
      if (f.symbol) msg.symbol = f.symbol;
      if (f.timeframe) msg.timeframe = f.timeframe;
      ws.send(JSON.stringify(msg));
    };

    const connect = () => {
      if (!active) return;
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
        backoff = 1000;
        sendFilter(ws);
      };

      ws.onmessage = (ev) => {
        if (!active) return;
        try {
          const msg = JSON.parse(ev.data) as {
            type?: string;
            symbol: string; timeframe: string; direction: string;
            session?: number;
            bids: [number, number][]; asks: [number, number][];
            updated_at: string | null;
          };
          const entry: OrderbookEntry = {
            symbol: msg.symbol,
            timeframe: msg.timeframe,
            direction: msg.direction,
            session: msg.session,
            bids: msg.bids.map(([price, size]) => ({ price, size })),
            asks: msg.asks.map(([price, size]) => ({ price, size })),
            updated_at: msg.updated_at,
          };

          // Dedup by (symbol, tf, dir, session) — session=undefined for current
          const matchEntry = (ob: OrderbookEntry) =>
            ob.symbol === entry.symbol &&
            ob.timeframe === entry.timeframe &&
            ob.direction === entry.direction &&
            ob.session === entry.session;

          setOrderbooks((prev) => {
            const idx = prev.findIndex(matchEntry);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = entry;
              return next;
            }
            return [...prev, entry];
          });
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        wsRef.current = null;
        reconnectRef.current = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      setConnected(false);
    };
  }, []); // Connect once, filter changes handled separately

  // Re-send filter + clear stale data when symbol/timeframe changes
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg: Record<string, string> = {};
      if (symbol) msg.symbol = symbol;
      if (timeframe) msg.timeframe = timeframe;
      ws.send(JSON.stringify(msg));
      setOrderbooks([]);
    }
  }, [symbol, timeframe]);

  return { orderbooks, connected };
}
