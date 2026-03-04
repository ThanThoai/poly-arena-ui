const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

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
  total_balance: number;
  total_pnl: number;
  is_admin: boolean;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  initial_balance: number;
  is_active: boolean;
  is_admin: boolean;
  created_at: string | null;
}

export interface Trade {
  id: number;
  bot_name: string;
  symbol: string;
  timeframe: string;
  forecast: string;
  amount: number;
  original_amount: number | null;
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
  traces: {
    timestamp: string;
    stage: string;
    action: string;
    details: string;
    data?: Record<string, unknown>;
  }[] | null;
  position_closed: boolean | null;
  session_offset: number | null;
  entry_fee: number | null;
  order_type: string | null;
  ceiling_price: number | null;
  session_id: string | null;
  candle_open: number | null;
  // Computed fill breakdown
  requested_quantity: number | null;
  filled_quantity: number | null;
  unfilled_quantity: number | null;
}

export interface Bot {
  id: number;
  bot_name: string;
  api_key?: string;
  is_active?: boolean;
  status: string;
  balance: number;
  initial_balance: number;
  user_id?: number | null;
  owner_name?: string | null;
  user_initial_balance?: number | null;
  created_at: string | null;
}

export interface BalanceHistory {
  id: number;
  bot_name: string;
  balance: number;
  recorded_at: string | null;
}

export interface UserBalanceHistory {
  id: number;
  user_id: number;
  balance: number;
  trade_id: number | null;
  recorded_at: string | null;
}

export interface UserBalanceSnapshot {
  id: number;
  user_id: number;
  balance: number;
  bot_balance: number;
  available: number;
  session_id: string | null;
  recorded_at: string | null;
}

export interface BotPnl {
  bot_name: string;
  initial_balance: number;
  current_balance: number;
  realized_pnl: number;
  realized_pnl_pct: number;
  wins: number;
  losses: number;
  pending: number;
  total_trades: number;
  win_rate: number;
  avg_profit_per_trade: number;
  total_fees: number;
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

export interface AchievementDef {
  id: number;
  slug: string;
  name: string;
  description: string;
  tier: string;
  category: string;
}

export interface BotAchievement {
  id: number;
  bot_id: number;
  bot_name: string;
  achievement_id: number;
  slug: string;
  name: string;
  description: string;
  tier: string;
  earned_at: string | null;
  metadata_: Record<string, unknown> | null;
}

export interface PriceHistoryEntry {
  id: number;
  symbol: string;
  timeframe: string;
  direction: string;
  best_ask: number | null;
  best_bid: number | null;
  bids: [number, number][] | null;  // [[price, size], ...]
  asks: [number, number][] | null;  // [[price, size], ...]
  recorded_at: string | null;
}

// ── Trade Inspector types ────────────────────────────────────────────────────

export interface TimelineEvent {
  timestamp: string;
  category: 'trace' | 'price' | 'fill_entry' | 'fill_exit';
  action: string;
  details: string;
  data?: Record<string, unknown> | unknown[] | null;
}

export interface SessionInfo {
  symbol: string;
  timeframe: string;
  direction: string;
  session_start: number;
  session_end: number;
}

export interface TradeInspectResponse {
  trade: Trade;
  timeline: TimelineEvent[];
  session: SessionInfo;
}

export async function inspectTrade(tradeId: number): Promise<TradeInspectResponse> {
  return apiFetch<TradeInspectResponse>(`/binary-options/inspect/${tradeId}`);
}

// ── User P&L types ──────────────────────────────────────────────────────────

export interface UserPnl {
  user_id: number;
  username: string;
  initial_balance: number;
  allocated_balance: number;
  available_balance: number;
  current_balance: number;
  realized_pnl: number;
  realized_pnl_pct: number;
  wins: number;
  losses: number;
  pending: number;
  total_trades: number;
  win_rate: number;
  avg_profit_per_trade: number;
  total_fees: number;
  bots: BotPnl[];
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookEntry {
  symbol: string;
  timeframe: string;
  direction: string;
  session?: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  updated_at: string | null;
}
