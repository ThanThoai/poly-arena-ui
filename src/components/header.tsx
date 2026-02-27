'use client';

import { useEffect, useState, useRef } from 'react';
import { SchedulerStatus } from '@/lib/api';

interface HeaderProps {
  schedulerStatus: SchedulerStatus | null;
  lastUpdated: string;
  onRefresh: () => Promise<void>;
  onNewBot: () => void;
  onRenameBot: () => void;
  onApiExample: () => void;
  activeTab?: 'dashboard' | 'report';
  onTabChange?: (tab: 'dashboard' | 'report') => void;
}

export default function Header({ schedulerStatus, lastUpdated, onRefresh, onNewBot, onRenameBot, onApiExample, activeTab = 'dashboard', onTabChange }: HeaderProps) {
  const [spinning, setSpinning] = useState(false);
  const [schedLabel, setSchedLabel] = useState('\u2026');
  const nextRunRef = useRef<number | null>(null);

  const handleRefresh = async () => {
    setSpinning(true);
    try { await onRefresh(); } finally { setSpinning(false); }
  };

  useEffect(() => {
    if (!schedulerStatus?.running) {
      setSchedLabel('Scheduler stopped');
      return;
    }
    const INTERVAL_MS = 5 * 60 * 1000;
    nextRunRef.current = Math.ceil((Date.now() + 1) / INTERVAL_MS) * INTERVAL_MS;

    const tick = () => {
      if (!nextRunRef.current || nextRunRef.current <= Date.now()) {
        nextRunRef.current = Math.ceil((Date.now() + 1) / INTERVAL_MS) * INTERVAL_MS;
      }
      const diff = Math.floor((nextRunRef.current - Date.now()) / 1000);
      const m = Math.floor(diff / 60);
      const sec = diff % 60;
      setSchedLabel(diff > 0 ? `Scheduler \u00B7 ${m}:${String(sec).padStart(2, '0')}` : 'Scheduler \u00B7 5:00');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [schedulerStatus]);

  return (
    <header className="glass sticky top-0 z-40 border-b border-[#1a1a2e]">
      <div className="max-w-[1900px] mx-auto px-5 flex items-center gap-3" style={{ height: 52 }}>
        <div className="flex items-center gap-2 shrink-0 mr-1">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs"
            style={{ background: 'linear-gradient(135deg,#4d79ff,#a855f7)' }}
          >
            P
          </div>
          <span className="font-bold tracking-tight text-sm">PolyArena</span>
          <span className="text-slate-600 text-xs hidden sm:block">&middot; BO Dashboard</span>
        </div>

        {onTabChange && (
          <div className="flex items-center gap-1 ml-2">
            {(['dashboard', 'report'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`h-7 px-3 rounded-lg text-[11px] font-semibold transition-all ${
                  activeTab === tab
                    ? 'bg-[#1a1a2e] text-white border border-[#2a2a4a]'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
              >
                {tab === 'dashboard' ? 'Dashboard' : 'Report'}
              </button>
            ))}
          </div>
        )}

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs card-sm">
          <span
            className={`w-1.5 h-1.5 rounded-full live-dot ${
              schedulerStatus?.running ? 'bg-emerald-400' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-500">{schedLabel}</span>
        </div>

        <div className="flex-1" />
        <span className="text-[11px] text-slate-600 hidden lg:block">{lastUpdated}</span>

        <button
          onClick={handleRefresh}
          title="Refresh"
          className="h-8 px-3 rounded-lg border border-[#1f1f32] text-xs flex items-center gap-1.5 text-slate-400 hover:border-[#4d79ff] hover:text-[#7b9fff] transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${spinning ? 'spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Refresh</span>
        </button>

        <button
          onClick={onApiExample}
          className="h-8 px-3 rounded-lg border border-[#252540] text-xs font-medium flex items-center gap-1.5 text-slate-400 hover:border-violet-500/50 hover:text-violet-300 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span className="hidden sm:inline">API</span>
        </button>

        <button
          onClick={onRenameBot}
          className="h-8 px-3 rounded-lg border border-[#252540] text-xs font-medium flex items-center gap-1.5 text-amber-400 hover:border-amber-500/50 hover:text-amber-300 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="hidden sm:inline">Rename</span>
        </button>

        <button
          onClick={onNewBot}
          className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
          </svg>
          New BOT
        </button>
      </div>
    </header>
  );
}
