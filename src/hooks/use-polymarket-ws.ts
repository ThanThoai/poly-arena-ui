'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { OrderbookEntry, OrderbookLevel } from '@/lib/api';

// ── Constants ────────────────────────────────────────────────────────────────

const POLYMARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const GAMMA_API_PATH = '/gamma-api/events'; // proxied via next.config.js rewrite
const PING_INTERVAL_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const SLUG_CACHE_TTL_MS = 120_000; // 2min — slug is stable for entire candle

const TF_SECONDS: Record<string, number> = { M5: 300, M15: 900, H1: 3600 };
const TF_NORM: Record<string, string> = { M5: '5m', M15: '15m', H1: '1h' };
const SYMBOL_FULL: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'xrp',
};

// ── Slug builders ────────────────────────────────────────────────────────────

/** Compute candle-open timestamp aligned to period boundary. */
function candleOpen(tf: string, ts?: number): number {
  const period = TF_SECONDS[tf] ?? 300;
  const now = ts ?? Math.floor(Date.now() / 1000);
  return now - (now % period);
}

/** M5/M15 slug: `btc-updown-5m-{candle_open_ts}` */
function buildSlug(symbol: string, tf: string, candleTs: number): string {
  const tfNorm = TF_NORM[tf];
  if (tfNorm === '1h') return buildSlugH1(symbol, candleTs);
  return `${symbol.toLowerCase()}-updown-${tfNorm}-${candleTs}`;
}

/**
 * H1 slug: `bitcoin-up-or-down-{month}-{day}-{hour}{ampm}-et`
 *
 * Uses America/New_York (ET) timezone. Day and hour are NOT zero-padded.
 */
function buildSlugH1(symbol: string, candleTs: number): string {
  const sym = SYMBOL_FULL[symbol] ?? symbol.toLowerCase();
  const d = new Date(candleTs * 1000);
  // Format in ET timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
  }).formatToParts(d);

  const month = parts.find(p => p.type === 'month')!.value.toLowerCase();
  const day = parts.find(p => p.type === 'day')!.value; // no pad
  const hour = parts.find(p => p.type === 'hour')!.value; // no pad
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')!.value.toLowerCase(); // "am"/"pm"

  return `${sym}-up-or-down-${month}-${day}-${hour}${dayPeriod}-et`;
}

// ── Slug cache (module-level, shared across hook instances) ──────────────────

const _slugCache = new Map<string, { ids: [string, string]; ts: number }>();

/** Fetch [token_up, token_down] from Gamma API for a slug. */
async function fetchTokenIds(slug: string): Promise<[string, string] | null> {
  // Check cache
  const cached = _slugCache.get(slug);
  if (cached && Date.now() - cached.ts < SLUG_CACHE_TTL_MS) {
    return cached.ids;
  }

  try {
    const resp = await fetch(`${GAMMA_API_PATH}?slug=${encodeURIComponent(slug)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const raw: string = data[0]?.markets?.[0]?.clobTokenIds;
    if (!raw) return null;

    // clobTokenIds is a JSON-encoded array string like '["token_up","token_down"]'
    // or may need manual parsing: strip outer [" and "], split by ","
    let ids: string[];
    try {
      ids = JSON.parse(raw);
    } catch {
      // Fallback: manual parse like backend does
      ids = raw.slice(2, -2).replace(/"/g, '').split(',').map(s => s.trim());
    }

    if (ids.length < 2) return null;
    const result: [string, string] = [ids[0], ids[1]];
    _slugCache.set(slug, { ids: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

// ── Token info per asset_id ──────────────────────────────────────────────────

interface TokenInfo {
  direction: string;
  /** Candle-open timestamp (seconds) — same value used in Polymarket slugs. */
  session: number;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Direct Polymarket WebSocket hook for orderbook depth.
 *
 * Completely self-contained — no backend dependency:
 * 1. Computes Polymarket slugs from symbol + timeframe + candle-open timestamps
 * 2. Fetches token IDs from Gamma API (proxied via /gamma-api)
 * 3. Connects to Polymarket WS for real-time orderbook data
 * 4. Handles `book` (full snapshot) and `price_change` (delta) events
 * 5. Auto-reconnects with exponential backoff (1s → 30s)
 * 6. Re-fetches tokens at candle boundaries
 * 7. Pauses on tab hidden, reconnects on visibility
 */
export function usePolymarketOrderbook(symbol?: string, timeframe?: string) {
  const [orderbooks, setOrderbooks] = useState<OrderbookEntry[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boundaryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const activeRef = useRef(true);
  const tokenMapRef = useRef<Map<string, TokenInfo>>(new Map());
  const tokenIdsRef = useRef<string[]>([]);
  const argsRef = useRef({ symbol, timeframe });
  argsRef.current = { symbol, timeframe };
  const mountedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    if (boundaryRef.current) { clearTimeout(boundaryRef.current); boundaryRef.current = null; }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  /**
   * Discover token IDs for current + future sessions directly from Polymarket.
   *
   * Returns: { map: token_id → TokenInfo, ids: all token_ids, period }
   */
  const discoverTokens = useCallback(async (): Promise<{
    map: Map<string, TokenInfo>;
    ids: string[];
    period: number;
  } | null> => {
    const { symbol: sym, timeframe: tf } = argsRef.current;
    if (!sym || !tf) return null;

    const period = TF_SECONDS[tf] ?? 300;
    const curTs = candleOpen(tf);
    const sessions = [curTs, curTs + period, curTs + period * 2]; // current + 2 future

    const map = new Map<string, TokenInfo>();
    const ids: string[] = [];

    // Fetch token IDs for each session in parallel
    const results = await Promise.all(
      sessions.map(ts => {
        const slug = buildSlug(sym, tf, ts);
        return fetchTokenIds(slug).then(r => ({ ts, ids: r }));
      })
    );

    for (const { ts, ids: tokenPair } of results) {
      if (!tokenPair) continue;
      const [upId, downId] = tokenPair;

      map.set(upId, { direction: 'UP', session: ts });
      ids.push(upId);

      map.set(downId, { direction: 'DOWN', session: ts });
      ids.push(downId);
    }

    if (ids.length === 0) return null;
    return { map, ids, period };
  }, []);

  const processMessage = useCallback((data: unknown) => {
    const messages = Array.isArray(data) ? data : [data];

    for (const msg of messages) {
      if (typeof msg !== 'object' || msg === null) continue;
      const m = msg as Record<string, unknown>;

      if (m.type === 'PONG') continue;

      const eventType = m.event_type as string | undefined;
      const assetId = m.asset_id as string | undefined;

      if (!assetId) continue;

      const info = tokenMapRef.current.get(assetId);
      if (!info) continue;

      const { symbol: sym, timeframe: tf } = argsRef.current;
      if (!sym || !tf) continue;

      if (eventType === 'book') {
        const rawBids = (m.bids ?? []) as { price: string; size: string }[];
        const rawAsks = (m.asks ?? []) as { price: string; size: string }[];

        const bids: OrderbookLevel[] = rawBids
          .map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
          .filter(l => l.size > 0)
          .sort((a, b) => b.price - a.price);

        const asks: OrderbookLevel[] = rawAsks
          .map(l => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
          .filter(l => l.size > 0)
          .sort((a, b) => a.price - b.price);

        const entry: OrderbookEntry = {
          symbol: sym,
          timeframe: tf,
          direction: info.direction,
          session: info.session,
          bids,
          asks,
          updated_at: String(m.timestamp ?? Date.now() / 1000),
        };

        setOrderbooks(prev => {
          const idx = prev.findIndex(ob =>
            ob.symbol === entry.symbol &&
            ob.timeframe === entry.timeframe &&
            ob.direction === entry.direction &&
            ob.session === entry.session
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = entry;
            return next;
          }
          return [...prev, entry];
        });
      } else if (eventType === 'price_change') {
        const changes = (m.changes ?? []) as { price: string; size: string; side: string }[];

        setOrderbooks(prev => {
          const idx = prev.findIndex(ob =>
            ob.symbol === sym &&
            ob.timeframe === tf &&
            ob.direction === info.direction &&
            ob.session === info.session
          );
          if (idx < 0) return prev;

          const book = { ...prev[idx] };
          let bids = [...book.bids];
          let asks = [...book.asks];

          for (const ch of changes) {
            const price = parseFloat(ch.price);
            const size = parseFloat(ch.size);
            const isBid = ch.side === 'bid' || ch.side === 'BUY';
            const levels = isBid ? bids : asks;

            const li = levels.findIndex(l => l.price === price);
            if (size === 0) {
              if (li >= 0) levels.splice(li, 1);
            } else if (li >= 0) {
              levels[li] = { price, size };
            } else {
              levels.push({ price, size });
            }

            if (isBid) {
              bids = levels.sort((a, b) => b.price - a.price);
            } else {
              asks = levels.sort((a, b) => a.price - b.price);
            }
          }

          book.bids = bids;
          book.asks = asks;
          book.updated_at = String(Date.now() / 1000);

          const next = [...prev];
          next[idx] = book;
          return next;
        });
      }
    }
  }, []);

  const connectWs = useCallback(async () => {
    if (!activeRef.current) return;

    const result = await discoverTokens();
    if (!result || !activeRef.current) {
      reconnectRef.current = setTimeout(connectWs, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      return;
    }

    const { map, ids, period } = result;
    tokenMapRef.current = map;
    tokenIdsRef.current = ids;

    // Schedule candle boundary re-fetch
    scheduleBoundaryCheck(period);

    // Connect to Polymarket WS
    const ws = new WebSocket(POLYMARKET_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!activeRef.current) { ws.close(); return; }
      setConnected(true);
      backoffRef.current = 1000;

      ws.send(JSON.stringify({
        assets_ids: ids,
        type: 'market',
        custom_feature_enabled: true,
      }));

      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('PING');
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (ev) => {
      if (!activeRef.current) return;
      if (ev.data === 'PONG') return;
      try {
        processMessage(JSON.parse(ev.data));
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (!activeRef.current) return;
      setConnected(false);
      wsRef.current = null;
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      reconnectRef.current = setTimeout(connectWs, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    };

    ws.onerror = () => { ws.close(); };

    function scheduleBoundaryCheck(periodS: number) {
      if (boundaryRef.current) clearTimeout(boundaryRef.current);
      const nowS = Math.floor(Date.now() / 1000);
      const nextBound = (Math.floor(nowS / periodS) + 1) * periodS;
      const msUntil = (nextBound - nowS) * 1000 + 2000; // +2s buffer
      boundaryRef.current = setTimeout(async () => {
        if (!activeRef.current) return;
        const fresh = await discoverTokens();
        if (!fresh || !activeRef.current) return;

        const oldSet = new Set(tokenIdsRef.current);
        const changed = fresh.ids.length !== tokenIdsRef.current.length ||
          fresh.ids.some(id => !oldSet.has(id));

        tokenMapRef.current = fresh.map;
        tokenIdsRef.current = fresh.ids;

        if (changed) {
          cleanup();
          setOrderbooks([]);
          connectWs();
        } else {
          scheduleBoundaryCheck(fresh.period);
        }
      }, msUntil);
    }
  }, [discoverTokens, processMessage, cleanup]);

  // Single effect: connect + visibility + symbol/timeframe changes
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
    } else {
      cleanup();
      setOrderbooks([]);
    }

    activeRef.current = true;
    backoffRef.current = 1000;
    connectWs();

    const onVisibility = () => {
      if (document.hidden) {
        if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
        if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
        setConnected(false);
      } else {
        backoffRef.current = 1000;
        connectWs();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      activeRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      cleanup();
    };
  }, [symbol, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  return { orderbooks, connected };
}
