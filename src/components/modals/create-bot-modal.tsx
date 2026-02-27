'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { showToast } from '@/components/ui/toast';

interface CreateBotModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (data: { bot_name: string; api_key: string; balance: number }) => void;
}

export default function CreateBotModal({ open, onClose, onCreated }: CreateBotModalProps) {
  const [step, setStep] = useState<'password' | 'create'>('password');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState(false);
  const [botName, setBotName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pwVisible, setPwVisible] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setStep('password');
    setPassword('');
    setPwError(false);
    setBotName('');
    setError('');
    setPwVisible(false);
    onClose();
  };

  const checkPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== 'tori88') {
      setPwError(true);
      setPassword('');
      return;
    }
    setPwError(false);
    setStep('create');
  };

  const submitBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await apiFetch<{ bot_name: string; api_key: string; balance: number }>('/bots/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_name: botName.trim() }),
      });
      setStep('password');
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
      {step === 'password' ? (
        <div className="modal-card w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0e0e1a', border: '1px solid #1f1f32' }}>
          <div className="relative px-6 pt-8 pb-5 text-center" style={{ background: 'linear-gradient(160deg,#0c0c18,#111128)' }}>
            <div className="absolute inset-x-0 top-0 h-24 blur-3xl opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%,#7c3aed,transparent 70%)' }} />
            <button onClick={handleClose} className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)', boxShadow: '0 0 28px rgba(124,58,237,.4)' }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="relative font-bold text-base text-slate-100">Authentication</h3>
            <p className="relative text-xs text-slate-500 mt-1">Enter password to continue</p>
          </div>
          <form onSubmit={checkPassword} className="px-6 py-5 space-y-4">
            <div>
              <label className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5 uppercase tracking-widest font-medium">Password</label>
              <div className="modal-field-wrap">
                <span className="modal-field-icon">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </span>
                <input
                  type={pwVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter password"
                  autoComplete="off"
                  className="modal-field has-icon"
                  style={{ paddingRight: '3rem' }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setPwVisible(!pwVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
              </div>
            </div>
            {pwError && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">Incorrect password.</p>}
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={handleClose} className="flex-1 h-10 rounded-xl border border-[#1f1f32] text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all">Cancel</button>
              <button type="submit" className="flex-1 h-10 rounded-xl text-sm font-semibold hover:opacity-90 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}>Confirm</button>
            </div>
          </form>
        </div>
      ) : (
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
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: '#052016', color: '#34d399', border: '1px solid rgba(52,211,153,.2)' }}>$10,000</span>
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
            {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={handleClose} className="flex-1 h-10 rounded-xl border border-[#1f1f32] text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:opacity-90 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#4d79ff,#7c3aed)' }}>
                {submitting ? 'Creating\u2026' : 'Create Bot'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
