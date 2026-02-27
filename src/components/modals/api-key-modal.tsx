'use client';

import { showToast } from '@/components/ui/toast';
import { money } from '@/lib/helpers';

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  data: { bot_name: string; api_key: string; balance: number } | null;
}

export default function ApiKeyModal({ open, onClose, data }: ApiKeyModalProps) {
  if (!open || !data) return null;

  const copyKey = () => {
    navigator.clipboard.writeText(data.api_key).then(
      () => showToast('API Key copied!', 'ok'),
      () => showToast('Could not copy \u2014 please copy manually.', 'error'),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card w-full max-w-md mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#0e0e1a', border: '1px solid #1f1f32' }}>
        <div className="relative px-6 pt-8 pb-5 text-center" style={{ background: 'linear-gradient(160deg,#061810,#091f14)' }}>
          <div className="absolute inset-x-0 top-0 h-24 blur-3xl opacity-35 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%,#059669,transparent 70%)' }} />
          <button onClick={onClose} className="absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 0 28px rgba(5,150,105,.45)' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h3 className="relative font-bold text-base text-emerald-400">Bot created!</h3>
          <p className="relative text-xs text-slate-500 mt-1">Save your API key before closing</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ background: '#0c0c18', border: '1px solid #1a1a2a' }}>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Bot</p>
              <p className="font-semibold text-sm">{data.bot_name}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#0c0c18', border: '1px solid #1a1a2a' }}>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Balance</p>
              <p className="font-bold text-sm text-emerald-400">{money(data.balance)}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">API Key</label>
              <button onClick={copyKey} className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 px-2 py-0.5 rounded-lg hover:bg-violet-400/10 transition-all">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                Copy
              </button>
            </div>
            <div className="rounded-xl px-3.5 py-3" style={{ background: '#07070d', border: '1px solid #1a1a2a' }}>
              <code className="text-xs text-violet-300 font-mono break-all leading-relaxed">{data.api_key}</code>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3" style={{ background: '#1a0f00', border: '1px solid rgba(245,158,11,.18)' }}>
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-amber-400">Key is shown only <strong>once</strong>. Save it now.</p>
          </div>
          <button onClick={onClose} className="w-full h-10 rounded-xl text-sm font-semibold hover:opacity-90 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            Saved, close
          </button>
        </div>
      </div>
    </div>
  );
}
