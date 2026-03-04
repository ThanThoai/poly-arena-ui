'use client';

import { useState } from 'react';
import { showToast } from '@/components/ui/toast';

interface ApiExampleModalProps {
  open: boolean;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8099/poly-arena';
const BO_URL = `${API_BASE}/binary-options`;

/* ─── Types ────────────────────────────────────────────────────────────────── */

type Lang = 'curl' | 'python' | 'js';
type MainTab = 'market' | 'limit';

interface SubSection {
  id: string;
  label: string;
  description: string;
  fields: { name: string; type: string; required: boolean; note: string }[];
  examples: Record<Lang, string>;
  responseExample?: string;
}

interface TabConfig {
  title: string;
  subtitle: string;
  method: string;
  endpoint: string;
  subsections: SubSection[];
}

/* ─── Tab configs ──────────────────────────────────────────────────────────── */

const TABS: Record<MainTab, TabConfig> = {
  market: {
    title: 'Market Order',
    subtitle: 'Fill immediately at best ask',
    method: 'POST',
    endpoint: '/binary-options/',
    subsections: [
      {
        id: 'market-basic',
        label: 'Basic',
        description:
          'Place a market order. The server fills immediately at the best available ask price via Polymarket REST API.',
        fields: [
          { name: 'symbol', type: 'string', required: true, note: 'BTC | ETH | SOL | XRP' },
          { name: 'timeframe', type: 'string', required: true, note: 'M5 | M15 | H1' },
          { name: 'forecast', type: 'string', required: true, note: 'GREEN (price up) | RED (price down)' },
          { name: 'amount', type: 'number', required: true, note: 'Bet size in USD (> 0)' },
          { name: 'order_type', type: 'string', required: false, note: 'FAK (default) = fill available, kill rest | FOK = fill all or reject' },
          { name: 'ceiling_price', type: 'number', required: false, note: '0 < price < 1 — max price willing to pay (market orders only)' },
          { name: 'session_offset', type: 'number', required: false, note: '0 = current candle (default), 1 = next candle (A+1)' },
          { name: 'timestamp', type: 'number', required: false, note: 'Unix timestamp (seconds) — target a specific candle session' },
          { name: 'reason', type: 'string', required: false, note: 'Optional note for your records' },
        ],
        examples: {
          curl: `# Basic market order
curl -X POST ${BO_URL}/ \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "symbol":    "BTC",
    "timeframe": "M5",
    "forecast":  "GREEN",
    "amount":    100
  }'

# FAK with ceiling_price — fill up to $0.55, cancel remainder
curl -X POST ${BO_URL}/ \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "symbol":        "BTC",
    "timeframe":     "M5",
    "forecast":      "GREEN",
    "amount":        100,
    "order_type":    "FAK",
    "ceiling_price": 0.55
  }'

# FOK with ceiling_price — fill ALL under $0.60, or reject entirely
curl -X POST ${BO_URL}/ \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "symbol":        "BTC",
    "timeframe":     "M5",
    "forecast":      "GREEN",
    "amount":        200,
    "order_type":    "FOK",
    "ceiling_price": 0.60
  }'`,
          python: `import requests

# FAK market order with ceiling_price
res = requests.post(
    "${BO_URL}/",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={
        "symbol":        "BTC",
        "timeframe":     "M5",
        "forecast":      "GREEN",
        "amount":        100,
        "order_type":    "FAK",       # fill what's available, cancel rest
        "ceiling_price": 0.55,        # max price willing to pay
    },
)
trade = res.json()
print(f"Trade #{trade['id']} — filled {trade.get('num_shares', 0):.2f} shares")

# FOK market order — all or nothing
res = requests.post(
    "${BO_URL}/",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={
        "symbol":        "BTC",
        "timeframe":     "M5",
        "forecast":      "GREEN",
        "amount":        200,
        "order_type":    "FOK",       # reject if can't fill entirely
        "ceiling_price": 0.60,
    },
)`,
          js: `// FAK with ceiling_price
const res = await fetch("${BO_URL}/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY",
  },
  body: JSON.stringify({
    symbol:        "BTC",
    timeframe:     "M5",
    forecast:      "GREEN",
    amount:        100,
    order_type:    "FAK",     // fill available, kill rest
    ceiling_price: 0.55,      // max price
  }),
});

const trade = await res.json();
console.log(\`Trade #\${trade.id} — \${trade.num_shares} shares @ \${trade.avg_price}\`);`,
        },
        responseExample: `// FAK — filled partially (some asks above ceiling)
{
  "id": 42,
  "symbol": "BTC",
  "timeframe": "M5",
  "forecast": "GREEN",
  "amount": 85.50,
  "original_amount": 100,
  "order_type": "FAK",
  "ceiling_price": 0.55,
  "avg_price": 0.5200,
  "num_shares": 164.42,
  "result": "PENDING"
}

// FOK — rejected (insufficient liquidity under ceiling)
{
  "detail": "FOK order rejected: insufficient liquidity under ceiling price 0.55"
}

// Market order without ceiling (default FAK, fills all)
{
  "id": 43,
  "order_type": "FAK",
  "ceiling_price": null,
  "avg_price": 0.5200,
  "num_shares": 192.3077,
  "result": "PENDING"
}`,
      },
    ],
  },

  limit: {
    title: 'Limit Order',
    subtitle: 'Fill at your target price or better',
    method: 'POST',
    endpoint: '/binary-options/',
    subsections: [
      {
        id: 'limit-basic',
        label: 'Basic',
        description:
          'Set limit_price to place a limit order. If best ask <= limit, fills immediately via REST. Otherwise, queued to the Matching Engine and fills when the ask drops to your price before expiry.',
        fields: [
          { name: 'symbol', type: 'string', required: true, note: 'BTC | ETH | SOL | XRP' },
          { name: 'timeframe', type: 'string', required: true, note: 'M5 | M15 | H1' },
          { name: 'forecast', type: 'string', required: true, note: 'GREEN | RED' },
          { name: 'amount', type: 'number', required: true, note: 'Bet size in USD' },
          { name: 'limit_price', type: 'number', required: true, note: '0 < price < 1 — max buy price' },
          { name: 'ttl', type: 'number', required: false, note: 'Auto-cancel after N seconds if unfilled' },
          { name: 'session_offset', type: 'number', required: false, note: '0 = current candle, 1 = next candle' },
          { name: 'timestamp', type: 'number', required: false, note: 'Unix ts — target a specific candle session' },
        ],
        examples: {
          curl: `curl -X POST ${BO_URL}/ \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "symbol":      "BTC",
    "timeframe":   "M5",
    "forecast":    "GREEN",
    "amount":      200,
    "limit_price": 0.45,
    "ttl":         120
  }'`,
          python: `res = requests.post(
    "${BO_URL}/",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={
        "symbol":      "BTC",
        "timeframe":   "M5",
        "forecast":    "GREEN",
        "amount":      200,
        "limit_price": 0.45,
        "ttl":         120,   # cancel if not filled in 2 min
    },
)
trade = res.json()
print(f"Limit #{trade['id']} — status: {trade['me_order_status']}")`,
          js: `const res = await fetch("${BO_URL}/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY",
  },
  body: JSON.stringify({
    symbol:      "BTC",
    timeframe:   "M5",
    forecast:    "GREEN",
    amount:      200,
    limit_price: 0.45,
    ttl:         120,
  }),
});

const trade = await res.json();
console.log(\`Limit #\${trade.id} — status: \${trade.me_order_status}\`);`,
        },
        responseExample: `// If best_ask > limit → queued to Matching Engine
{
  "id": 50,
  "limit_price": 0.45,
  "avg_price": null,
  "num_shares": null,
  "me_order_status": "PENDING",
  "result": "PENDING"
}

// If best_ask <= limit → filled immediately
{
  "id": 50,
  "limit_price": 0.45,
  "avg_price": 0.4300,
  "num_shares": 465.1163,
  "me_order_status": "FILLED",
  "result": "PENDING"
}`,
      },
    ],
  },
};

const MAIN_TABS: { id: MainTab; icon: string }[] = [
  { id: 'market', icon: '⚡' },
  { id: 'limit', icon: '🎯' },
];

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function ApiExampleModal({ open, onClose }: ApiExampleModalProps) {
  const [mainTab, setMainTab] = useState<MainTab>('market');
  const [subIdx, setSubIdx] = useState(0);
  const [lang, setLang] = useState<Lang>('curl');

  if (!open) return null;

  const config = TABS[mainTab];
  const sub = config.subsections[subIdx] ?? config.subsections[0];

  const copyCode = () => {
    navigator.clipboard.writeText(sub.examples[lang]).then(
      () => showToast('Copied!', 'ok'),
      () => showToast('Could not copy', 'error'),
    );
  };

  const handleMainTab = (id: MainTab) => {
    setMainTab(id);
    setSubIdx(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-card w-full max-w-3xl mx-4 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: '#0e0e1a', border: '1px solid #1f1f32', maxHeight: '90vh' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{
            background: 'linear-gradient(160deg,#0c0c18,#101022)',
            borderBottom: '1px solid #1a1a2a',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg,#4d79ff,#7c3aed)',
                boxShadow: '0 0 16px rgba(77,121,255,.3)',
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-100">API Documentation</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Binary Options Trading API</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Main tabs (Market / Limit) ───────────────────────────────────── */}
        <div
          className="px-4 py-2 flex gap-2 shrink-0"
          style={{ background: '#09090f', borderBottom: '1px solid #13132a' }}
        >
          {MAIN_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleMainTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                mainTab === t.id
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700'
              }`}
            >
              <span className="text-sm">{t.icon}</span>
              {TABS[t.id].title}
            </button>
          ))}

          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <span
              className="px-1.5 py-0.5 rounded font-bold"
              style={{ background: '#6366f122', color: '#6366f1' }}
            >
              POST
            </span>
            <code className="font-mono text-slate-400">{config.endpoint}</code>
          </div>
        </div>

        {/* ── Body (scrollable) ────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Description */}
          <p className="text-[12px] text-slate-400 leading-relaxed">{sub.description}</p>

          {/* Hint */}
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px]"
            style={{ background: '#0a1420', border: '1px solid #1a2a3a' }}
          >
            <span className="text-sky-400 shrink-0 mt-px">ℹ</span>
            <span className="text-slate-400">
              <strong className="text-slate-300">Session Targeting:</strong> use{' '}
              <code className="text-sky-300">session_offset</code> (0 = current, 1 = next) or{' '}
              <code className="text-sky-300">timestamp</code> (Unix seconds) to target a specific candle.
              The system resolves which candle the timestamp falls in. Max = next session (current + 1 candle ahead).
            </span>
          </div>

          {/* Fields table */}
          {sub.fields.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1a1a2a' }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ background: '#0a0a14' }}>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Field</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Type</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {sub.fields.map((f) => (
                    <tr key={f.name} style={{ borderTop: '1px solid #13132a' }}>
                      <td className="px-3 py-1.5">
                        <code className="text-violet-300">{f.name}</code>
                        {f.required && <span className="text-red-400 ml-1">*</span>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{f.type}</td>
                      <td className="px-3 py-1.5 text-slate-400">{f.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Code example */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-lg"
                style={{ background: '#09090f', border: '1px solid #1a1a2a' }}
              >
                {(['curl', 'python', 'js'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`ex-tab px-2.5 py-1 text-[11px] font-medium ${lang === l ? 'active' : ''}`}
                  >
                    {l === 'curl' ? 'cURL' : l === 'python' ? 'Python' : 'JS'}
                  </button>
                ))}
              </div>
              <button
                onClick={copyCode}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] text-slate-500 border border-[#1f1f32] hover:border-slate-500 hover:text-slate-200 transition-all"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </button>
            </div>
            <div
              className="rounded-xl overflow-x-auto"
              style={{ background: '#05050e', border: '1px solid #13132a' }}
            >
              <pre className="p-4 text-[12px] leading-[1.75] font-mono whitespace-pre">
                <code>{sub.examples[lang]}</code>
              </pre>
            </div>
          </div>

          {/* Response example */}
          {sub.responseExample && (
            <div>
              <p className="text-[11px] text-slate-500 font-medium mb-2">Response example</p>
              <div
                className="rounded-xl overflow-x-auto"
                style={{ background: '#05050e', border: '1px solid #10b98133' }}
              >
                <pre className="p-4 text-[12px] leading-[1.75] font-mono whitespace-pre text-emerald-300/80">
                  <code>{sub.responseExample}</code>
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer hint ─────────────────────────────────────────────────── */}
        <div
          className="px-5 py-3 text-[10px] text-slate-600 shrink-0 flex items-center gap-1.5"
          style={{ borderTop: '1px solid #13132a', background: '#09090f' }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
          </svg>
          All endpoints require <code className="text-slate-400 mx-1">x-api-key</code> header.
          Set <code className="text-slate-400 mx-1">limit_price</code> for limit orders.
          Use <code className="text-slate-400 mx-1">ceiling_price</code> + <code className="text-slate-400 mx-1">order_type</code> for market price caps.
        </div>
      </div>
    </div>
  );
}
