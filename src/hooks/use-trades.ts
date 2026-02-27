'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, Trade, Bot, BalanceHistory, SchedulerStatus, PriceEntry } from '@/lib/api';

export interface DashboardData {
  trades: Trade[];
  bots: Bot[];
  balanceHistory: BalanceHistory[];
  schedulerStatus: SchedulerStatus;
}

export function useDashboardData(intervalMs = 30_000) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [trades, bots, balanceHistory, schedulerStatus] = await Promise.all([
        apiFetch<Trade[]>('/binary-options?limit=10000'),
        apiFetch<Bot[]>('/bots'),
        apiFetch<BalanceHistory[]>('/bots/balance-history'),
        apiFetch<SchedulerStatus>('/dashboard/scheduler/status'),
      ]);
      setData({ trades, bots, balanceHistory, schedulerStatus });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll, intervalMs]);

  return { data, loading, error, refresh: fetchAll };
}

/** Dedicated hook for live price feed — polls every 5s. */
export function usePrices() {
  const [prices, setPrices] = useState<PriceEntry[]>([]);

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      try {
        const resp = await apiFetch<{ prices: PriceEntry[] }>('/binary-options/engine/prices');
        if (active) setPrices(resp.prices);
      } catch {
        // keep previous prices on error
      }
    };

    fetch();
    const id = setInterval(fetch, 5_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return prices;
}
