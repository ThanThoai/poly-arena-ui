'use client';

import { useEffect, useState, useCallback } from 'react';

interface ToastMessage {
  text: string;
  type: 'ok' | 'error';
}

let _showToast: ((msg: ToastMessage) => void) | null = null;

export function showToast(text: string, type: 'ok' | 'error' = 'ok') {
  _showToast?.({ text, type });
}

export default function Toast() {
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const [visible, setVisible] = useState(false);

  const show = useCallback((m: ToastMessage) => {
    setMsg(m);
    setVisible(true);
    setTimeout(() => setVisible(false), 3500);
  }, []);

  useEffect(() => {
    _showToast = show;
    return () => { _showToast = null; };
  }, [show]);

  if (!visible || !msg) return null;

  const cls =
    msg.type === 'ok'
      ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
      : 'bg-rose-950 border-rose-800 text-rose-300';

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className={`px-4 py-3 rounded-xl text-sm font-medium shadow-2xl border ${cls}`}>
        {msg.text}
      </div>
    </div>
  );
}
