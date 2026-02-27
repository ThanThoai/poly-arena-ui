'use client';

import { useState } from 'react';
import { showToast } from '@/components/ui/toast';

interface ApiExampleModalProps {
  open: boolean;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8099/poly-arena';
const BO_URL = `${API_BASE}/binary-options`;

/* ─── Section types ─────────────────────────────────────────────────────────── */

type Lang = 'curl' | 'python' | 'js';

interface Section {
  id: string;
  title: string;
  subtitle: string;
  method: string;
  endpoint: string;
  description: string;
  fields?: { name: string; type: string; required: boolean; note: string }[];
  examples: Record<Lang, string>;
  responseExample?: string;
}

/* ─── Sections ──────────────────────────────────────────────────────────────── */

const SECTIONS: Section[] = [
  {
    id: 'market',
    title: 'Market Order',
    subtitle: 'Simplest — fill at current best ask',
    method: 'POST',
    endpoint: '/binary-options/',
    description:
      'Place a market order. The server fills immediately at the best available ask price.',
    fields: [
      { name: 'symbol',    type: 'string', required: true,  note: 'BTC | ETH | SOL | XRP' },
      { name: 'timeframe', type: 'string', required: true,  note: 'M5 | M15 | H1' },
      { name: 'forecast',  type: 'string', required: true,  note: 'GREEN (price up) | RED (price down)' },
      { name: 'amount',    type: 'number', required: true,  note: 'Bet size in USD (> 0)' },
      { name: 'reason',    type: 'string', required: false, note: 'Optional note for your records' },
    ],
    examples: {
      curl: `curl -X POST ${BO_URL}/ \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "symbol":    "BTC",
    "timeframe": "M5",
    "forecast":  "GREEN",
    "amount":    100
  }'`,
      python: `import requests

res = requests.post(
    "${BO_URL}/",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={
        "symbol":    "BTC",
        "timeframe": "M5",
        "forecast":  "GREEN",
        "amount":    100,
    },
)
trade = res.json()
print(f"Trade #{trade['id']} created — status: {trade['result']}")`,
      js: `const res = await fetch("${BO_URL}/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY",
  },
  body: JSON.stringify({
    symbol:    "BTC",
    timeframe: "M5",
    forecast:  "GREEN",
    amount:    100,
  }),
});

const trade = await res.json();
console.log(\`Trade #\${trade.id} created\`);`,
    },
    responseExample: `{
  "id": 42,
  "bot_name": "my-bot",
  "symbol": "BTC",
  "timeframe": "M5",
  "forecast": "GREEN",
  "amount": 100,
  "result": "PENDING",
  "profit": null,
  "avg_price": 0.5200,
  "num_shares": 192.30769231,
  "settlement_at": "2025-06-01T14:30:00Z",
  ...
}`,
  },
  {
    id: 'limit',
    title: 'Limit Order',
    subtitle: 'Wait for a better price',
    method: 'POST',
    endpoint: '/binary-options/',
    description:
      'Set limit_price to queue a virtual limit order. It fills only when the ask drops to your price (or better) before the candle expires.',
    fields: [
      { name: 'limit_price', type: 'number', required: true, note: '0 < price < 1 — your max buy price' },
      { name: 'ttl',         type: 'number', required: false, note: 'Auto-cancel after N seconds if unfilled' },
    ],
    examples: {
      curl: `curl -X POST ${BO_URL}/ \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "symbol":      "ETH",
    "timeframe":   "M15",
    "forecast":    "RED",
    "amount":      200,
    "limit_price": 0.45,
    "ttl":         120
  }'`,
      python: `res = requests.post(
    "${BO_URL}/",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={
        "symbol":      "ETH",
        "timeframe":   "M15",
        "forecast":    "RED",
        "amount":      200,
        "limit_price": 0.45,
        "ttl":         120,   # cancel if not filled in 2 min
    },
)
trade = res.json()
print(f"Limit order #{trade['id']} — me_status: {trade['me_order_status']}")`,
      js: `const res = await fetch("${BO_URL}/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY",
  },
  body: JSON.stringify({
    symbol:      "ETH",
    timeframe:   "M15",
    forecast:    "RED",
    amount:      200,
    limit_price: 0.45,
    ttl:         120,
  }),
});

const trade = await res.json();
console.log(\`Limit #\${trade.id} — me: \${trade.me_order_status}\`);`,
    },
  },
  {
    id: 'bracket',
    title: 'Bracket Order (TP / SL)',
    subtitle: 'Auto take-profit & stop-loss',
    method: 'POST',
    endpoint: '/binary-options/',
    description:
      'Add tp_price and/or sl_price to attach shadow bracket orders. The matching engine monitors real-time price and triggers exit automatically.',
    fields: [
      { name: 'tp_price', type: 'number', required: false, note: '0 < price < 1 — take profit exit price' },
      { name: 'sl_price', type: 'number', required: false, note: '0 < price < 1 — stop loss exit price' },
    ],
    examples: {
      curl: `curl -X POST ${BO_URL}/ \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "symbol":    "BTC",
    "timeframe": "H1",
    "forecast":  "GREEN",
    "amount":    500,
    "tp_price":  0.65,
    "sl_price":  0.35
  }'`,
      python: `res = requests.post(
    "${BO_URL}/",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={
        "symbol":    "BTC",
        "timeframe": "H1",
        "forecast":  "GREEN",
        "amount":    500,
        "tp_price":  0.65,   # exit if price hits 0.65
        "sl_price":  0.35,   # exit if price drops to 0.35
    },
)
trade = res.json()
print(f"Bracket order #{trade['id']}")`,
      js: `const res = await fetch("${BO_URL}/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY",
  },
  body: JSON.stringify({
    symbol:    "BTC",
    timeframe: "H1",
    forecast:  "GREEN",
    amount:    500,
    tp_price:  0.65,
    sl_price:  0.35,
  }),
});

const trade = await res.json();
console.log(\`Bracket #\${trade.id}\`);`,
    },
  },
  {
    id: 'status',
    title: 'Get Trade Status',
    subtitle: 'Poll by trade ID',
    method: 'GET',
    endpoint: '/binary-options/{id}',
    description:
      'After creating a trade, use the returned id to check its status. Poll until result changes from PENDING to WIN / LOSS / CANCELLED.',
    examples: {
      curl: `# Get status of trade #42
curl ${BO_URL}/42`,
      python: `trade_id = 42

res = requests.get(f"${BO_URL}/{trade_id}")
trade = res.json()

print(f"Status : {trade['result']}")       # PENDING | WIN | LOSS | CANCELLED
print(f"Profit : {trade['profit']}")       # null while PENDING
print(f"Settle : {trade['settlement_at']}") # when the candle closes

# For bracket orders, also check:
print(f"ME status : {trade['me_order_status']}")  # PENDING | FILLED | CANCELED
print(f"Exit trigger: {trade['exit_trigger']}")    # TP | SL | null`,
      js: `const tradeId = 42;

const res = await fetch(\`${BO_URL}/\${tradeId}\`);
const trade = await res.json();

console.log("Status:", trade.result);          // PENDING | WIN | LOSS | CANCELLED
console.log("Profit:", trade.profit);          // null while PENDING
console.log("Settle:", trade.settlement_at);

// For bracket orders:
console.log("ME status:", trade.me_order_status);
console.log("Exit:", trade.exit_trigger);      // TP | SL | null`,
    },
    responseExample: `{
  "id": 42,
  "result": "WIN",
  "profit": 92.30769231,
  "price_open": 67450.00,
  "price_close": 67520.00,
  "avg_price": 0.52,
  "num_shares": 192.30769231,
  "settlement_at": "2025-06-01T14:30:00Z",
  "me_order_status": "FILLED",
  "exit_trigger": null,
  ...
}`,
  },
  {
    id: 'list',
    title: 'List Trades',
    subtitle: 'Filter & paginate',
    method: 'GET',
    endpoint: '/binary-options/',
    description:
      'List all trades with optional filters. Useful to find all pending orders or review history for a specific bot.',
    fields: [
      { name: 'bot_name',  type: 'string', required: false, note: 'Filter by bot name (partial match)' },
      { name: 'symbol',    type: 'string', required: false, note: 'BTC | ETH | SOL | XRP' },
      { name: 'timeframe', type: 'string', required: false, note: 'M5 | M15 | H1' },
      { name: 'result',    type: 'string', required: false, note: 'PENDING | WIN | LOSS | CANCELLED' },
      { name: 'limit',     type: 'number', required: false, note: 'Max results (default 5000)' },
      { name: 'offset',    type: 'number', required: false, note: 'Skip N results (pagination)' },
    ],
    examples: {
      curl: `# All pending trades for my-bot
curl "${BO_URL}/?bot_name=my-bot&result=PENDING&limit=50"`,
      python: `res = requests.get(
    "${BO_URL}/",
    params={
        "bot_name": "my-bot",
        "result":   "PENDING",
        "limit":    50,
    },
)
trades = res.json()
for t in trades:
    print(f"#{t['id']} {t['symbol']} {t['forecast']} → {t['result']}")`,
      js: `const params = new URLSearchParams({
  bot_name: "my-bot",
  result:   "PENDING",
  limit:    "50",
});

const res = await fetch(\`${BO_URL}/?$\{params}\`);
const trades = await res.json();
trades.forEach(t =>
  console.log(\`#\${t.id} \${t.symbol} \${t.forecast} → \${t.result}\`)
);`,
    },
  },
];

/* ─── Component ─────────────────────────────────────────────────────────────── */

export default function ApiExampleModal({ open, onClose }: ApiExampleModalProps) {
  const [activeSection, setActiveSection] = useState('market');
  const [tab, setTab] = useState<Lang>('curl');

  if (!open) return null;

  const section = SECTIONS.find((s) => s.id === activeSection)!;

  const copyCode = () => {
    navigator.clipboard.writeText(section.examples[tab]).then(
      () => showToast('Copied!', 'ok'),
      () => showToast('Could not copy', 'error'),
    );
  };

  const methodColor: Record<string, string> = {
    GET: '#10b981',
    POST: '#6366f1',
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

        {/* ── Section tabs ────────────────────────────────────────────────── */}
        <div
          className="px-4 py-2 flex gap-1 overflow-x-auto shrink-0"
          style={{ background: '#09090f', borderBottom: '1px solid #13132a' }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => { setActiveSection(s.id); }}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                activeSection === s.id
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ background: s.method === 'POST' ? '#6366f1' : '#10b981' }}
              />
              {s.title}
            </button>
          ))}
        </div>

        {/* ── Body (scrollable) ───────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Endpoint + description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: methodColor[section.method] + '22', color: methodColor[section.method] }}
              >
                {section.method}
              </span>
              <code className="text-xs text-slate-300 font-mono">{section.endpoint}</code>
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed">{section.description}</p>
          </div>

          {/* Fields table */}
          {section.fields && section.fields.length > 0 && (
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
                  {section.fields.map((f) => (
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
                {(['curl', 'python', 'js'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setTab(lang)}
                    className={`ex-tab px-2.5 py-1 text-[11px] font-medium ${tab === lang ? 'active' : ''}`}
                  >
                    {lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'JS'}
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
                <code>{section.examples[tab]}</code>
              </pre>
            </div>
          </div>

          {/* Response example */}
          {section.responseExample && (
            <div>
              <p className="text-[11px] text-slate-500 font-medium mb-2">Response example</p>
              <div
                className="rounded-xl overflow-x-auto"
                style={{ background: '#05050e', border: '1px solid #10b98133' }}
              >
                <pre className="p-4 text-[12px] leading-[1.75] font-mono whitespace-pre text-emerald-300/80">
                  <code>{section.responseExample}</code>
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
          All POST endpoints require <code className="text-slate-400 mx-1">x-api-key</code> header. GET endpoints are public.
        </div>
      </div>
    </div>
  );
}
