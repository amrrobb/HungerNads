import { StatsHeader } from "@/components/agent/StatsHeader";
import { MatchupChart } from "@/components/agent/MatchupChart";
import { LessonsSection } from "@/components/agent/LessonCard";
import { DeathCausesChart } from "@/components/agent/DeathCausesChart";
import { BattleHistoryTable } from "@/components/agent/BattleHistoryTable";
import type { AgentProfileFull } from "@/types";

// ── Mock Data: Sample Warrior Agent ──────────────────────────────────────────

const MOCK_WARRIOR: AgentProfileFull = {
  id: "warrior-001",
  name: "BLOODFANG",
  class: "WARRIOR",
  totalBattles: 24,
  wins: 14,
  losses: 10,
  totalKills: 47,
  avgSurvivalEpochs: 8.3,
  currentStreak: 3,
  matchups: {
    WARRIOR: { wins: 3, losses: 2 },
    TRADER: { wins: 5, losses: 1 },
    SURVIVOR: { wins: 2, losses: 4 },
    PARASITE: { wins: 3, losses: 1 },
    GAMBLER: { wins: 4, losses: 2 },
  },
  deathCauses: {
    prediction: 2,
    combat: 4,
    bleed: 1,
    multi: 3,
  },
  lessons: [
    {
      battleId: "b-042",
      context:
        "Attacked SURVIVOR at 25% HP. Expected easy kill on a weakened target.",
      outcome:
        "SURVIVOR defended. Lost 200 HP from reflected damage. Ended up exposed to TRADER counterattack.",
      learning:
        "SURVIVORS always defend when desperate. Never attack a low-HP SURVIVOR -- they will turtle and outlast you.",
      applied:
        "Stopped targeting SURVIVORs below 30% HP. Redirected aggression to TRADERs who don't defend.",
    },
    {
      battleId: "b-039",
      context:
        "Went all-in on ETH UP prediction with 50% HP stake during high volatility.",
      outcome:
        "ETH dumped 3.2%. Lost 500 HP in a single epoch. Dropped from 1st to last place.",
      learning:
        "High-volatility epochs are traps for aggressive stakes. Cap prediction stakes at 20% during volatility spikes.",
      applied:
        "Implemented volatility detection. Reduced max stake from 50% to 20% during high-vol epochs.",
    },
    {
      battleId: "b-035",
      context:
        "Ignored PARASITE copying my predictions for 3 epochs. Focused only on attacking TRADER.",
      outcome:
        "PARASITE gained 600 HP from my correct predictions while I was spending HP on combat. PARASITE won the battle.",
      learning:
        "PARASITEs are dangerous when left unchecked. They accumulate HP without risk. Attack them early before they snowball.",
      applied:
        "Added PARASITE threat detection. Now attacks PARASITEs after 2 consecutive copy-epochs.",
    },
    {
      battleId: "b-031",
      context:
        "GAMBLER randomly attacked me on epoch 2 for 300 HP. Was not expecting early combat.",
      outcome:
        "Lost 300 HP before I could establish position. Spent rest of battle recovering instead of dominating.",
      learning:
        "GAMBLERs are unpredictable wildcards. Always defend on epoch 1-2 when a GAMBLER is in the arena.",
      applied:
        "Now auto-defends in first 2 epochs when facing a GAMBLER opponent.",
    },
    {
      battleId: "b-028",
      context:
        "Had 800 HP lead with 3 agents remaining. Switched to conservative predictions to protect lead.",
      outcome:
        "Bleed damage (2% per epoch) slowly chipped away at HP. TRADER caught up through consistent correct predictions.",
      learning:
        "Playing conservative with a lead is a losing strategy due to bleed. Must maintain aggressive predictions to offset bleed.",
      applied:
        "Minimum prediction stake now set to 15% regardless of HP lead. Never go passive.",
    },
  ],
  battleHistory: [
    {
      battleId: "b-048",
      date: "2026-02-07",
      result: "WON",
      epochsSurvived: 12,
      hpRemaining: 340,
      kills: 3,
    },
    {
      battleId: "b-045",
      date: "2026-02-06",
      result: "WON",
      epochsSurvived: 10,
      hpRemaining: 180,
      kills: 2,
    },
    {
      battleId: "b-042",
      date: "2026-02-05",
      result: "WON",
      epochsSurvived: 14,
      hpRemaining: 90,
      kills: 1,
    },
    {
      battleId: "b-039",
      date: "2026-02-04",
      result: "REKT",
      epochsSurvived: 4,
      hpRemaining: 0,
      kills: 0,
    },
    {
      battleId: "b-035",
      date: "2026-02-03",
      result: "LOST",
      epochsSurvived: 9,
      hpRemaining: 0,
      kills: 2,
    },
    {
      battleId: "b-031",
      date: "2026-02-02",
      result: "LOST",
      epochsSurvived: 6,
      hpRemaining: 0,
      kills: 1,
    },
    {
      battleId: "b-028",
      date: "2026-02-01",
      result: "LOST",
      epochsSurvived: 11,
      hpRemaining: 0,
      kills: 2,
    },
  ],
};

// ── Page ─────────────────────────────────────────────────────────────────────

interface AgentPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params;

  // In production, fetch from API. For now, use mock data.
  const agent = { ...MOCK_WARRIOR, id };

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      <StatsHeader
        name={agent.name}
        agentClass={agent.class}
        totalBattles={agent.totalBattles}
        wins={agent.wins}
        losses={agent.losses}
        totalKills={agent.totalKills}
        avgSurvivalEpochs={agent.avgSurvivalEpochs}
        currentStreak={agent.currentStreak}
      />

      {/* Lessons (prominent -- this is the key feature) */}
      <LessonsSection lessons={agent.lessons} />

      {/* Matchups and Death Causes side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MatchupChart matchups={agent.matchups} ownClass={agent.class} />
        <DeathCausesChart deathCauses={agent.deathCauses} />
      </div>

      {/* Battle History */}
      <BattleHistoryTable battles={agent.battleHistory} />
    </div>
  );
}
