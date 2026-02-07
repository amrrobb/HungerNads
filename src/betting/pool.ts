/**
 * HUNGERNADS - Betting Pool Logic (D1-backed)
 *
 * Manages the betting pool for a battle. All state is persisted in D1.
 * Distribution: 90% to winners, 5% treasury, 5% burn.
 */

import {
  insertBet,
  getBetsByBattle,
  getBetsByUser,
  settleBet,
  settleBattleBets,
  type BetRow,
} from '../db/schema';

// ─── Constants ───────────────────────────────────────────────────

export const POOL_DISTRIBUTION = {
  WINNERS: 0.9,
  TREASURY: 0.05,
  BURN: 0.05,
} as const;

/** Minimum bet amount (prevents spam / dust bets). */
const MIN_BET = 1;

// ─── Types ───────────────────────────────────────────────────────

export interface Payout {
  userAddress: string;
  betAmount: number;
  /** Amount awarded from the 90% winners pool. */
  payout: number;
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
   * 2. Splits the winner pool (90%) proportionally among winning bettors.
   * 3. Persists each winning payout to D1.
   * 4. Returns the payout list + treasury/burn amounts.
   */
  async settleBattle(
    battleId: string,
    winnerId: string,
  ): Promise<{
    payouts: Payout[];
    treasury: number;
    burn: number;
  }> {
    const bets = await getBetsByBattle(this.db, battleId);

    if (bets.length === 0) {
      return { payouts: [], treasury: 0, burn: 0 };
    }

    const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);
    const winnerPool = totalPool * POOL_DISTRIBUTION.WINNERS;
    const treasury = totalPool * POOL_DISTRIBUTION.TREASURY;
    const burn = totalPool * POOL_DISTRIBUTION.BURN;

    // Mark losers first (bulk update).
    await settleBattleBets(this.db, battleId, winnerId);

    // Compute winner payouts.
    const winningBets = bets.filter(b => b.agent_id === winnerId);
    const totalWinningStake = winningBets.reduce((sum, b) => sum + b.amount, 0);

    const payouts: Payout[] = [];

    if (totalWinningStake > 0) {
      // Aggregate per-user (a user can have multiple bets on the winner).
      const userStakes = new Map<string, { total: number; betIds: string[] }>();

      for (const bet of winningBets) {
        const entry = userStakes.get(bet.user_address) ?? { total: 0, betIds: [] };
        entry.total += bet.amount;
        entry.betIds.push(bet.id);
        userStakes.set(bet.user_address, entry);
      }

      for (const [userAddress, { total, betIds }] of userStakes) {
        const share = total / totalWinningStake;
        const userPayout = Math.floor(winnerPool * share * 100) / 100; // floor to 2 dp

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
    }

    return { payouts, treasury, burn };
  }
}
