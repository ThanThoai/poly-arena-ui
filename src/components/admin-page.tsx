'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { apiFetch, AdminUser, Bot, PriceHistoryEntry } from '@/lib/api';
import { showToast } from '@/components/ui/toast';

type Tab = 'users' | 'bots' | 'prices';

// ── Orderbook Depth Component ──────────────────────────────────────────────────

function OrderbookDepth({
  bids,
  asks,
  bestBid,
  bestAsk,
}: {
  bids: [number, number][];
  asks: [number, number][];
  bestBid: number | null;
  bestAsk: number | null;
}) {
  const LEVELS = 10;

  // Bids: descending — highest (best) bid at top row 0
  const bidLevels = [...bids].sort((a, b) => b[0] - a[0]).slice(0, LEVELS);
  // Asks: ascending — lowest (best) ask at top row 0
  const askLevels = [...asks].sort((a, b) => a[0] - b[0]).slice(0, LEVELS);

  const rows = Math.max(bidLevels.length, askLevels.length);

  const allSizes = [...bidLevels, ...askLevels].map(([, s]) => s);
  const maxSize = allSizes.length > 0 ? Math.max(...allSizes) : 1;

  const spread     = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const spreadPct  = spread != null && bestAsk != null && bestAsk > 0
    ? (spread / bestAsk) * 100 : null;
  const midPrice   = bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : null;

  return (
    <div className="select-none" style={{ minWidth: 520 }}>
      {/* Spread / mid banner */}
      <div className="flex items-center gap-3 mb-2 px-1">
        <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Orderbook</span>
        {midPrice != null && (
          <span className="font-mono text-[11px] text-slate-300">mid {midPrice.toFixed(4)}</span>
        )}
        {spread != null && (
          <span className="font-mono text-[11px] text-slate-500">
            spread {spread.toFixed(4)}
            {spreadPct != null && (
              <span className="text-slate-600 ml-1">({spreadPct.toFixed(2)}%)</span>
            )}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="grid mb-0.5 text-[9px] text-slate-600 uppercase tracking-wider font-medium"
        style={{ gridTemplateColumns: '1fr 60px 2px 60px 1fr' }}>
        <span className="text-right pr-2">Size</span>
        <span className="text-right pr-1">Bid</span>
        <span />
        <span className="text-left pl-1">Ask</span>
        <span className="text-left pl-2">Size</span>
      </div>

      {/* Rows */}
      <div className="space-y-px">
        {Array.from({ length: rows }).map((_, i) => {
          const bid = bidLevels[i];
          const ask = askLevels[i];
          const bidPct = bid ? Math.round((bid[1] / maxSize) * 100) : 0;
          const askPct = ask ? Math.round((ask[1] / maxSize) * 100) : 0;

          return (
            <div key={i} className="grid items-center h-5"
              style={{ gridTemplateColumns: '1fr 60px 2px 60px 1fr' }}>

              {/* Bid size + depth bar (bar fills right→left from price column) */}
              <div className="relative h-full flex items-center justify-end overflow-hidden">
                {bid && (
                  <>
                    <div
                      className="absolute right-0 top-0 h-full bg-emerald-950/60"
                      style={{ width: `${bidPct}%` }}
                    />
                    <span className="relative z-10 font-mono text-[11px] text-slate-400 pr-2">
                      {bid[1].toFixed(0)}
                    </span>
                  </>
                )}
              </div>

              {/* Bid price */}
              <div className="text-right pr-1">
                {bid && (
                  <span className="font-mono text-[11px] text-emerald-400">{bid[0].toFixed(4)}</span>
                )}
              </div>

              {/* Center divider */}
              <div className="bg-[#1a1a2e] h-full" />

              {/* Ask price */}
              <div className="text-left pl-1">
                {ask && (
                  <span className="font-mono text-[11px] text-rose-400">{ask[0].toFixed(4)}</span>
                )}
              </div>

              {/* Ask size + depth bar (bar fills left→right from price column) */}
              <div className="relative h-full flex items-center overflow-hidden">
                {ask && (
                  <>
                    <div
                      className="absolute left-0 top-0 h-full bg-rose-950/60"
                      style={{ width: `${askPct}%` }}
                    />
                    <span className="relative z-10 font-mono text-[11px] text-slate-400 pl-2">
                      {ask[1].toFixed(0)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rows === 0 && (
        <div className="text-[11px] text-slate-600 text-center py-3">No orderbook data</div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bots, setBots] = useState<(Bot & { owner_name?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);

  // Balance adjust state
  const [editingBalanceId, setEditingBalanceId] = useState<number | null>(null);
  const [balanceInput, setBalanceInput] = useState('');

  // Create admin state
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '', email: '' });
  const [creating, setCreating] = useState(false);

  // Price history state
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [priceFilters, setPriceFilters] = useState({
    symbol: '',
    timeframe: '',
    direction: '',
    start_time: '',
    end_time: '',
  });

  const fetchPriceHistory = async () => {
    setPriceLoading(true);
    try {
      const params = new URLSearchParams();
      if (priceFilters.symbol) params.set('symbol', priceFilters.symbol);
      if (priceFilters.timeframe) params.set('timeframe', priceFilters.timeframe);
      if (priceFilters.direction) params.set('direction', priceFilters.direction);
      if (priceFilters.start_time) params.set('start_time', new Date(priceFilters.start_time).toISOString());
      if (priceFilters.end_time) params.set('end_time', new Date(priceFilters.end_time).toISOString());
      params.set('limit', '1000');
      const qs = params.toString();
      const data = await apiFetch<PriceHistoryEntry[]>(`/admin/price-history?${qs}`);
      setPriceHistory(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load price history', 'error');
    } finally {
      setPriceLoading(false);
    }
  };

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch<AdminUser[]>('/admin/users');
      setUsers(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load users', 'error');
    }
  }, []);

  const fetchBots = useCallback(async () => {
    try {
      const data = await apiFetch<(Bot & { owner_name?: string | null })[]>('/admin/bots');
      setBots(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load bots', 'error');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchUsers(), fetchBots()]).finally(() => setLoading(false));
  }, [fetchUsers, fetchBots]);

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`Deactivate user "${username}" and all their bots?`)) return;
    try {
      const res = await apiFetch<{ detail: string }>(`/admin/users/${userId}`, { method: 'DELETE' });
      showToast(res.detail, 'ok');
      fetchUsers();
      fetchBots();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const startEditBalance = (user: AdminUser) => {
    setEditingBalanceId(user.id);
    setBalanceInput(String(user.initial_balance));
  };

  const submitBalance = async (userId: number) => {
    const val = parseFloat(balanceInput);
    if (isNaN(val) || val < 0) {
      showToast('Invalid balance', 'error');
      return;
    }
    try {
      await apiFetch(`/admin/users/${userId}/balance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: val }),
      });
      showToast('Balance updated', 'ok');
      setEditingBalanceId(null);
      fetchUsers();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const deleteBot = async (botId: number, botName: string) => {
    if (!confirm(`Deactivate bot "${botName}"?`)) return;
    try {
      const res = await apiFetch<{ detail: string }>(`/admin/bots/${botId}`, { method: 'DELETE' });
      showToast(res.detail, 'ok');
      fetchBots();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const deleteBotTrades = async (botId: number, botName: string) => {
    if (!confirm(`Delete ALL trades for bot "${botName}"? This cannot be undone.`)) return;
    try {
      const res = await apiFetch<{ detail: string }>(`/admin/bots/${botId}/trades`, { method: 'DELETE' });
      showToast(res.detail, 'ok');
      fetchBots();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  const submitCreateAdmin = async () => {
    if (!adminForm.username || !adminForm.password) {
      showToast('Username and password required', 'error');
      return;
    }
    if (adminForm.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    setCreating(true);
    try {
      await apiFetch('/admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminForm.username,
          password: adminForm.password,
          email: adminForm.email || null,
        }),
      });
      showToast(`Admin "${adminForm.username}" created`, 'ok');
      setShowCreateAdmin(false);
      setAdminForm({ username: '', password: '', email: '' });
      fetchUsers();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  const tabCls = (t: Tab) =>
    `h-8 px-4 rounded-lg text-xs font-semibold transition-all ${
      tab === t
        ? 'bg-[#1a1a2e] text-white border border-[#2a2a4a]'
        : 'text-slate-500 hover:text-slate-300 border border-transparent'
    }`;

  return (
    <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button className={tabCls('users')} onClick={() => setTab('users')}>Users</button>
            <button className={tabCls('bots')} onClick={() => setTab('bots')}>Bots</button>
            <button className={tabCls('prices')} onClick={() => setTab('prices')}>Prices</button>
          </div>
        </div>
        <button
          onClick={() => setShowCreateAdmin(true)}
          className="h-8 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Admin
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-sm rounded-xl px-5 py-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Total Users</div>
          <div className="text-xl font-bold text-slate-100">{users.length}</div>
        </div>
        <div className="card-sm rounded-xl px-5 py-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Active Users</div>
          <div className="text-xl font-bold text-emerald-400">{users.filter(u => u.is_active).length}</div>
        </div>
        <div className="card-sm rounded-xl px-5 py-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Total Bots</div>
          <div className="text-xl font-bold text-slate-100">{bots.length}</div>
        </div>
        <div className="card-sm rounded-xl px-5 py-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Active Bots</div>
          <div className="text-xl font-bold text-emerald-400">{bots.filter(b => b.is_active !== false).length}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 text-sm py-10">Loading...</div>
      ) : tab === 'users' ? (
        /* Users table */
        <div className="card-sm rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a1a2e]">
            <h3 className="text-sm font-semibold text-slate-200">All Users</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider border-b border-[#1a1a2e]">
                  <th className="text-left px-5 py-2.5 font-medium">ID</th>
                  <th className="text-left px-5 py-2.5 font-medium">Username</th>
                  <th className="text-left px-5 py-2.5 font-medium">Email</th>
                  <th className="text-right px-5 py-2.5 font-medium">Balance</th>
                  <th className="text-center px-5 py-2.5 font-medium">Status</th>
                  <th className="text-center px-5 py-2.5 font-medium">Role</th>
                  <th className="text-right px-5 py-2.5 font-medium">Created</th>
                  <th className="text-center px-5 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[#111122] hover:bg-white/[.02] transition-colors">
                    <td className="px-5 py-3 text-slate-500">#{u.id}</td>
                    <td className="px-5 py-3 font-medium text-slate-200">{u.username}</td>
                    <td className="px-5 py-3 text-slate-400">{u.email}</td>
                    <td className="px-5 py-3 text-right">
                      {editingBalanceId === u.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-slate-500">$</span>
                          <input
                            value={balanceInput}
                            onChange={(e) => setBalanceInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') submitBalance(u.id);
                              if (e.key === 'Escape') setEditingBalanceId(null);
                            }}
                            autoFocus
                            className="modal-field w-24 h-7 text-xs px-2 text-right"
                          />
                          <button onClick={() => submitBalance(u.id)} className="text-emerald-400 hover:text-emerald-300 text-[10px] font-semibold">Save</button>
                          <button onClick={() => setEditingBalanceId(null)} className="text-slate-500 hover:text-slate-300 text-[10px]">Cancel</button>
                        </div>
                      ) : (
                        <span className="text-slate-200 font-medium">
                          ${u.initial_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        u.is_active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {u.is_admin ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-950 text-violet-400 border border-violet-800/50">Admin</span>
                      ) : (
                        <span className="text-slate-600 text-[10px]">User</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {editingBalanceId !== u.id && (
                          <button
                            onClick={() => startEditBalance(u)}
                            className="text-amber-400 hover:text-amber-300 text-[10px] font-medium"
                          >
                            Balance
                          </button>
                        )}
                        {u.is_active && !u.is_admin && (
                          <button
                            onClick={() => deleteUser(u.id, u.username)}
                            className="text-rose-400 hover:text-rose-300 text-[10px] font-medium"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'bots' ? (
        /* Bots table */
        <div className="card-sm rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a1a2e]">
            <h3 className="text-sm font-semibold text-slate-200">All Bots</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider border-b border-[#1a1a2e]">
                  <th className="text-left px-5 py-2.5 font-medium">ID</th>
                  <th className="text-left px-5 py-2.5 font-medium">Name</th>
                  <th className="text-left px-5 py-2.5 font-medium">Owner</th>
                  <th className="text-right px-5 py-2.5 font-medium">Initial</th>
                  <th className="text-right px-5 py-2.5 font-medium">Balance</th>
                  <th className="text-right px-5 py-2.5 font-medium">P&L</th>
                  <th className="text-center px-5 py-2.5 font-medium">Status</th>
                  <th className="text-right px-5 py-2.5 font-medium">Created</th>
                  <th className="text-center px-5 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((bot) => {
                  const pnl = bot.balance - bot.initial_balance;
                  const isActive = bot.is_active !== false;
                  return (
                    <tr key={bot.id} className="border-b border-[#111122] hover:bg-white/[.02] transition-colors">
                      <td className="px-5 py-3 text-slate-500">#{bot.id}</td>
                      <td className="px-5 py-3 font-medium text-slate-200">{bot.bot_name}</td>
                      <td className="px-5 py-3 text-slate-400">{bot.owner_name || '-'}</td>
                      <td className="px-5 py-3 text-right text-slate-400">
                        ${bot.initial_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-200 font-medium">
                        ${bot.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          isActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950 text-rose-400 border border-rose-800/50'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        {bot.created_at ? new Date(bot.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isActive && (
                            <button
                              onClick={() => deleteBot(bot.id, bot.bot_name)}
                              className="text-rose-400 hover:text-rose-300 text-[10px] font-medium"
                            >
                              Deactivate
                            </button>
                          )}
                          <button
                            onClick={() => deleteBotTrades(bot.id, bot.bot_name)}
                            className="text-amber-400 hover:text-amber-300 text-[10px] font-medium"
                          >
                            Clear Trades
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Prices tab */
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="card-sm rounded-xl px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">Symbol</label>
                <select
                  value={priceFilters.symbol}
                  onChange={(e) => setPriceFilters({ ...priceFilters, symbol: e.target.value })}
                  className="modal-field h-8 text-xs px-2 w-24"
                >
                  <option value="">All</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="SOL">SOL</option>
                  <option value="XRP">XRP</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">Timeframe</label>
                <select
                  value={priceFilters.timeframe}
                  onChange={(e) => setPriceFilters({ ...priceFilters, timeframe: e.target.value })}
                  className="modal-field h-8 text-xs px-2 w-24"
                >
                  <option value="">All</option>
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="H1">H1</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">Direction</label>
                <select
                  value={priceFilters.direction}
                  onChange={(e) => setPriceFilters({ ...priceFilters, direction: e.target.value })}
                  className="modal-field h-8 text-xs px-2 w-24"
                >
                  <option value="">All</option>
                  <option value="UP">UP</option>
                  <option value="DOWN">DOWN</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">Start</label>
                <input
                  type="datetime-local"
                  value={priceFilters.start_time}
                  onChange={(e) => setPriceFilters({ ...priceFilters, start_time: e.target.value })}
                  className="modal-field h-8 text-xs px-2"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">End</label>
                <input
                  type="datetime-local"
                  value={priceFilters.end_time}
                  onChange={(e) => setPriceFilters({ ...priceFilters, end_time: e.target.value })}
                  className="modal-field h-8 text-xs px-2"
                />
              </div>
              <button
                onClick={fetchPriceHistory}
                disabled={priceLoading}
                className="h-8 px-4 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}
              >
                {priceLoading ? 'Loading...' : 'Search'}
              </button>
              {priceHistory.length > 0 && (
                <span className="text-[11px] text-slate-500 ml-auto">{priceHistory.length} record(s)</span>
              )}
            </div>
          </div>

          {/* Price history table */}
          <div className="card-sm rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0d0d1a]">
                  <tr className="text-slate-500 uppercase tracking-wider border-b border-[#1a1a2e]">
                    <th className="text-left px-5 py-2.5 font-medium">Time</th>
                    <th className="text-left px-5 py-2.5 font-medium">Symbol</th>
                    <th className="text-left px-5 py-2.5 font-medium">TF</th>
                    <th className="text-left px-5 py-2.5 font-medium">Dir</th>
                    <th className="text-right px-5 py-2.5 font-medium">Best Ask</th>
                    <th className="text-right px-5 py-2.5 font-medium">Best Bid</th>
                    <th className="text-right px-5 py-2.5 font-medium">Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                        {priceLoading ? 'Loading...' : 'Click Search to load price history'}
                      </td>
                    </tr>
                  ) : (
                    priceHistory.map((row) => {
                      const spread = row.best_ask != null && row.best_bid != null
                        ? (row.best_ask - row.best_bid)
                        : null;
                      const hasOb = row.bids != null || row.asks != null;
                      const isExpanded = expandedRow === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr
                            className={`border-b border-[#111122] hover:bg-white/[.02] transition-colors ${hasOb ? 'cursor-pointer' : ''}`}
                            onClick={() => hasOb && setExpandedRow(isExpanded ? null : row.id)}
                          >
                            <td className="px-5 py-2.5 text-slate-400 whitespace-nowrap">
                              <span className="flex items-center gap-1.5">
                                {hasOb && (
                                  <span className={`inline-block text-[10px] text-slate-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                                )}
                                {row.recorded_at ? new Date(row.recorded_at).toLocaleString() : '-'}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 font-medium text-slate-200">{row.symbol}</td>
                            <td className="px-5 py-2.5 text-slate-400">{row.timeframe}</td>
                            <td className="px-5 py-2.5">
                              <span className={row.direction === 'UP' ? 'text-emerald-400' : 'text-rose-400'}>
                                {row.direction}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-200 font-mono">
                              {row.best_ask != null ? row.best_ask.toFixed(4) : '-'}
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-200 font-mono">
                              {row.best_bid != null ? row.best_bid.toFixed(4) : '-'}
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-400 font-mono">
                              {spread != null ? spread.toFixed(4) : '-'}
                            </td>
                          </tr>
                          {isExpanded && hasOb && (
                            <tr className="border-b border-[#111122] bg-[#080814]">
                              <td colSpan={7} className="px-5 py-4">
                                <OrderbookDepth
                                  bids={row.bids ?? []}
                                  asks={row.asks ?? []}
                                  bestBid={row.best_bid}
                                  bestAsk={row.best_ask}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Admin Modal */}
      {showCreateAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateAdmin(false)} />
          <div className="relative card rounded-2xl p-6 w-full max-w-md border border-[#1f1f32] shadow-2xl" style={{ animation: 'modalIn 0.2s ease-out' }}>
            <h2 className="text-lg font-bold text-slate-100 mb-5">Create Admin User</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Username</label>
                <input
                  value={adminForm.username}
                  onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                  className="modal-field w-full h-9 text-sm px-3"
                  placeholder="admin_user"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="modal-field w-full h-9 text-sm px-3"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Email (optional)</label>
                <input
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="modal-field w-full h-9 text-sm px-3"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateAdmin(false)}
                className="h-9 px-4 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-[#1f1f32] hover:border-[#2a2a4a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateAdmin}
                disabled={creating}
                className="h-9 px-5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}
              >
                {creating ? 'Creating...' : 'Create Admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
