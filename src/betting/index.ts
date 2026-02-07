/**
 * HUNGERNADS - Betting Module
 *
 * D1-backed betting pool, live odds calculation, sponsorship mechanics.
 * Distribution: 90% winners, 5% treasury, 5% burn.
 */

export { BettingPool, POOL_DISTRIBUTION } from './pool';
export type { Payout, PoolSummary, PlaceBetResult } from './pool';

export { calculateOdds, buildOddsInputs } from './odds';
export type { OddsInput, AgentOdds } from './odds';

export { SponsorshipManager, calculateHpBoost, MAX_HP_BOOST, MAX_HP_CAP, MIN_SPONSORSHIP_AMOUNT } from './sponsorship';
export type { Sponsorship, SponsorshipResult } from './sponsorship';
