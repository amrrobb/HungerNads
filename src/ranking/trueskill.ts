/**
 * HUNGERNADS - TrueSkill Rating Engine
 *
 * Pure TypeScript implementation of Microsoft's TrueSkill ranking algorithm,
 * adapted for free-for-all (FFA) multi-agent battles.
 *
 * TrueSkill models each player's skill as a Gaussian distribution (mu, sigma)
 * where mu is the estimated skill and sigma is the uncertainty. After each game,
 * both are updated based on the outcome.
 *
 * For FFA battles, the algorithm decomposes the N-player game into pairwise
 * comparisons based on placement order: 1st beat 2nd-Nth, 2nd beat 3rd-Nth, etc.
 *
 * Reference: Herbrich, Minka & Graepel (2006) "TrueSkill: A Bayesian Skill Rating System"
 * Adapted from: github.com/lechmazur/elimination_game
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default initial skill estimate (mu). */
export const DEFAULT_MU = 25.0;

/** Default initial uncertainty (sigma = mu/3). */
export const DEFAULT_SIGMA = DEFAULT_MU / 3;

/**
 * Performance variation factor. Controls how much randomness is expected
 * in a single game outcome. Lower = outcomes are more predictive of true skill.
 * Standard: sigma_default / 2.
 */
export const BETA = DEFAULT_SIGMA / 2;

/**
 * Dynamic factor (additive sigma increase per game).
 * Prevents ratings from converging too tightly and becoming unresponsive.
 * Standard: sigma_default / 100.
 */
export const TAU = DEFAULT_SIGMA / 100;

/** Number of sigma below mu for conservative rating estimate. */
export const CONSERVATIVE_FACTOR = 3;

// ─── Gaussian Helpers ─────────────────────────────────────────────────────────

/**
 * Standard normal probability density function.
 */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal cumulative distribution function.
 * Uses the rational approximation by Abramowitz & Stegun.
 */
export function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * v function (truncated Gaussian update factor for wins).
 * v(t, epsilon) = pdf(t - epsilon) / cdf(t - epsilon)
 *
 * For no-draw games (epsilon = 0): v(t) = pdf(t) / cdf(t)
 */
export function vWin(t: number, epsilon: number = 0): number {
  const denom = normCdf(t - epsilon);
  if (denom < 1e-10) return -t + epsilon; // Limit behavior
  return normPdf(t - epsilon) / denom;
}

/**
 * w function (variance reduction factor for wins).
 * w(t, epsilon) = v(t, epsilon) * (v(t, epsilon) + t - epsilon)
 */
export function wWin(t: number, epsilon: number = 0): number {
  const v = vWin(t, epsilon);
  return v * (v + t - epsilon);
}

// ─── Rating Type ──────────────────────────────────────────────────────────────

/** A TrueSkill rating represented as a Gaussian distribution. */
export interface Rating {
  /** Estimated skill (mean of the Gaussian). */
  mu: number;
  /** Uncertainty (standard deviation of the Gaussian). */
  sigma: number;
}

/** Create a new default rating. */
export function createRating(mu: number = DEFAULT_MU, sigma: number = DEFAULT_SIGMA): Rating {
  return { mu, sigma };
}

/**
 * Conservative skill estimate: mu - k * sigma.
 * This is the "display" rating used for leaderboards.
 * With k=3, a new player starts at ~0 and rises as they play more games.
 */
export function conservativeRating(rating: Rating, k: number = CONSERVATIVE_FACTOR): number {
  return rating.mu - k * rating.sigma;
}

// ─── Pairwise Update ─────────────────────────────────────────────────────────

/**
 * Update two ratings after a head-to-head comparison where winner beat loser.
 *
 * Returns [updatedWinner, updatedLoser].
 */
export function updatePairwise(
  winner: Rating,
  loser: Rating,
  beta: number = BETA,
): [Rating, Rating] {
  const c = Math.sqrt(2 * beta * beta + winner.sigma * winner.sigma + loser.sigma * loser.sigma);
  const t = (winner.mu - loser.mu) / c;

  const v = vWin(t);
  const w = wWin(t);

  const winnerMu = winner.mu + (winner.sigma * winner.sigma / c) * v;
  const loserMu = loser.mu - (loser.sigma * loser.sigma / c) * v;

  const winnerSigmaSq = winner.sigma * winner.sigma * (1 - (winner.sigma * winner.sigma / (c * c)) * w);
  const loserSigmaSq = loser.sigma * loser.sigma * (1 - (loser.sigma * loser.sigma / (c * c)) * w);

  return [
    { mu: winnerMu, sigma: Math.sqrt(Math.max(winnerSigmaSq, 1e-6)) },
    { mu: loserMu, sigma: Math.sqrt(Math.max(loserSigmaSq, 1e-6)) },
  ];
}

// ─── FFA (Free-For-All) Update ────────────────────────────────────────────────

/** A player's identity and rating for FFA update. */
export interface FfaPlayer {
  id: string;
  rating: Rating;
}

/**
 * Update ratings for a free-for-all game based on placement order.
 *
 * Players are ordered from 1st place (index 0) to last place (index N-1).
 * The algorithm decomposes the FFA into pairwise comparisons:
 * - 1st beat 2nd, 3rd, ..., Nth
 * - 2nd beat 3rd, 4th, ..., Nth
 * - etc.
 *
 * To prevent over-updating (since each player participates in many pairwise
 * comparisons), the update magnitude is scaled by 1/(N-1) where N is the
 * number of players.
 *
 * @param placements Players ordered by placement (index 0 = 1st place).
 * @param beta Performance variation factor.
 * @param tau Dynamic factor (sigma increase per game).
 * @returns Map of player ID -> updated Rating.
 */
export function updateFfa(
  placements: FfaPlayer[],
  beta: number = BETA,
  tau: number = TAU,
): Map<string, Rating> {
  const n = placements.length;
  if (n < 2) {
    const result = new Map<string, Rating>();
    if (n === 1) result.set(placements[0].id, placements[0].rating);
    return result;
  }

  // Apply dynamic factor: increase sigma slightly before update
  const dynamicRatings = new Map<string, Rating>();
  for (const p of placements) {
    const newSigma = Math.sqrt(p.rating.sigma * p.rating.sigma + tau * tau);
    dynamicRatings.set(p.id, { mu: p.rating.mu, sigma: newSigma });
  }

  // Accumulate pairwise deltas
  const deltas = new Map<string, { muDelta: number; sigmaFactor: number }>();
  for (const p of placements) {
    deltas.set(p.id, { muDelta: 0, sigmaFactor: 0 });
  }

  // Scale factor to prevent over-updating
  const scale = 1.0 / (n - 1);

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const winnerRating = dynamicRatings.get(placements[i].id)!;
      const loserRating = dynamicRatings.get(placements[j].id)!;

      const c = Math.sqrt(
        2 * beta * beta +
        winnerRating.sigma * winnerRating.sigma +
        loserRating.sigma * loserRating.sigma,
      );
      const t = (winnerRating.mu - loserRating.mu) / c;

      const v = vWin(t);
      const w = wWin(t);

      const winnerDelta = deltas.get(placements[i].id)!;
      const loserDelta = deltas.get(placements[j].id)!;

      // Accumulate mu deltas (scaled)
      winnerDelta.muDelta += scale * (winnerRating.sigma * winnerRating.sigma / c) * v;
      loserDelta.muDelta -= scale * (loserRating.sigma * loserRating.sigma / c) * v;

      // Accumulate sigma reduction factors (scaled)
      winnerDelta.sigmaFactor += scale * (winnerRating.sigma * winnerRating.sigma / (c * c)) * w;
      loserDelta.sigmaFactor += scale * (loserRating.sigma * loserRating.sigma / (c * c)) * w;
    }
  }

  // Apply deltas
  const result = new Map<string, Rating>();
  for (const p of placements) {
    const base = dynamicRatings.get(p.id)!;
    const delta = deltas.get(p.id)!;

    const newMu = base.mu + delta.muDelta;
    const sigmaReduction = Math.min(delta.sigmaFactor, 0.95); // Cap at 95% to prevent collapse
    const newSigmaSq = base.sigma * base.sigma * (1 - sigmaReduction);

    result.set(p.id, {
      mu: newMu,
      sigma: Math.sqrt(Math.max(newSigmaSq, 1e-6)),
    });
  }

  return result;
}

// ─── Category Rating ──────────────────────────────────────────────────────────

/** Rating category for multi-dimensional skill tracking. */
export type RatingCategory = 'prediction' | 'combat' | 'survival';

/** Weights for computing composite rating from category ratings. */
export const CATEGORY_WEIGHTS: Record<RatingCategory, number> = {
  prediction: 0.30,
  combat: 0.30,
  survival: 0.40,
};

/** All category ratings for a single agent. */
export interface AgentRatings {
  prediction: Rating;
  combat: Rating;
  survival: Rating;
  composite: Rating;
  conservativeEstimate: number;
  battlesCounted: number;
}

/**
 * Compute composite rating as a weighted combination of category ratings.
 *
 * composite_mu = sum(w_i * mu_i)
 * composite_sigma = sqrt(sum(w_i^2 * sigma_i^2))
 */
export function computeComposite(
  prediction: Rating,
  combat: Rating,
  survival: Rating,
  weights: Record<RatingCategory, number> = CATEGORY_WEIGHTS,
): Rating {
  const mu =
    weights.prediction * prediction.mu +
    weights.combat * combat.mu +
    weights.survival * survival.mu;

  const sigmaSq =
    weights.prediction ** 2 * prediction.sigma ** 2 +
    weights.combat ** 2 * combat.sigma ** 2 +
    weights.survival ** 2 * survival.sigma ** 2;

  return { mu, sigma: Math.sqrt(sigmaSq) };
}

// ─── Bootstrap Confidence Intervals ───────────────────────────────────────────

/** A confidence interval with lower/upper bounds and the confidence level. */
export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number; // e.g. 0.95 for 95% CI
}

/**
 * Compute bootstrap confidence intervals for a TrueSkill rating.
 *
 * Takes historical per-game performance scores (e.g. placement-derived mu deltas)
 * and resamples them to estimate the uncertainty of the final rating.
 *
 * @param performanceScores Array of per-game performance metrics.
 * @param baseRating Current rating to use as the baseline.
 * @param numSamples Number of bootstrap samples (default 200).
 * @param confidenceLevel Confidence level (default 0.95 for 95% CI).
 * @returns ConfidenceInterval on the conservative rating estimate.
 */
export function bootstrapCI(
  performanceScores: number[],
  baseRating: Rating,
  numSamples: number = 200,
  confidenceLevel: number = 0.95,
): ConfidenceInterval {
  if (performanceScores.length < 3) {
    // Not enough data for meaningful bootstrap
    const cr = conservativeRating(baseRating);
    return {
      lower: cr - 2 * baseRating.sigma,
      upper: cr + 2 * baseRating.sigma,
      level: confidenceLevel,
    };
  }

  const estimates: number[] = [];

  for (let s = 0; s < numSamples; s++) {
    // Resample with replacement
    let sum = 0;
    let sumSq = 0;
    const n = performanceScores.length;

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      const val = performanceScores[idx];
      sum += val;
      sumSq += val * val;
    }

    const mean = sum / n;
    const variance = Math.max(sumSq / n - mean * mean, 1e-6);
    const sigma = Math.sqrt(variance);

    // Simulated conservative rating for this bootstrap sample
    estimates.push(mean - CONSERVATIVE_FACTOR * sigma / Math.sqrt(n));
  }

  // Sort and extract percentiles
  estimates.sort((a, b) => a - b);

  const alpha = (1 - confidenceLevel) / 2;
  const lowerIdx = Math.floor(alpha * numSamples);
  const upperIdx = Math.floor((1 - alpha) * numSamples) - 1;

  return {
    lower: estimates[Math.max(0, lowerIdx)],
    upper: estimates[Math.min(numSamples - 1, upperIdx)],
    level: confidenceLevel,
  };
}

// ─── Battle Result Processing ─────────────────────────────────────────────────

/**
 * Agent performance data from a single battle, used to update ratings.
 */
export interface BattlePerformance {
  agentId: string;
  /** Placement in the battle (1 = winner, 2 = second-to-last eliminated, etc.). */
  placement: number;
  /** Number of kills scored. */
  kills: number;
  /** Number of epochs survived. */
  epochsSurvived: number;
  /** Prediction accuracy (0.0 - 1.0). Fraction of correct predictions. */
  predictionAccuracy: number;
  /** Total damage dealt through combat. */
  damageDealt: number;
  /** Total damage taken from combat. */
  damageTaken: number;
}

/**
 * Derive placement-ordered lists for each rating category from battle performances.
 *
 * For SURVIVAL: placement order as-is (1st place is best).
 * For PREDICTION: ordered by prediction accuracy (highest first).
 * For COMBAT: ordered by a combat score (kills * 100 + damageDealt - damageTaken).
 *
 * @param performances Battle performance data for all agents.
 * @param currentRatings Current ratings for each agent (keyed by agent ID).
 * @returns Map of category -> ordered FfaPlayer list.
 */
export function deriveCategoryPlacements(
  performances: BattlePerformance[],
  currentRatings: Map<string, AgentRatings>,
): Map<RatingCategory, FfaPlayer[]> {
  const result = new Map<RatingCategory, FfaPlayer[]>();

  const getOrDefault = (agentId: string, category: RatingCategory): Rating => {
    const ratings = currentRatings.get(agentId);
    if (ratings) return ratings[category];
    return createRating();
  };

  // SURVIVAL: sorted by placement (lower = better)
  const survivalOrder = [...performances]
    .sort((a, b) => a.placement - b.placement)
    .map((p) => ({
      id: p.agentId,
      rating: getOrDefault(p.agentId, 'survival'),
    }));
  result.set('survival', survivalOrder);

  // PREDICTION: sorted by accuracy (higher = better)
  const predictionOrder = [...performances]
    .sort((a, b) => b.predictionAccuracy - a.predictionAccuracy)
    .map((p) => ({
      id: p.agentId,
      rating: getOrDefault(p.agentId, 'prediction'),
    }));
  result.set('prediction', predictionOrder);

  // COMBAT: sorted by combat score (higher = better)
  const combatScore = (p: BattlePerformance) =>
    p.kills * 100 + p.damageDealt - p.damageTaken * 0.5;
  const combatOrder = [...performances]
    .sort((a, b) => combatScore(b) - combatScore(a))
    .map((p) => ({
      id: p.agentId,
      rating: getOrDefault(p.agentId, 'combat'),
    }));
  result.set('combat', combatOrder);

  return result;
}
