/**
 * HUNGERNADS - Betting Pool Logic (D1-backed)
 *
 * Manages the betting pool for a battle. All state is persisted in D1.
 * Distribution: 85% winners, 5% treasury, 5% burn, 3% next-battle jackpot, 2% top bettor bonus.
 */

import {
  insertBet,
  getBetsByBattle,
  getBetsByUser,
  settleBet,
  settleBattleBets,
  getJackpotPool,
  setJackpotPool,
  type BetRow,
} from '../db/schema';

// ─── Betting Phase ───────────────────────────────────────────────

/**
 * Betting lifecycle phases for a battle.
 *
 * - OPEN:    Bets are accepted (battle start through first N epochs).
 * - LOCKED:  No new bets accepted; battle still in progress.
 * - SETTLED: Battle complete, payouts distributed.
 */
export type BettingPhase = 'OPEN' | 'LOCKED' | 'SETTLED';

/**
 * Number of epochs after which betting locks.
 * After this many epochs have been processed, no new bets are accepted.
 * Can be overridden via BETTING_LOCK_AFTER_EPOCH env var.
 */
export const DEFAULT_BETTING_LOCK_AFTER_EPOCH = 3;

// ─── Constants ───────────────────────────────────────────────────

export const POOL_DISTRIBUTION = {
  WINNERS: 0.85,
  TREASURY: 0.05,
  BURN: 0.05,
  JACKPOT: 0.03,
  TOP_BETTOR: 0.02,
} as const;

/** Minimum bet amount (prevents spam / dust bets). */
const MIN_BET = 1;

// ─── Types ───────────────────────────────────────────────────────

export interface Payout {
  userAddress: string;
  betAmount: number;
  /** Amount awarded from the 85% winners pool (+ any incoming jackpot). */
  payout: number;
}

export interface TopBettorBonus {
  userAddress: string;
  /** The winning bet amount that qualified them as top bettor. */
  winningBetAmount: number;
  /** The 2% bonus awarded. */
  bonus: number;
}

export interface PoolSummary {
  total: number;
  perAgent: Record<string, number>;
}

export interface PlaceBetResult {
  betId: string;
  amount: number;
  agentId: string;
}

// ─── Class ───────────────────────────────────────────────────────

export class BettingPool {
  constructor(private db: D1Database) {}

  // ── Place a bet ──────────────────────────────────────────────

  /**
   * Place a bet on an agent in a battle.
   *
   * Validates inputs, persists to D1, and returns the bet ID.
   * Throws on invalid input (caller should catch and return 400).
   */
  async placeBet(
    battleId: string,
    userAddress: string,
    agentId: string,
    amount: number,
  ): Promise<PlaceBetResult> {
    if (!battleId) throw new Error('battleId is required');
    if (!userAddress) throw new Error('userAddress is required');
    if (!agentId) throw new Error('agentId is required');
    if (amount < MIN_BET) throw new Error(`Minimum bet is ${MIN_BET}`);

    const betId = crypto.randomUUID();
    const now = new Date().toISOString();

    const row: BetRow = {
      id: betId,
      battle_id: battleId,
      user_address: userAddress,
      agent_id: agentId,
      amount,
      placed_at: now,
      settled: 0,
      payout: 0,
    };

    await insertBet(this.db, row);

    return { betId, amount, agentId };
  }

  // ── Query bets ───────────────────────────────────────────────

  /** All bets for a battle. */
  async getBets(battleId: string): Promise<BetRow[]> {
    return getBetsByBattle(this.db, battleId);
  }

  /** All bets by a specific user, optionally filtered to a battle. */
  async getUserBets(userAddress: string, battleId?: string): Promise<BetRow[]> {
    const all = await getBetsByUser(this.db, userAddress);
    if (!battleId) return all;
    return all.filter(b => b.battle_id === battleId);
  }

  // ── Pool summary ─────────────────────────────────────────────

  /** Total pool size and per-agent breakdown for a battle. */
  async getBattlePool(battleId: string): Promise<PoolSummary> {
    const bets = await getBetsByBattle(this.db, battleId);

    const perAgent: Record<string, number> = {};
    let total = 0;

    for (const bet of bets) {
      total += bet.amount;
      perAgent[bet.agent_id] = (perAgent[bet.agent_id] ?? 0) + bet.amount;
    }

    return { total, perAgent };
  }

  // ── Settlement ───────────────────────────────────────────────

  /**
   * Settle a battle. Call once when a winner is determined.
   *
   * 1. Marks all losing bets as settled (payout = 0).
   * 2. Splits the pool: 85% winners (+incoming jackpot), 5% treasury,
   *    5% burn, 3% next-battle jackpot, 2% top bettor bonus.
   * 3. Persists each winning payout to D1.
   * 4. Carries jackpot forward for the next battle.
   * 5. Returns the payout list + treasury/burn/jackpot/topBettor amounts.
   */
  async settleBattle(
    battleId: string,
    winnerId: string,
  ): Promise<{
    payouts: Payout[];
    treasury: number;
    burn: number;
    /** 3% of this battle's pool, carried forward for the next battle. */
    jackpotCarryForward: number;
    /** Incoming jackpot from previous battles that was added to the winners pool. */
    jackpotApplied: number;
    /** Top bettor bonus info (null if no winning bets). */
    topBettorBonus: TopBettorBonus | null;
  }> {
    const bets = await getBetsByBattle(this.db, battleId);
    const emptyResult = {
      payouts: [] as Payout[],
      treasury: 0,
      burn: 0,
      jackpotCarryForward: 0,
      jackpotApplied: 0,
      topBettorBonus: null,
    };

    if (bets.length === 0) {
      return emptyResult;
    }

    // Idempotency: if all bets are already settled, skip re-processing.
    const unsettledBets = bets.filter(b => b.settled === 0);
    if (unsettledBets.length === 0) {
      console.log(`[BettingPool] All bets for battle ${battleId} already settled — skipping`);
      return emptyResult;
    }

    const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);

    // ── Pool split: 85/5/5/3/2 ──────────────────────────────────
    const treasury = totalPool * POOL_DISTRIBUTION.TREASURY;
    const burn = totalPool * POOL_DISTRIBUTION.BURN;
    const jackpotCarryForward = totalPool * POOL_DISTRIBUTION.JACKPOT;
    const topBettorCut = totalPool * POOL_DISTRIBUTION.TOP_BETTOR;

    // Base winners pool = 85% of this battle's pool
    let winnerPool = totalPool * POOL_DISTRIBUTION.WINNERS;

    // ── Jackpot carry-forward ────────────────────────────────────
    // Read any accumulated jackpot from previous battles and add
    // it to this battle's winners pool. Then store the new 3% for next time.
    let jackpotApplied = 0;
    try {
      jackpotApplied = await getJackpotPool(this.db);
      if (jackpotApplied > 0) {
        winnerPool += jackpotApplied;
        console.log(`[BettingPool] Applied jackpot of ${jackpotApplied} to winners pool`);
      }
      // Store the new jackpot for the next battle
      await setJackpotPool(this.db, jackpotCarryForward);
    } catch (err) {
      console.error('[BettingPool] Jackpot read/write failed:', err);
      // Non-fatal: proceed without jackpot
    }

    // Mark losers first (bulk update).
    await settleBattleBets(this.db, battleId, winnerId);

    // Compute winner payouts.
    const winningBets = bets.filter(b => b.agent_id === winnerId);
    const totalWinningStake = winningBets.reduce((sum, b) => sum + b.amount, 0);

    const payouts: Payout[] = [];
    let topBettorBonus: TopBettorBonus | null = null;

    if (totalWinningStake > 0) {
      // Aggregate per-user (a user can have multiple bets on the winner).
      const userStakes = new Map<string, { total: number; betIds: string[] }>();

      for (const bet of winningBets) {
        const entry = userStakes.get(bet.user_address) ?? { total: 0, betIds: [] };
        entry.total += bet.amount;
        entry.betIds.push(bet.id);
        userStakes.set(bet.user_address, entry);
      }

      // ── Top bettor bonus (2%) ──────────────────────────────────
      // Awarded to the single winning bettor with the largest total stake.
      // Ties broken by first-come (Map iteration order = insertion order).
      let topBettorAddress: string | null = null;
      let topBettorStake = 0;
      for (const [addr, { total }] of userStakes) {
        if (total > topBettorStake) {
          topBettorStake = total;
          topBettorAddress = addr;
        }
      }

      // ── Distribute winner pool proportionally ──────────────────
      for (const [userAddress, { total, betIds }] of userStakes) {
        const share = total / totalWinningStake;
        let userPayout = Math.floor(winnerPool * share * 100) / 100; // floor to 2 dp

        // Add top bettor bonus if this user qualifies
        if (userAddress === topBettorAddress) {
          const bonus = Math.floor(topBettorCut * 100) / 100;
          userPayout += bonus;
          topBettorBonus = {
            userAddress,
            winningBetAmount: topBettorStake,
            bonus,
          };
        }

        payouts.push({
          userAddress,
          betAmount: total,
          payout: userPayout,
        });

        // Distribute payout across the user's individual bet rows proportionally.
        for (const betId of betIds) {
          const bet = winningBets.find(b => b.id === betId)!;
          const betShare = bet.amount / total;
          const betPayout = Math.floor(userPayout * betShare * 100) / 100;
          await settleBet(this.db, betId, betPayout);
        }
      }
    } else {
      // No winning bets — jackpot cut still carries forward, top bettor cut is unclaimable
      // (stays in the contract / is effectively lost)
    }

    return { payouts, treasury, burn, jackpotCarryForward, jackpotApplied, topBettorBonus };
  }
}
