'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface CreateBotModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (data: { bot_name: string; api_key: string; balance: number }) => void;
}

export default function CreateBotModal({ open, onClose, onCreated }: CreateBotModalProps) {
  const [botName, setBotName] = useState('');
  const initialBalance = '10000';
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setBotName('');
    setError('');
    onClose();
  };

  const submitBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await apiFetch<{ bot_name: string; api_key: string; balance: number }>('/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_name: botName.trim(), initial_balance: Number(initialBalance) }),
      });
      setBotName('');
      onCreated(data);
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
          <div className="absolute inset-x-0 top-0 h-24 blur-3xl opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%,#4d79ff,transparent 70%)' }} />
          <button onClick={handleClose} className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg,#4d79ff,#7c3aed)', boxShadow: '0 0 28px rgba(77,121,255,.38)' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
            </svg>
          </div>
          <h3 className="relative font-bold text-base text-slate-100">New Bot</h3>
          <div className="relative flex items-center justify-center gap-2 mt-3">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: '#0d0d2a', color: '#a78bfa', border: '1px solid rgba(167,139,250,.2)' }}>API Key</span>
          </div>
        </div>
        <form onSubmit={submitBot} className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 uppercase tracking-widest font-medium">Bot Name</label>
            <div className="modal-field-wrap">
              <span className="modal-field-icon">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" /></svg>
              </span>
              <input value={botName} onChange={(e) => setBotName(e.target.value)} required placeholder="e.g. Alpha-v1" autoComplete="off" className="modal-field has-icon" autoFocus />
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5 pl-1">Letters, numbers and hyphens</p>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 uppercase tracking-widest font-medium">Initial Balance</label>
            <div className="modal-field-wrap">
              <span className="modal-field-icon">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
              <div className="modal-field has-icon flex items-center text-slate-300 font-medium">$10,000</div>
            </div>
          </div>
          {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={handleClose} className="flex-1 h-10 rounded-xl border border-[#1f1f32] text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:opacity-90 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#4d79ff,#7c3aed)' }}>
              {submitting ? 'Creating\u2026' : 'Create Bot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
