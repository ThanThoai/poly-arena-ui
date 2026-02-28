'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, Bot } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { showToast } from '@/components/ui/toast';

interface BotManagerPageProps {
  onCreateBot: () => void;
  onRefresh: () => void;
  refreshKey?: number;
}

export default function BotManagerPage({ onCreateBot, onRefresh, refreshKey }: BotManagerPageProps) {
  const { user } = useAuth();
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());

  const fetchMyBots = useCallback(async () => {
    try {
      const bots = await apiFetch<Bot[]>('/bots/my');
      setMyBots(bots);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyBots();
  }, [fetchMyBots, refreshKey]);

  const toggleKeyVisibility = (botId: number) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(botId)) next.delete(botId);
      else next.add(botId);
      return next;
    });
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    showToast('API key copied', 'ok');
  };

  const startRename = (bot: Bot) => {
    setRenamingId(bot.id);
    setNewName(bot.bot_name);
    setRenameError('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setNewName('');
    setRenameError('');
  };

  const submitRename = async (botId: number) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setRenameSubmitting(true);
    setRenameError('');
    try {
      await apiFetch(`/bots/${botId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_bot_name: trimmed }),
      });
      showToast(`Bot renamed to "${trimmed}"`, 'ok');
      setRenamingId(null);
      setNewName('');
      fetchMyBots();
      onRefresh();
    } catch (ex) {
      setRenameError(ex instanceof Error ? ex.message : 'Unknown error');
    } finally {
      setRenameSubmitting(false);
    }
  };

  return (
    <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
      {/* Balance overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-sm rounded-xl px-5 py-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Total Balance</div>
          <div className="text-xl font-bold text-slate-100">${(user?.initial_balance ?? 0).toLocaleString()}</div>
        </div>
        <div className="card-sm rounded-xl px-5 py-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Allocated</div>
          <div className="text-xl font-bold text-amber-400">${(user?.allocated_balance ?? 0).toLocaleString()}</div>
        </div>
        <div className="card-sm rounded-xl px-5 py-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest font-medium mb-1">Available</div>
          <div className="text-xl font-bold text-emerald-400">${(user?.available_balance ?? 0).toLocaleString()}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onCreateBot}
          className="h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Bot
        </button>
      </div>

      {/* Bot list */}
      <div className="card-sm rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a1a2e]">
          <h3 className="text-sm font-semibold text-slate-200">Your Bots</h3>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">Loading...</div>
        ) : myBots.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            No bots yet. Create your first bot to start trading.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider border-b border-[#1a1a2e]">
                  <th className="text-left px-5 py-2.5 font-medium">Name</th>
                  <th className="text-left px-5 py-2.5 font-medium">API Key</th>
                  <th className="text-right px-5 py-2.5 font-medium">Initial</th>
                  <th className="text-right px-5 py-2.5 font-medium">Balance</th>
                  <th className="text-right px-5 py-2.5 font-medium">P&L</th>
                  <th className="text-right px-5 py-2.5 font-medium">ROI</th>
                  <th className="text-right px-5 py-2.5 font-medium">Created</th>
                  <th className="text-center px-5 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {myBots.map((bot) => {
                  const pnl = bot.balance - bot.initial_balance;
                  const roi = bot.initial_balance > 0 ? (pnl / bot.initial_balance) * 100 : 0;
                  const isRenaming = renamingId === bot.id;
                  const keyVisible = visibleKeys.has(bot.id);
                  const apiKey = bot.api_key || '';
                  return (
                    <tr key={bot.id} className="border-b border-[#111122] hover:bg-white/[.02] transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-200">
                        {isRenaming ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename(bot.id);
                                if (e.key === 'Escape') cancelRename();
                              }}
                              autoFocus
                              className="modal-field w-36 h-7 text-xs px-2"
                            />
                            <button
                              onClick={() => submitRename(bot.id)}
                              disabled={renameSubmitting}
                              className="text-emerald-400 hover:text-emerald-300 text-[10px] font-semibold"
                            >
                              {renameSubmitting ? '...' : 'Save'}
                            </button>
                            <button onClick={cancelRename} className="text-slate-500 hover:text-slate-300 text-[10px]">
                              Cancel
                            </button>
                            {renameError && <span className="text-rose-400 text-[10px]">{renameError}</span>}
                          </div>
                        ) : (
                          bot.bot_name
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="text-[10px] text-slate-500 font-mono max-w-[140px] truncate">
                            {keyVisible ? apiKey : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                          </code>
                          <button
                            onClick={() => toggleKeyVisibility(bot.id)}
                            className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
                            title={keyVisible ? 'Hide' : 'Show'}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              {keyVisible ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              ) : (
                                <>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </>
                              )}
                            </svg>
                          </button>
                          {keyVisible && (
                            <button
                              onClick={() => copyKey(apiKey)}
                              className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
                              title="Copy"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">${bot.initial_balance.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-slate-200 font-medium">${bot.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={`px-5 py-3 text-right font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        {bot.created_at ? new Date(bot.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {!isRenaming && (
                          <button
                            onClick={() => startRename(bot)}
                            className="text-amber-400 hover:text-amber-300 text-[10px] font-medium"
                          >
                            Rename
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
