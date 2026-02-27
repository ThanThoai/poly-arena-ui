'use client';

import { useState } from 'react';
import { apiFetch, Bot } from '@/lib/api';
import { showToast } from '@/components/ui/toast';

interface RenameBotModalProps {
  open: boolean;
  onClose: () => void;
  bots: Bot[];
  onRenamed: () => void;
}

export default function RenameBotModal({ open, onClose, bots, onRenamed }: RenameBotModalProps) {
  const [botId, setBotId] = useState('');
  const [newName, setNewName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setBotId('');
    setNewName('');
    setApiKey('');
    setError('');
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = botId || (bots.length ? String(bots[0].id) : '');
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/bots/${id}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_bot_name: newName.trim(), api_key: apiKey.trim() }),
      });
      handleClose();
      showToast(`Bot renamed to "${newName.trim()}"`, 'ok');
      onRenamed();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-card w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0e0e1a', border: '1px solid #1f1f32' }}>
        <div className="relative px-6 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(160deg,#0c0c18,#101022)' }}>
          <div className="absolute inset-x-0 top-0 h-24 blur-3xl opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%,#f59e0b,transparent 70%)' }} />
          <button onClick={handleClose} className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 0 28px rgba(245,158,11,.35)' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </div>
          <h3 className="relative font-bold text-base text-slate-100">Rename Bot</h3>
          <p className="relative text-xs text-slate-500 mt-1">API key required to verify ownership</p>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 uppercase tracking-widest font-medium">Bot</label>
            <div className="modal-field-wrap">
              <span className="modal-field-icon">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" /></svg>
              </span>
              <select value={botId || (bots.length ? String(bots[0].id) : '')} onChange={(e) => setBotId(e.target.value)} className="modal-field has-icon" style={{ appearance: 'none' as const }}>
                {bots.length ? bots.map((b) => <option key={b.id} value={String(b.id)}>{b.bot_name}</option>) : <option disabled>No bots available</option>}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 uppercase tracking-widest font-medium">New Name</label>
            <div className="modal-field-wrap">
              <span className="modal-field-icon">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="e.g. Alpha-v2" autoComplete="off" className="modal-field has-icon" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 uppercase tracking-widest font-medium">API Key</label>
            <div className="modal-field-wrap">
              <span className="modal-field-icon">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              </span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required placeholder="Your bot's API key" autoComplete="off" className="modal-field has-icon" />
            </div>
          </div>
          {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={handleClose} className="flex-1 h-10 rounded-xl border border-[#1f1f32] text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:opacity-90 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
              {submitting ? 'Renaming\u2026' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
