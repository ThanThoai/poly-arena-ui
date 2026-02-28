'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setUsername('');
setPassword('');
    setError('');
    setTab('login');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await login(username, password);
      } else {
        await register(username, username, password);
      }
      handleClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-card w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0e0e1a', border: '1px solid #1f1f32' }}>
        <div className="relative px-6 pt-8 pb-5 text-center" style={{ background: 'linear-gradient(160deg,#0c0c18,#111128)' }}>
          <div className="absolute inset-x-0 top-0 h-24 blur-3xl opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%,#7c3aed,transparent 70%)' }} />
          <button onClick={handleClose} className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg,#4d79ff,#a855f7)', boxShadow: '0 0 28px rgba(124,58,237,.4)' }}>
            <span className="font-black text-lg">P</span>
          </div>
          <h3 className="relative font-bold text-base text-slate-100">PolyArena</h3>
          <p className="relative text-xs text-slate-500 mt-1">Binary Options Paper Trading</p>

          <div className="flex mt-5 gap-1 p-1 rounded-xl" style={{ background: '#0a0a16' }}>
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-all ${
                  tab === t
                    ? 'bg-[#1a1a2e] text-white border border-[#2a2a4a]'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                {t === 'login' ? 'Login' : 'Register'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] text-slate-500 mb-2 block uppercase tracking-widest font-medium">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Enter username"
              autoComplete="username"
              className="modal-field w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-500 mb-2 block uppercase tracking-widest font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Enter password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              className="modal-field w-full"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={handleClose} className="flex-1 h-10 rounded-xl border border-[#1f1f32] text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-all">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-10 rounded-xl text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}
            >
              {submitting ? (tab === 'login' ? 'Logging in...' : 'Creating...') : (tab === 'login' ? 'Login' : 'Create Account')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
