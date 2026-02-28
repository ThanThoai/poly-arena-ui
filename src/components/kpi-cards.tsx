'use client';

import { BotAchievement } from '@/lib/api';

const TIER_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  BRONZE:   { bg: '#1a1408', border: '#3d2e0a', text: '#cd7f32', icon: '\uD83E\uDD49' },
  SILVER:   { bg: '#121418', border: '#2a2e38', text: '#c0c0c0', icon: '\uD83E\uDD48' },
  GOLD:     { bg: '#1a1608', border: '#3d360a', text: '#ffd700', icon: '\uD83E\uDD47' },
  PLATINUM: { bg: '#0f1218', border: '#1e2a3e', text: '#a8e0ff', icon: '\uD83D\uDC8E' },
};

interface KpiCardsProps {
  botAchievements: Record<number, BotAchievement[]>;
}

export default function KpiCards({ botAchievements }: KpiCardsProps) {
  // Collect all achievements, newest first
  const allAchievements: BotAchievement[] = [];
  for (const achs of Object.values(botAchievements)) {
    allAchievements.push(...achs);
  }
  allAchievements.sort((a, b) => {
    const ta = a.earned_at ? new Date(a.earned_at).getTime() : 0;
    const tb = b.earned_at ? new Date(b.earned_at).getTime() : 0;
    return tb - ta;
  });

  // Take up to 4 latest unique achievements
  const shown: BotAchievement[] = [];
  const seen = new Set<string>();
  for (const ach of allAchievements) {
    const key = `${ach.bot_id}:${ach.slug}`;
    if (!seen.has(key)) {
      seen.add(key);
      shown.push(ach);
    }
    if (shown.length >= 4) break;
  }

  if (shown.length === 0) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#0e0e1a' }}>
                <span className="text-sm opacity-30">{'\uD83C\uDFC6'}</span>
              </div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest">Achievement</p>
            </div>
            <p className="text-sm text-slate-600">No badges yet</p>
            <p className="text-[10px] text-slate-700 mt-1">Trade to earn achievements</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {shown.map((ach) => {
        const cfg = TIER_CONFIG[ach.tier] || TIER_CONFIG.BRONZE;
        return (
          <div
            key={ach.id}
            className="card p-4 transition-all hover:scale-[1.02]"
            style={{ borderColor: cfg.border }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-base"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
              >
                {cfg.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest font-semibold truncate" style={{ color: cfg.text }}>
                  {ach.tier}
                </p>
              </div>
            </div>
            <p className="text-sm font-bold text-slate-200 truncate" title={ach.name}>
              {ach.name}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2" title={ach.description}>
              {ach.description}
            </p>
            <p className="text-[10px] mt-1.5 truncate" style={{ color: cfg.text }}>
              {ach.bot_name}
            </p>
          </div>
        );
      })}
    </div>
  );
}
