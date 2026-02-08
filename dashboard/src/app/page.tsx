'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AgentState, AgentClass } from '@/types';
import HeroSection from '@/components/home/HeroSection';
import BattleCard from '@/components/home/BattleCard';
import RecentResults from '@/components/home/RecentResults';
import type { RecentResult } from '@/components/home/RecentResults';
import AgentRank from '@/components/home/AgentRank';
import type { RankedAgent } from '@/components/home/AgentRank';
import BettorRank from '@/components/home/BettorRank';
import type { RankedBettor } from '@/components/home/BettorRank';
import { useFetch } from '@/hooks/useFetch';

// ---------------------------------------------------------------------------
// API response types (match backend shape)
// ---------------------------------------------------------------------------

interface BattleRow {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  winner_id: string | null;
  epoch_count: number;
}

interface BattlesResponse {
  battles: BattleRow[];
  count: number;
}

/** Shape returned by GET /battle/:id (ArenaDO live state) */
interface LiveBattleState {
  battleId: string;
  status: string;
  epoch: number;
  agents: {
    id: string;
    name: string;
    class: AgentClass;
    hp: number;
    maxHp: number;
    isAlive: boolean;
    kills: number;
    epochsSurvived?: number;
  }[];
  totalPool?: number;
}

/** Shape returned by GET /leaderboard/agents */
interface AgentLeaderboardEntry {
  agentId: string;
  agentClass: AgentClass;
  totalBattles: number;
  wins: number;
  kills: number;
  winRate: number;
  streak: number;
  avgSurvival: number;
}

interface AgentLeaderboardResponse {
  leaderboard: AgentLeaderboardEntry[];
  count: number;
}

/** Shape returned by GET /leaderboard/bettors */
interface BettorLeaderboardEntry {
  user_address: string;
  total_bets: number;
  total_wagered: number;
  total_payout: number;
  profit: number;
  wins: number;
  win_rate: number;
}

interface BettorLeaderboardResponse {
  leaderboard: BettorLeaderboardEntry[];
  count: number;
}

/** Shape returned by GET /agent/:id (for winner lookups) */
interface AgentInfo {
  id?: string;
  name?: string;
  class?: string;
  agentId?: string;
  agentClass?: string;
}

// ---------------------------------------------------------------------------
// API base URL
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// ---------------------------------------------------------------------------
// Loading skeleton component
// ---------------------------------------------------------------------------

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="card animate-pulse">
      <div className="mb-3 h-4 w-32 rounded bg-colosseum-surface-light" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 rounded bg-colosseum-surface-light/50"
          />
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-700">
        Loading {label}...
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state component
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card flex items-center justify-center py-8">
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  // ── Live battles ──────────────────────────────────────────────
  const [liveBattles, setLiveBattles] = useState<
    {
      battleId: string;
      agents: AgentState[];
      currentEpoch: number;
      totalPool: number;
    }[]
  >([]);
  const [liveBattlesLoading, setLiveBattlesLoading] = useState(true);

  const fetchLiveBattles = useCallback(async () => {
    try {
      setLiveBattlesLoading(true);

      // Step 1: Get active battle IDs
      const listRes = await fetch(
        `${API_BASE}/battles?status=active&limit=10`,
      );
      if (!listRes.ok) {
        setLiveBattles([]);
        return;
      }
      const listData = (await listRes.json()) as BattlesResponse;

      if (!listData.battles.length) {
        setLiveBattles([]);
        return;
      }

      // Step 2: Fetch full state for each active battle
      const states = await Promise.allSettled(
        listData.battles.map(async (b) => {
          const res = await fetch(`${API_BASE}/battle/${b.id}`);
          if (!res.ok) return null;
          return res.json() as Promise<LiveBattleState>;
        }),
      );

      const mapped = states
        .filter(
          (r): r is PromiseFulfilledResult<LiveBattleState> =>
            r.status === 'fulfilled' && r.value != null,
        )
        .map((r) => r.value)
        .map((state) => ({
          battleId: state.battleId ?? state.agents?.[0]?.id?.slice(0, 3) ?? '?',
          agents: (state.agents ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            class: a.class,
            hp: a.hp,
            maxHp: a.maxHp ?? 1000,
            alive: a.isAlive ?? a.hp > 0,
            kills: a.kills ?? 0,
          })),
          currentEpoch: state.epoch ?? 0,
          totalPool: state.totalPool ?? 0,
        }));

      setLiveBattles(mapped);
    } catch {
      setLiveBattles([]);
    } finally {
      setLiveBattlesLoading(false);
    }
  }, []);

  // ── Recent results ────────────────────────────────────────────
  const [recentResults, setRecentResults] = useState<RecentResult[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const fetchRecentResults = useCallback(async () => {
    try {
      setRecentLoading(true);

      const res = await fetch(
        `${API_BASE}/battles?status=completed&limit=5`,
      );
      if (!res.ok) {
        setRecentResults([]);
        return;
      }
      const data = (await res.json()) as BattlesResponse;

      if (!data.battles.length) {
        setRecentResults([]);
        return;
      }

      // For each completed battle, try to get winner info
      const results = await Promise.allSettled(
        data.battles.map(async (b) => {
          let winnerName = 'Unknown';
          let winnerClass: AgentClass = 'WARRIOR';

          if (b.winner_id) {
            try {
              const agentRes = await fetch(
                `${API_BASE}/agent/${b.winner_id}`,
              );
              if (agentRes.ok) {
                const info = (await agentRes.json()) as AgentInfo;
                winnerName =
                  info.name ?? `${info.agentClass ?? 'AGENT'}-${(info.agentId ?? b.winner_id).slice(0, 6)}`;
                winnerClass =
                  (info.class as AgentClass) ??
                  (info.agentClass as AgentClass) ??
                  'WARRIOR';
              }
            } catch {
              // Use defaults
            }
          }

          return {
            battleId: b.id.slice(0, 6),
            winnerName,
            winnerClass,
            killCount: 0, // Not available from BattleRow
            durationEpochs: b.epoch_count,
            endedAt: b.ended_at
              ? new Date(b.ended_at).getTime()
              : Date.now(),
          };
        }),
      );

      setRecentResults(
        results
          .filter(
            (r): r is PromiseFulfilledResult<RecentResult> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value),
      );
    } catch {
      setRecentResults([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  // ── Agent leaderboard ─────────────────────────────────────────
  const {
    data: agentLbData,
    loading: agentLbLoading,
  } = useFetch<AgentLeaderboardResponse>('/leaderboard/agents?limit=5');

  const topAgents: RankedAgent[] = (agentLbData?.leaderboard ?? []).map(
    (entry, i) => ({
      rank: i + 1,
      name: `${entry.agentClass}-${entry.agentId.slice(0, 6)}`,
      class: entry.agentClass,
      winRate: Math.round(entry.winRate * 100),
      totalBattles: entry.totalBattles,
    }),
  );

  // ── Bettor leaderboard ────────────────────────────────────────
  const {
    data: bettorLbData,
    loading: bettorLbLoading,
  } = useFetch<BettorLeaderboardResponse>('/leaderboard/bettors?limit=5');

  const topBettors: RankedBettor[] = (bettorLbData?.leaderboard ?? []).map(
    (entry, i) => ({
      rank: i + 1,
      address: entry.user_address,
      profit: entry.profit,
      totalBets: Number(entry.total_bets),
    }),
  );

  // ── Kick off fetches on mount ─────────────────────────────────
  useEffect(() => {
    fetchLiveBattles();
    fetchRecentResults();

    // Poll live battles every 30 seconds
    const interval = setInterval(fetchLiveBattles, 30_000);
    return () => clearInterval(interval);
  }, [fetchLiveBattles, fetchRecentResults]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div>
      <HeroSection activeBattleCount={liveBattles.length} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Left column: live battles + recent results */}
        <div className="space-y-6 lg:col-span-3">
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-blood" />
              Live Battles
            </h2>
            {liveBattlesLoading ? (
              <LoadingSkeleton label="live battles" />
            ) : liveBattles.length === 0 ? (
              <EmptyState message="No battles are currently live. Check back soon." />
            ) : (
              <div className="space-y-4">
                {liveBattles.map((battle) => (
                  <BattleCard
                    key={battle.battleId}
                    battleId={battle.battleId}
                    agents={battle.agents}
                    currentEpoch={battle.currentEpoch}
                    totalPool={battle.totalPool}
                  />
                ))}
              </div>
            )}
          </div>

          {recentLoading ? (
            <LoadingSkeleton label="recent results" />
          ) : recentResults.length === 0 ? (
            <EmptyState message="No completed battles yet." />
          ) : (
            <RecentResults results={recentResults} />
          )}
        </div>

        {/* Right column: leaderboards */}
        <div className="space-y-6 lg:col-span-2">
          {agentLbLoading ? (
            <LoadingSkeleton label="top gladiators" />
          ) : topAgents.length === 0 ? (
            <EmptyState message="No agents ranked yet." />
          ) : (
            <AgentRank agents={topAgents} />
          )}

          {bettorLbLoading ? (
            <LoadingSkeleton label="top bettors" />
          ) : topBettors.length === 0 ? (
            <EmptyState message="No bettors ranked yet." />
          ) : (
            <BettorRank bettors={topBettors} />
          )}
        </div>
      </div>

      <div className="mt-12 text-center text-xs text-gray-700">
        <p>$HNADS on nad.fun // Monad Hackathon - Moltiverse</p>
      </div>
    </div>
  );
}
