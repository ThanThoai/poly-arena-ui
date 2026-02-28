'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, getToken } from '@/lib/api';
import type { DashboardSettings } from '@/lib/settings-types';

const LS_KEY = 'pa_dashboard_settings';

function loadLocal(): DashboardSettings {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocal(s: DashboardSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch { /* ignore quota errors */ }
}

export function useSettings() {
  const [settings, setSettings] = useState<DashboardSettings>(loadLocal);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(settings);
  latestRef.current = settings;

  // On mount: if logged in, fetch from server
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoaded(true);
      return;
    }
    apiFetch<{ settings: DashboardSettings }>('/auth/settings')
      .then((res) => {
        const merged = { ...loadLocal(), ...res.settings };
        setSettings(merged);
        saveLocal(merged);
      })
      .catch(() => { /* use local fallback */ })
      .finally(() => setLoaded(true));
  }, []);

  const saveToServer = useCallback((s: DashboardSettings) => {
    const token = getToken();
    if (!token) return;
    apiFetch('/auth/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: s }),
    }).catch(() => { /* silent fail */ });
  }, []);

  const updateSettings = useCallback(
    (partial: Partial<DashboardSettings>) => {
      setSettings((prev) => {
        const next = { ...prev };
        for (const [key, val] of Object.entries(partial)) {
          (next as any)[key] = { ...((prev as any)[key] || {}), ...val };
        }
        saveLocal(next);

        // Debounce server save 500ms
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => saveToServer(next), 500);

        return next;
      });
    },
    [saveToServer],
  );

  return { settings, updateSettings, loaded };
}
