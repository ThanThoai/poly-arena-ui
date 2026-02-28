'use client';

const STAGE_COLORS: Record<string, string> = {
  VALIDATION: 'text-sky-400 border-sky-500/30 bg-sky-500/5',
  MATCHING: 'text-violet-400 border-violet-500/30 bg-violet-500/5',
  MONITORING: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
  SETTLEMENT: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
};

const STAGE_DOT: Record<string, string> = {
  VALIDATION: 'bg-sky-400',
  MATCHING: 'bg-violet-400',
  MONITORING: 'bg-amber-400',
  SETTLEMENT: 'bg-emerald-400',
};

interface TraceEntry {
  timestamp: string;
  stage: string;
  action: string;
  details: string;
  data?: Record<string, unknown>;
}

export default function TraceTimeline({ traces }: { traces: TraceEntry[] }) {
  if (!traces || traces.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">Order Traces</p>
      <div className="relative pl-3">
        {/* Vertical line */}
        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-[#1f1f32]" />
        {traces.map((tr, i) => {
          const dotCls = STAGE_DOT[tr.stage] || 'bg-slate-500';
          const badgeCls = STAGE_COLORS[tr.stage] || 'text-slate-400 border-slate-500/30 bg-slate-500/5';
          const ts = tr.timestamp ? formatTraceTime(tr.timestamp) : '';

          return (
            <div key={i} className="relative flex items-start gap-2 py-1">
              {/* Dot */}
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 -ml-[7px] ring-2 ring-[#09090f] ${dotCls}`} />
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${badgeCls}`}>
                    {tr.stage}
                  </span>
                  <span className="text-[11px] text-slate-300 font-medium">{tr.action}</span>
                  {ts && <span className="text-[9px] text-slate-600 font-mono ml-auto shrink-0">{ts}</span>}
                </div>
                {tr.details && (
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{tr.details}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTraceTime(ts: string): string {
  try {
    const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    if (isNaN(d.getTime())) return ts;
    return d.toISOString().slice(11, 23);
  } catch {
    return ts;
  }
}
