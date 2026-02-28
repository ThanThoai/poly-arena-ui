const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8099/poly-arena';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pa_token');
}

export function setToken(token: string) {
  localStorage.setItem('pa_token', token);
}

export function clearToken() {
  localStorage.removeItem('pa_token');
}

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts?.headers as Record<string, string> || {}),
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  initial_balance: number;
  allocated_balance: number;
  available_balance: number;
}

export interface Trade {
  id: number;
  bot_name: string;
  symbol: string;
  timeframe: string;
  forecast: string;
  amount: number;
  result: string | null;
  profit: number | null;
  price_open: number | null;
  price_close: number | null;
  avg_price: number | null;
  num_shares: number | null;
  reason: string | null;
  order_received_at: string | null;
  ask_fetched_at: string | null;
  settlement_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  limit_price: number | null;
  tp_price: number | null;
  sl_price: number | null;
  exit_price: number | null;
  exit_trigger: string | null;
  exit_filled: number | null;
  exit_at: string | null;
  me_order_id: string | null;
  me_order_status: string | null;
  ttl: number | null;
  walk_prices: {
    entry?: { price: number; qty: number; cost: number }[];
    exit?: { price: number; qty: number; cost: number }[];
  } | null;
}

export interface Bot {
  id: number;
  bot_name: string;
  api_key?: string;
  balance: number;
  initial_balance: number;
  user_id?: number | null;
  owner_name?: string | null;
  created_at: string | null;
}

export interface BalanceHistory {
  id: number;
  bot_name: string;
  balance: number;
  recorded_at: string | null;
}

export interface SchedulerStatus {
  running: boolean;
}

export interface PriceEntry {
  symbol: string;
  timeframe: string;
  direction: string;
  best_ask: number | null;
  best_bid: number | null;
  age_s: number;
  stale: boolean;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookEntry {
  symbol: string;
  timeframe: string;
  direction: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  updated_at: string | null;
}
