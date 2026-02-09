/**
 * HUNGERNADS - Ranking Module
 *
 * TrueSkill-based multi-dimensional agent ranking system.
 *
 * Three rating categories:
 *   - Prediction: market prediction accuracy
 *   - Combat: kills, damage dealt, combat outcomes
 *   - Survival: placement order, epochs survived
 *
 * Each category uses Microsoft's TrueSkill algorithm adapted for
 * free-for-all (FFA) multi-agent battles. A weighted composite
 * rating serves as the primary leaderboard metric.
 *
 * Bootstrap confidence intervals provide uncertainty estimates
 * for informed betting decisions.
 */

// Core TrueSkill math
export {
  createRating,
  conservativeRating,
  computeComposite,
  updatePairwise,
  updateFfa,
  deriveCategoryPlacements,
  bootstrapCI,
  DEFAULT_MU,
  DEFAULT_SIGMA,
  BETA,
  TAU,
  CONSERVATIVE_FACTOR,
  CATEGORY_WEIGHTS,
} from './trueskill';

export type {
  Rating,
  RatingCategory,
  AgentRatings,
  FfaPlayer,
  BattlePerformance,
  ConfidenceInterval,
} from './trueskill';

// Rating management (D1 integration)
export {
  RatingManager,
  extractBattlePerformances,
} from './ratings';

export type {
  AgentRatingRow,
  RatingHistoryRow,
  TrueSkillLeaderboardEntry,
  CategoryRatingDetail,
  DetailedAgentRatings,
} from './ratings';
