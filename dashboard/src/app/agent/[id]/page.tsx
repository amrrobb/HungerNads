import { notFound } from "next/navigation";
import { StatsHeader } from "@/components/agent/StatsHeader";
import { MatchupChart } from "@/components/agent/MatchupChart";
import { LessonsSection } from "@/components/agent/LessonCard";
import { DeathCausesChart } from "@/components/agent/DeathCausesChart";
import { BattleHistoryTable } from "@/components/agent/BattleHistoryTable";
import type { AgentClass, AgentProfileFull, DeathCause, Lesson } from "@/types";
import {
  getAgentProfile,
  getAgentLessons,
  getAgentMatchups,
  ApiError,
  type ApiLesson,
} from "@/lib/api";

// ── Data Mapping ────────────────────────────────────────────────────────────

const VALID_CLASSES: AgentClass[] = [
  "WARRIOR",
  "TRADER",
  "SURVIVOR",
  "PARASITE",
  "GAMBLER",
];

/**
 * Map backend death causes (keyed by killer class name or "BLEED") to the
 * frontend DeathCause enum. Backend tracks WHO killed (class names), while
 * frontend tracks HOW (prediction/combat/bleed/multi).
 *
 * Mapping:
 *   - "BLEED" -> "bleed"
 *   - Any agent class name -> "combat"
 *   - Unknown -> "multi"
 *
 * "prediction" deaths aren't tracked separately by the backend yet, so
 * prediction defaults to 0 unless explicitly present.
 */
function mapDeathCauses(
  raw: Record<string, number>,
): Record<DeathCause, number> {
  const mapped: Record<DeathCause, number> = {
    prediction: 0,
    combat: 0,
    bleed: 0,
    multi: 0,
  };

  for (const [key, count] of Object.entries(raw)) {
    const upper = key.toUpperCase();
    if (upper === "BLEED") {
      mapped.bleed += count;
    } else if (upper === "PREDICTION") {
      mapped.prediction += count;
    } else if (upper === "MULTI") {
      mapped.multi += count;
    } else if (VALID_CLASSES.includes(upper as AgentClass)) {
      // Killed by another agent class = combat death
      mapped.combat += count;
    } else {
      mapped.multi += count;
    }
  }

  return mapped;
}

/** Map backend lessons to frontend Lesson type (drops epoch field). */
function mapLesson(api: ApiLesson): Lesson {
  return {
    battleId: api.battleId,
    context: api.context,
    outcome: api.outcome,
    learning: api.learning,
    applied: api.applied,
  };
}

/**
 * Map backend matchups to a complete Record<AgentClass, {wins, losses}>.
 * Backend may only include classes the agent has actually faced, so
 * we fill in zeros for missing classes.
 */
function mapMatchups(
  raw: Record<string, { wins: number; losses: number }>,
): Record<AgentClass, { wins: number; losses: number }> {
  const result = {} as Record<AgentClass, { wins: number; losses: number }>;
  for (const cls of VALID_CLASSES) {
    result[cls] = raw[cls] ?? { wins: 0, losses: 0 };
  }
  return result;
}

/**
 * Derive a display name from the agent class and ID.
 * Backend profile doesn't include name, so we generate one.
 * Format: CLASS-<first6chars> e.g. "WARRIOR-a1b2c3"
 */
function deriveAgentName(agentId: string, agentClass: string): string {
  const shortId = agentId.slice(0, 6).toUpperCase();
  return `${agentClass}-${shortId}`;
}

// ── Data Fetching ───────────────────────────────────────────────────────────

async function fetchAgentData(agentId: string): Promise<AgentProfileFull | null> {
  try {
    // Fetch all three endpoints in parallel
    const [profile, lessonsRes, matchupsRes] = await Promise.all([
      getAgentProfile(agentId),
      getAgentLessons(agentId, 20),
      getAgentMatchups(agentId),
    ]);

    // Use the dedicated matchups endpoint for the latest data,
    // falling back to the profile's matchups if the endpoint returns empty
    const rawMatchups =
      Object.keys(matchupsRes.matchups).length > 0
        ? matchupsRes.matchups
        : profile.matchups;

    // Use the dedicated lessons endpoint (which supports higher limits)
    // falling back to profile's recentLessons
    const rawLessons =
      lessonsRes.lessons.length > 0
        ? lessonsRes.lessons
        : profile.recentLessons;

    const agentClass = (
      VALID_CLASSES.includes(profile.agentClass as AgentClass)
        ? profile.agentClass
        : "WARRIOR"
    ) as AgentClass;

    const losses = profile.totalBattles - profile.wins;

    return {
      id: profile.agentId,
      name: deriveAgentName(profile.agentId, profile.agentClass),
      class: agentClass,
      totalBattles: profile.totalBattles,
      wins: profile.wins,
      losses: losses >= 0 ? losses : 0,
      totalKills: profile.kills,
      avgSurvivalEpochs: profile.avgSurvival,
      currentStreak: profile.streak,
      matchups: mapMatchups(rawMatchups),
      deathCauses: mapDeathCauses(profile.deathCauses),
      lessons: rawLessons.map(mapLesson),
      battleHistory: [], // Backend doesn't expose battle history endpoint yet
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface AgentPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params;

  const agent = await fetchAgentData(id);

  if (!agent) {
    notFound();
  }

  const hasDeaths = Object.values(agent.deathCauses).some((v) => v > 0);

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
        {hasDeaths && <DeathCausesChart deathCauses={agent.deathCauses} />}
      </div>

      {/* Battle History (shown only if data exists) */}
      {agent.battleHistory.length > 0 && (
        <BattleHistoryTable battles={agent.battleHistory} />
      )}
    </div>
  );
}
