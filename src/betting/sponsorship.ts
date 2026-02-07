/**
 * HUNGERNADS - Hunger Games Style Sponsorship
 *
 * "Parachute drops" from the crowd. Users send support to agents mid-battle.
 * Sponsorships restore HP (capped at 200 per drop, never exceeding maxHp).
 * Sponsor messages are displayed in the live battle feed.
 *
 * For MVP, agents always accept sponsorships immediately.
 */

import {
  insertSponsorship,
  acceptSponsorship,
  getSponsorshipsByBattle,
  getSponsorshipsByAgent,
  type SponsorshipRow,
} from '../db/schema';

// ─── Constants ──────────────────────────────────────────────────

/** Maximum HP a single sponsorship can restore. */
export const MAX_HP_BOOST = 200;

/** Absolute HP ceiling — agents cannot exceed this. */
export const MAX_HP_CAP = 1000;

/** Minimum sponsorship amount (arbitrary floor to prevent spam). */
export const MIN_SPONSORSHIP_AMOUNT = 1;

// ─── Types ──────────────────────────────────────────────────────

export interface Sponsorship {
  id: string;
  battleId: string;
  agentId: string;
  sponsorAddress: string;
  amount: number;
  message: string;
  accepted: boolean;
  hpBoost: number;
}

export interface SponsorshipResult {
  sponsorship: Sponsorship;
  hpBefore: number;
  hpAfter: number;
  actualBoost: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Calculate HP boost from a raw sponsorship amount.
 * Scales linearly: 1 amount = 1 HP, capped at MAX_HP_BOOST.
 */
export function calculateHpBoost(amount: number): number {
  if (amount <= 0) return 0;
  return Math.min(Math.floor(amount), MAX_HP_BOOST);
}

/**
 * Convert a DB row to the public Sponsorship shape.
 */
function rowToSponsorship(row: SponsorshipRow): Sponsorship {
  return {
    id: row.id,
    battleId: row.battle_id,
    agentId: row.agent_id,
    sponsorAddress: row.sponsor_address,
    amount: row.amount,
    message: row.message ?? '',
    accepted: row.accepted === 1,
    hpBoost: calculateHpBoost(row.amount),
  };
}

// ─── Manager ────────────────────────────────────────────────────

export class SponsorshipManager {
  constructor(private db: D1Database) {}

  /**
   * Send a sponsorship to an agent in a battle.
   *
   * For MVP the agent always accepts immediately, so the HP boost
   * is returned in the result. The caller (arena/epoch processor)
   * is responsible for actually applying `heal()` on the agent.
   */
  async sponsor(
    battleId: string,
    agentId: string,
    sponsorAddress: string,
    amount: number,
    message: string,
  ): Promise<Sponsorship> {
    if (amount < MIN_SPONSORSHIP_AMOUNT) {
      throw new Error(
        `Sponsorship amount must be at least ${MIN_SPONSORSHIP_AMOUNT}`,
      );
    }

    const id = generateId();
    const hpBoost = calculateHpBoost(amount);

    const row: SponsorshipRow = {
      id,
      battle_id: battleId,
      agent_id: agentId,
      sponsor_address: sponsorAddress,
      amount,
      message: message || null,
      accepted: 1, // MVP: always accept
    };

    await insertSponsorship(this.db, row);

    // MVP: auto-accept immediately
    await acceptSponsorship(this.db, id);

    return {
      id,
      battleId,
      agentId,
      sponsorAddress,
      amount,
      message: message || '',
      accepted: true,
      hpBoost,
    };
  }

  /**
   * Process acceptance/rejection of a sponsorship.
   *
   * For MVP this is a no-op since we auto-accept, but the interface
   * is here for future LLM-driven agent decisions ("Do I trust this
   * sponsor? Is it a trap?").
   */
  async processAcceptance(
    sponsorshipId: string,
    accepted: boolean,
  ): Promise<void> {
    if (accepted) {
      await acceptSponsorship(this.db, sponsorshipId);
    }
    // If rejected, we could add a rejectSponsorship DB call later.
    // For now, non-accepted sponsorships just stay with accepted=0.
  }

  /**
   * Get all sponsorships for a battle, newest first.
   */
  async getBattleSponsorships(battleId: string): Promise<Sponsorship[]> {
    const rows = await getSponsorshipsByBattle(this.db, battleId);
    return rows.map(rowToSponsorship);
  }

  /**
   * Get sponsorships for a specific agent in a battle.
   */
  async getAgentSponsorships(
    battleId: string,
    agentId: string,
  ): Promise<Sponsorship[]> {
    // getSponsorshipsByAgent filters by agent only; we post-filter by battle
    const rows = await getSponsorshipsByAgent(this.db, agentId);
    return rows.filter((r) => r.battle_id === battleId).map(rowToSponsorship);
  }

  /**
   * Convenience: sponsor + apply HP boost to an agent in one call.
   *
   * Returns the sponsorship and the actual HP change (which may be
   * less than hpBoost if the agent is near max HP).
   *
   * @param agentHp   Current agent HP
   * @param agentMaxHp Agent max HP (typically 1000)
   */
  async sponsorAndApply(
    battleId: string,
    agentId: string,
    sponsorAddress: string,
    amount: number,
    message: string,
    agentHp: number,
    agentMaxHp: number = MAX_HP_CAP,
  ): Promise<SponsorshipResult> {
    const sponsorship = await this.sponsor(
      battleId,
      agentId,
      sponsorAddress,
      amount,
      message,
    );

    const headroom = agentMaxHp - agentHp;
    const actualBoost = Math.min(sponsorship.hpBoost, headroom);

    return {
      sponsorship,
      hpBefore: agentHp,
      hpAfter: agentHp + actualBoost,
      actualBoost,
    };
  }
}
