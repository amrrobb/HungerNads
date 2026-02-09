'use client';

import type { AgentClass } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentLeaderboardEntry {
  agentId: string;
  agentClass: AgentClass;
  totalBattles: number;
  wins: number;
  kills: number;
  winRate: number;
  streak: number;
  avgSurvival: number;
}

interface AgentRowProps {
  entry: AgentLeaderboardEntry;
  rank: number;
}

// ---------------------------------------------------------------------------
// Class icons & badges
// ---------------------------------------------------------------------------

const CLASS_ICON: Record<AgentClass, string> = {
  WARRIOR: '\u2694\uFE0F',
  TRADER: '\uD83D\uDCCA',
  SURVIVOR: '\uD83D\uDEE1\uFE0F',
  PARASITE: '\uD83E\uDDA0',
  GAMBLER: '\uD83C\uDFB2',
};

const CLASS_BADGE: Record<AgentClass, string> = {
  WARRIOR: 'badge-warrior',
  TRADER: 'badge-trader',
  SURVIVOR: 'badge-survivor',
  PARASITE: 'badge-parasite',
  GAMBLER: 'badge-gambler',
};

// ---------------------------------------------------------------------------
// Rank badge colors
// ---------------------------------------------------------------------------

function rankClass(rank: number): string {
  if (rank === 1) return 'text-gold';
  if (rank === 2) return 'text-gray-300';
  if (rank === 3) return 'text-amber-700';
  return 'text-gray-600';
}

// ---------------------------------------------------------------------------
// Trending detection
// ---------------------------------------------------------------------------

function isTrending(entry: AgentLeaderboardEntry): boolean {
  return entry.streak >= 2 && entry.winRate >= 0.4 && entry.totalBattles >= 3;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentRow({ entry, rank }: AgentRowProps) {
  const winPct = Math.round(entry.winRate * 100);
  const trending = isTrending(entry);

  return (
    <div className="group flex items-center gap-3 rounded border border-colosseum-surface-light bg-colosseum-bg/50 px-3 py-3 transition-colors hover:border-gold/20 hover:bg-colosseum-surface/80 sm:py-2.5">
      {/* Rank */}
      <span className={`w-7 text-center text-sm font-bold ${rankClass(rank)}`}>
        {rank}
      </span>

      {/* Class icon */}
      <span className="w-6 text-center text-base" title={entry.agentClass}>
        {CLASS_ICON[entry.agentClass]}
      </span>

      {/* Name + class badge */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-bold text-gray-200">
          {entry.agentClass}-{entry.agentId.slice(0, 6)}
        </span>
        <span className={CLASS_BADGE[entry.agentClass]}>
          {entry.agentClass}
        </span>
        {trending && (
          <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
            Trending
          </span>
        )}
      </div>

      {/* Win rate bar */}
      <div className="hidden w-28 items-center gap-2 sm:flex">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-colosseum-surface-light">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${winPct}%`,
              backgroundColor:
                winPct >= 60
                  ? '#22c55e'
                  : winPct >= 40
                    ? '#f59e0b'
                    : '#dc2626',
            }}
          />
        </div>
        <span className="w-9 text-right text-xs font-bold text-gold">
          {winPct}%
        </span>
      </div>

      {/* Stats */}
      <div className="hidden gap-4 text-right md:flex">
        <div className="w-12">
          <div className="text-xs font-bold text-gray-300">{entry.kills}</div>
          <div className="text-[10px] text-gray-600">kills</div>
        </div>
        <div className="w-12">
          <div className="text-xs font-bold text-gray-300">
            {entry.totalBattles}
          </div>
          <div className="text-[10px] text-gray-600">battles</div>
        </div>
        <div className="w-12">
          <div
            className={`text-xs font-bold ${entry.streak > 0 ? 'text-green-400' : 'text-gray-500'}`}
          >
            {entry.streak > 0 ? `${entry.streak}W` : '--'}
          </div>
          <div className="text-[10px] text-gray-600">streak</div>
        </div>
      </div>

      {/* Mobile win rate */}
      <div className="text-right sm:hidden">
        <span className="text-sm font-bold text-gold">{winPct}%</span>
        <span className="ml-1 text-[10px] text-gray-600">
          ({entry.totalBattles})
        </span>
      </div>
    </div>
  );
}
