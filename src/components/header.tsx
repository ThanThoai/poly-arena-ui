'use client';

import { useEffect, useState, useRef } from 'react';
import { SchedulerStatus, Bot, Trade } from '@/lib/api';

export type MarketType = 'prediction' | 'future';

interface HeaderProps {
  schedulerStatus: SchedulerStatus | null;
  lastUpdated: string;
  onRefresh: () => Promise<void>;
  onApiExample: () => void;
  onCreateBot: () => void;
  activeTab?: 'dashboard' | 'report' | 'bots' | 'admin';
  onTabChange?: (tab: 'dashboard' | 'report' | 'bots' | 'admin') => void;
  activeMarket?: MarketType;
  onMarketChange?: (market: MarketType) => void;
  bots?: Bot[];
  trades?: Trade[];
}

export default function Header({ schedulerStatus, lastUpdated, onRefresh, onApiExample, onCreateBot, activeTab = 'dashboard', onTabChange, activeMarket = 'prediction', onMarketChange, bots = [], trades = [] }: HeaderProps) {
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

  const tabs: Array<{ key: 'dashboard' | 'report' | 'bots' | 'admin'; label: string }> = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'report', label: 'Report' },
    { key: 'bots', label: 'Bot Manager' },
  ];

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
        </div>

        {onMarketChange && (
          <div className="flex items-center gap-0.5 ml-2 p-0.5 rounded-lg bg-[#0d0d1a] border border-[#1a1a2e]">
            {([
              { key: 'prediction' as MarketType, label: 'Prediction Market' },
              { key: 'future' as MarketType, label: 'Future Market' },
            ]).map((m) => (
              <button
                key={m.key}
                onClick={() => onMarketChange(m.key)}
                className={`h-7 px-3 rounded-md text-[11px] font-semibold transition-all ${
                  activeMarket === m.key
                    ? 'bg-gradient-to-r from-[#4d79ff] to-[#a855f7] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {activeMarket === 'prediction' && onTabChange && (
          <div className="flex items-center gap-1 ml-1">
            {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onTabChange(t.key)}
                  className={`h-7 px-3 rounded-lg text-[11px] font-semibold transition-all ${
                    activeTab === t.key
                      ? 'bg-[#1a1a2e] text-white border border-[#2a2a4a]'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  {t.label}
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
          onClick={onCreateBot}
          className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4d79ff)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Bot
        </button>
      </div>
    </header>
  );
}
