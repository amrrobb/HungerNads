'use client';

import { useFetch } from '@/hooks/useFetch';
import type { AgentClass } from '@/types';
import LeaderboardTable from '@/components/leaderboard/LeaderboardTable';
import type { AgentLeaderboardEntry } from '@/components/leaderboard/AgentRow';
import type { BettorLeaderboardEntry } from '@/components/leaderboard/BettorRow';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface AgentLeaderboardResponse {
  leaderboard: AgentLeaderboardEntry[];
  count: number;
}

interface BettorLeaderboardResponse {
  leaderboard: BettorLeaderboardEntry[];
  count: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  // Fetch all agents (no limit so we can paginate client-side)
  const {
    data: agentData,
    loading: agentLoading,
    error: agentError,
  } = useFetch<AgentLeaderboardResponse>('/leaderboard/agents?limit=200');

  const {
    data: bettorData,
    loading: bettorLoading,
    error: bettorError,
  } = useFetch<BettorLeaderboardResponse>('/leaderboard/bettors?limit=200');

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <Link
            href="/"
            className="text-xs text-gray-600 transition-colors hover:text-gold"
          >
            Home
          </Link>
          <span className="text-xs text-gray-700">/</span>
          <span className="text-xs text-gray-400">Leaderboard</span>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-cinzel text-2xl font-black uppercase tracking-widest text-gold sm:text-3xl lg:text-4xl">
              Leaderboard
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Rankings of the fiercest gladiators and sharpest bettors in the
              Colosseum.
            </p>
          </div>

          {/* Stats summary */}
          <div className="hidden items-center gap-6 sm:flex">
            {!agentLoading && agentData && (
              <div className="text-right">
                <div className="text-lg font-bold text-gold">
                  {agentData.leaderboard.length}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-600">
                  Gladiators
                </div>
              </div>
            )}
            {!bettorLoading && bettorData && (
              <div className="text-right">
                <div className="text-lg font-bold text-accent-light">
                  {bettorData.leaderboard.length}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-600">
                  Bettors
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error banners */}
      {agentError && (
        <div className="mb-4 rounded-lg border border-blood/30 bg-blood/10 px-4 py-2 text-sm text-blood">
          Failed to load agent leaderboard: {agentError}
        </div>
      )}
      {bettorError && (
        <div className="mb-4 rounded-lg border border-blood/30 bg-blood/10 px-4 py-2 text-sm text-blood">
          Failed to load bettor leaderboard: {bettorError}
        </div>
      )}

      {/* Main table */}
      <div className="card">
        <LeaderboardTable
          agents={agentData?.leaderboard ?? []}
          bettors={bettorData?.leaderboard ?? []}
          agentsLoading={agentLoading}
          bettorsLoading={bettorLoading}
        />
      </div>
    </div>
  );
}
