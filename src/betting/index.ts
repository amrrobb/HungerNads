/**
 * HUNGERNADS - Betting Module
 *
 * D1-backed betting pool, live odds calculation, sponsorship mechanics.
 * Distribution: 85% winners, 5% treasury, 5% burn, 3% jackpot, 2% top bettor.
 */

export { BettingPool, POOL_DISTRIBUTION, DEFAULT_BETTING_LOCK_AFTER_EPOCH } from './pool';
export type { BettingPhase, Payout, TopBettorBonus, PoolSummary, PlaceBetResult } from './pool';

export { calculateOdds, buildOddsInputs } from './odds';
export type { OddsInput, AgentOdds } from './odds';

export {
  SponsorshipManager,
  calculateHpBoost,
  parseSponsorTier,
  getTierConfig,
  MAX_HP_BOOST,
  MAX_HP_CAP,
  MIN_SPONSORSHIP_AMOUNT,
  SPONSOR_TIERS,
  TIER_CONFIGS,
} from './sponsorship';
export type {
  Sponsorship,
  SponsorshipResult,
  SponsorTier,
  SponsorEffect,
  TierConfig,
} from './sponsorship';
