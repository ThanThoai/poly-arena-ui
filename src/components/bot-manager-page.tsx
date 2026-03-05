'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, Bot } from '@/lib/api';
import { showToast } from '@/components/ui/toast';

interface BotManagerPageProps {
  onCreateBot: () => void;
  onRefresh: () => void;
  refreshKey?: number;
}

type PendingAction = {
  botId: number;
  botName: string;
  action: 'rename' | 'pause' | 'resume' | 'delete';
  newName?: string;
};

export default function BotManagerPage({ onCreateBot, onRefresh, refreshKey }: BotManagerPageProps) {
  const [myBots, setMyBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // API key confirmation state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [apiKeySubmitting, setApiKeySubmitting] = useState(false);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);

  const fetchMyBots = useCallback(async () => {
    try {
      const bots = await apiFetch<Bot[]>('/bots');
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

  // Focus input when modal opens
  useEffect(() => {
    if (pendingAction) {
      setTimeout(() => apiKeyInputRef.current?.focus(), 50);
    }
  }, [pendingAction]);

  const requestAction = (action: PendingAction) => {
    setPendingAction(action);
    setApiKeyInput('');
    setApiKeyError('');
  };

  const cancelAction = () => {
    setPendingAction(null);
    setApiKeyInput('');
    setApiKeyError('');
    setRenamingId(null);
    setNewName('');
    setRenameError('');
  };

  const confirmAction = async () => {
    if (!pendingAction || !apiKeyInput.trim()) return;
    const key = apiKeyInput.trim();
    setApiKeySubmitting(true);
    setApiKeyError('');

    try {
      const { botId, action, newName: rename } = pendingAction;
      switch (action) {
        case 'rename': {
          await apiFetch(`/bots/${botId}/rename`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_bot_name: rename, api_key: key }),
          });
          showToast(`Bot renamed to "${rename}"`, 'ok');
          setRenamingId(null);
          setNewName('');
          break;
        }
        case 'pause': {
          await apiFetch(`/bots/${botId}/pause?api_key=${encodeURIComponent(key)}`, { method: 'PATCH' });
          showToast('Bot paused', 'ok');
          break;
        }
        case 'resume': {
          await apiFetch(`/bots/${botId}/resume?api_key=${encodeURIComponent(key)}`, { method: 'PATCH' });
          showToast('Bot resumed', 'ok');
          break;
        }
        case 'delete': {
          const res = await apiFetch<{ detail: string; refunded: number }>(
            `/bots/${botId}?api_key=${encodeURIComponent(key)}`,
            { method: 'DELETE' },
          );
          showToast(res.detail, 'ok');
          break;
        }
      }
      setPendingAction(null);
      setApiKeyInput('');
      fetchMyBots();
      onRefresh();
    } catch (ex) {
      setApiKeyError(ex instanceof Error ? ex.message : 'Action failed');
    } finally {
      setApiKeySubmitting(false);
    }
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

  const submitRename = (bot: Bot) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    requestAction({ botId: bot.id, botName: bot.bot_name, action: 'rename', newName: trimmed });
  };

  const actionLabel = (action: string) => {
    switch (action) {
      case 'rename': return 'Rename';
      case 'pause': return 'Pause';
      case 'resume': return 'Resume';
      case 'delete': return 'Delete';
      default: return action;
    }
  };

  const actionColor = (action: string) => {
    switch (action) {
      case 'delete': return 'from-rose-600 to-rose-500';
      case 'pause': return 'from-amber-600 to-amber-500';
      case 'resume': return 'from-emerald-600 to-emerald-500';
      default: return 'from-violet-600 to-blue-500';
    }
  };

  return (
    <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
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
                  <th className="text-center px-5 py-2.5 font-medium">Status</th>
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
                  return (
                    <tr key={bot.id} className="border-b border-[#111122] hover:bg-white/[.02] transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-200">
                        {isRenaming ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename(bot);
                                if (e.key === 'Escape') cancelRename();
                              }}
                              autoFocus
                              className="modal-field w-36 h-7 text-xs px-2"
                            />
                            <button
                              onClick={() => submitRename(bot)}
                              className="text-emerald-400 hover:text-emerald-300 text-[10px] font-semibold"
                            >
                              Save
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
                      <td className="px-5 py-3 text-center">
                        {(() => {
                          const s = bot.status || 'ACTIVE';
                          const color = s === 'ACTIVE' ? 'text-emerald-400 bg-emerald-400/10' : s === 'PAUSED' ? 'text-amber-400 bg-amber-400/10' : 'text-rose-400 bg-rose-400/10';
                          return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>{s}</span>;
                        })()}
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
                        <div className="flex items-center justify-center gap-2">
                          {!isRenaming && (
                            <button
                              onClick={() => startRename(bot)}
                              className="text-amber-400 hover:text-amber-300 text-[10px] font-medium"
                            >
                              Rename
                            </button>
                          )}
                          {bot.status === 'ACTIVE' && (
                            <button
                              onClick={() => requestAction({ botId: bot.id, botName: bot.bot_name, action: 'pause' })}
                              disabled={actionLoading === bot.id}
                              className="text-amber-400 hover:text-amber-300 text-[10px] font-medium"
                            >
                              Pause
                            </button>
                          )}
                          {bot.status === 'PAUSED' && (
                            <button
                              onClick={() => requestAction({ botId: bot.id, botName: bot.bot_name, action: 'resume' })}
                              disabled={actionLoading === bot.id}
                              className="text-emerald-400 hover:text-emerald-300 text-[10px] font-medium"
                            >
                              Resume
                            </button>
                          )}
                          {bot.status !== 'DELETED' && (
                            <button
                              onClick={() => requestAction({ botId: bot.id, botName: bot.bot_name, action: 'delete' })}
                              disabled={actionLoading === bot.id}
                              className="text-rose-400/70 hover:text-rose-400 text-[10px] font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Key Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0e0e1a] border border-[#1a1a2e] rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              Confirm {actionLabel(pendingAction.action)}
            </h3>
            <p className="text-[11px] text-slate-500 mb-4">
              Enter the API key for <span className="text-slate-300 font-medium">{pendingAction.botName}</span> to confirm.
            </p>

            <input
              ref={apiKeyInputRef}
              type="password"
              placeholder="Paste bot API key"
              value={apiKeyInput}
              onChange={(e) => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAction();
                if (e.key === 'Escape') cancelAction();
              }}
              className="modal-field w-full h-9 text-xs px-3 mb-3 font-mono"
            />

            {apiKeyError && (
              <p className="text-[11px] text-rose-400 mb-3">{apiKeyError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelAction}
                className="h-8 px-4 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 border border-[#1a1a2e] hover:border-[#2a2a3e] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={apiKeySubmitting || !apiKeyInput.trim()}
                className={`h-8 px-4 rounded-lg text-[11px] font-semibold text-white transition-opacity disabled:opacity-40 bg-gradient-to-r ${actionColor(pendingAction.action)}`}
              >
                {apiKeySubmitting ? 'Verifying...' : actionLabel(pendingAction.action)}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
