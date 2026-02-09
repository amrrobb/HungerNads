/**
 * HUNGERNADS - Live Odds Calculation
 *
 * Recalculates odds each epoch based on three weighted factors:
 * - HP ratio       (40%) — current health vs max
 * - Pool weight    (30%) — inverse of betting volume (underdog bonus)
 * - Win rate       (30%) — historical performance
 *
 * The result is a probability + decimal-odds pair per agent.
 */

// ─── Types ───────────────────────────────────────────────────────

export interface OddsInput {
  agentId: string;
  hp: number;
  maxHp: number;
  /** Fraction of total betting pool on this agent (0-1). */
  poolWeight: number;
  /** Historical win rate (0-1). 0 if no battles yet. */
  winRate: number;
}

export interface AgentOdds {
  /** Estimated win probability (0-1). */
  probability: number;
  /** Decimal odds (e.g. 2.5 means bet 1 win 2.5). */
  decimal: number;
}

// ─── Weights ─────────────────────────────────────────────────────

const WEIGHT_HP = 0.4;
const WEIGHT_POOL_INVERSE = 0.3;
const WEIGHT_WIN_RATE = 0.3;

/** Minimum probability floor to avoid infinity / absurd odds. */
const MIN_PROBABILITY = 0.02;
/** Maximum probability ceiling. */
const MAX_PROBABILITY = 0.95;

// ─── Core ────────────────────────────────────────────────────────

/**
 * Calculate live odds for all agents in a battle.
 *
 * @param agents - Array of OddsInput for every *alive* agent.
 * @returns Record keyed by agentId with probability and decimal odds.
 *
 * Edge cases:
 * - Empty array          -> empty result
 * - Single agent alive   -> probability ~1, decimal ~1.05
 * - All HP at 0          -> equal split (shouldn't happen, but safe)
 * - No bets placed       -> pool weight treated as equal
 */
export function calculateOdds(
  agents: OddsInput[],
): Record<string, AgentOdds> {
  const result: Record<string, AgentOdds> = {};

  if (agents.length === 0) return result;

  // Total HP across all agents (guard against 0).
  const totalHp = agents.reduce((sum, a) => sum + a.hp, 0) || 1;

  // Total pool weight (should be ~1 if normalised, but guard).
  const totalPoolWeight = agents.reduce((sum, a) => sum + a.poolWeight, 0) || 1;

  // ── Raw scores ─────────────────────────────────────────────────
  // Compute a raw "power" score per agent, then normalise into
  // probabilities so they sum to 1.

  const rawScores: { agentId: string; score: number }[] = agents.map(agent => {
    // Factor 1: HP ratio (higher HP = stronger).
    const hpRatio = agent.hp / totalHp;

    // Factor 2: Pool weight INVERSE (less money bet = better odds).
    // If nobody bet on this agent, treat as full underdog bonus.
    const normalizedPoolWeight = agent.poolWeight / totalPoolWeight;
    const poolInverse = 1 - normalizedPoolWeight;

    // Factor 3: Win rate (higher = stronger).
    // Default to neutral 0.5 if agent has no history, to avoid penalising new agents.
    const winRate = agent.winRate > 0 ? agent.winRate : 0.5;

    const score =
      hpRatio * WEIGHT_HP +
      poolInverse * WEIGHT_POOL_INVERSE +
      winRate * WEIGHT_WIN_RATE;

    return { agentId: agent.agentId, score };
  });

  // ── Normalise to probabilities ─────────────────────────────────
  const totalScore = rawScores.reduce((sum, s) => sum + s.score, 0) || 1;

  for (const { agentId, score } of rawScores) {
    const rawProb = score / totalScore;
    const probability = Math.max(MIN_PROBABILITY, Math.min(MAX_PROBABILITY, rawProb));

    // Decimal odds = 1 / probability, rounded to 2 dp.
    const decimal = Math.round((1 / probability) * 100) / 100;

    result[agentId] = { probability, decimal };
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Build OddsInput array from arena agent states and betting pool data.
 * Convenience helper so callers don't have to manually assemble inputs.
 */
export function buildOddsInputs(
  agents: { id: string; hp: number; maxHp: number; isAlive: boolean }[],
  poolPerAgent: Record<string, number>,
  winRates: Record<string, number>,
): OddsInput[] {
  const alive = agents.filter(a => a.isAlive);
  const totalPool = Object.values(poolPerAgent).reduce((s, v) => s + v, 0) || 1;

  return alive.map(a => ({
    agentId: a.id,
    hp: a.hp,
    maxHp: a.maxHp,
    poolWeight: (poolPerAgent[a.id] ?? 0) / totalPool,
    winRate: winRates[a.id] ?? 0,
  }));
}
