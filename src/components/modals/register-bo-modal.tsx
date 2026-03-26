'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { showToast } from '@/components/ui/toast';

interface RegisterBoModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function RegisterBoModal({ open, onClose, onCreated }: RegisterBoModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [symbol, setSymbol] = useState('BTC');
  const [timeframe, setTimeframe] = useState('M15');
  const [forecast, setForecast] = useState('GREEN');
  const [amount, setAmount] = useState('');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [reason, setReason] = useState('');
  const [ttl, setTtl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setApiKey('');
    setSymbol('BTC');
    setTimeframe('M15');
    setForecast('GREEN');
    setAmount('');
    setOrderType('MARKET');
    setLimitPrice('');
    setTpPrice('');
    setSlPrice('');
    setReason('');
    setTtl('');
    setError('');
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        symbol,
        timeframe,
        forecast,
        amount: parseFloat(amount),
      };
      if (orderType === 'LIMIT' && limitPrice) body.limit_price = parseFloat(limitPrice);
      // TP/SL temporarily disabled — uncomment to re-enable
      // if (tpPrice) body.tp_price = parseFloat(tpPrice);
      // if (slPrice) body.sl_price = parseFloat(slPrice);
      if (reason.trim()) body.reason = reason.trim();
      if (ttl) body.ttl = parseInt(ttl);

      const res = await apiFetch<{ rest_order?: unknown; ws_order?: unknown }>('/binary-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey.trim() },
        body: JSON.stringify(body),
      });
      handleClose();
      const isDual = res.ws_order != null;
      showToast(isDual ? 'Trade registered (REST + WS)' : 'Trade registered', 'ok');
      onCreated();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="card w-full max-w-md mx-4 shadow-2xl">
        <div className="px-6 py-4 border-b border-[#1f1f32] flex items-center justify-between">
          <h3 className="font-semibold text-sm">Register BO Trade</h3>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-200 text-xl leading-none">&#10005;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">API Key *</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required placeholder="Bot API key" autoComplete="off" className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">Symbol *</label>
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} required>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="SOL">SOL</option>
                <option value="XRP">XRP</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">Order Type</label>
              <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT')}>
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">Timeframe *</label>
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} required>
                <option value="M5">5m</option>
                <option value="M15">15m</option>
                <option value="H1">1h</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">Forecast *</label>
              <select value={forecast} onChange={(e) => setForecast(e.target.value)} required>
                <option value="GREEN">&bull; GREEN</option>
                <option value="RED">&bull; RED</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">Amount *</label>
              <input type="number" step="any" min="0.000001" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="10" />
            </div>
          </div>

          {/* Limit price — only shown for LIMIT orders */}
          {orderType === 'LIMIT' && (
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">
                Limit Price * <span className="text-slate-600 normal-case">(0 &lt; price &lt; 1)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="0.99"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                required
                placeholder="0.50"
              />
            </div>
          )}

          {/* Bracket: TP / SL — temporarily hidden, uncomment to re-enable
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 flex items-center gap-1.5 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                TP Price <span className="text-slate-600 normal-case">(opt)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="0.99"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="0.70"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 flex items-center gap-1.5 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                SL Price <span className="text-slate-600 normal-case">(opt)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="0.99"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="0.30"
              />
            </div>
          </div>
          */}

          {/* Reason + TTL */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">Reason <span className="text-slate-600 normal-case">(opt)</span></label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. RSI oversold bounce" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wide">TTL <span className="text-slate-600 normal-case">(sec, opt)</span></label>
              <input
                type="number"
                step="1"
                min="1"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                placeholder="60"
              />
            </div>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={handleClose} className="flex-1 h-9 rounded-lg border border-[#1f1f32] text-sm hover:border-slate-400 transition-colors">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 h-9 rounded-lg text-sm font-semibold" style={{ background: 'linear-gradient(135deg,#4d79ff,#7c3aed)' }}>
              {submitting ? 'Registering\u2026' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
