'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { OrderbookEntry, OrderbookLevel } from '@/lib/api';

// ── Constants ────────────────────────────────────────────────────────────────

const PING_INTERVAL_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

// ── Token info per asset_id (received from backend) ─────────────────────────

interface TokenInfo {
  direction: string;
  session: number;
}

// ── WS URL builder ──────────────────────────────────────────────────────────

function buildWsUrl(): string {
  // 1. Derive from API URL
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (apiUrl && (apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
    return apiUrl.replace(/^http/, 'ws') + '/ws/polymarket';
  }
  // 2. Dev fallback
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:8099/poly-arena/ws/polymarket`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Backend-proxied Polymarket WebSocket hook for orderbook depth.
 *
 * Connects to our backend WS endpoint which proxies Polymarket data:
 * 1. Sends subscribe message with symbol + timeframe
 * 2. Receives token_map (backend discovers tokens via Gamma API)
 * 3. Receives book events (full snapshots from Redis)
 * 4. Backend handles candle boundary rotation automatically
 * 5. Auto-reconnects with exponential backoff (1s -> 30s)
 * 6. Pauses on tab hidden, reconnects on visibility
 */
export function usePolymarketOrderbook(symbol?: string, timeframe?: string) {
  const [orderbooks, setOrderbooks] = useState<OrderbookEntry[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const activeRef = useRef(true);
  const tokenMapRef = useRef<Map<string, TokenInfo>>(new Map());
  const argsRef = useRef({ symbol, timeframe });
  argsRef.current = { symbol, timeframe };
  const mountedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const processMessage = useCallback((data: unknown) => {
    const messages = Array.isArray(data) ? data : [data];

    for (const msg of messages) {
      if (typeof msg !== 'object' || msg === null) continue;
      const m = msg as Record<string, unknown>;

      // Handle token_map from backend
      if (m.type === 'token_map') {
        const tokens = m.tokens as Record<string, { direction: string; session: number }>;
        if (tokens) {
          const map = new Map<string, TokenInfo>();
          for (const [assetId, info] of Object.entries(tokens)) {
            map.set(assetId, { direction: info.direction, session: info.session });
          }
          tokenMapRef.current = map;
        }
        continue;
      }

      // Handle error messages
      if (m.type === 'error') continue;

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

  const connectWs = useCallback(() => {
    if (!activeRef.current) return;

    const { symbol: sym, timeframe: tf } = argsRef.current;
    if (!sym || !tf) return;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (!activeRef.current) { ws.close(); return; }
      setConnected(true);
      backoffRef.current = 1000;

      // Subscribe to symbol/timeframe — backend handles token discovery
      ws.send(JSON.stringify({
        type: 'subscribe',
        symbol: sym,
        timeframe: tf,
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
  }, [processMessage, cleanup]);

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
