/**
 * HUNGERNADS - Trader Agent
 *
 * Cold, analytical agent focused purely on market prediction accuracy.
 * 15-25% stakes, requires indicator confirmations (momentum, volume pattern).
 * Prefers SABOTAGE when engaging (methodical precision, +10% class bonus).
 * Uses DEFEND as insurance. Never ATTACKs (too risky/inefficient).
 *
 * Combat triangle awareness:
 * - SABOTAGE is the Trader's best combat option (+10% damage, bypasses DEFEND)
 * - Uses DEFEND as insurance against ATTACK
 * - Never ATTACKs (risky, inefficient, and gets punished by defenders)
 */

import { BaseAgent, getDefaultActions } from './base-agent';
import { EpochActionsSchema } from './schemas';
import type { ArenaState, EpochActions, CombatStance, SkillDefinition } from './schemas';
import { PERSONALITIES } from './personalities';
import { agentDecision } from '../llm';

// ---------------------------------------------------------------------------
// Trader config constants
// ---------------------------------------------------------------------------

const TRADER_STAKE_MIN = 15;
const TRADER_STAKE_MAX = 25;
const TRADER_DEFEND_HP_THRESHOLD = 0.4; // Defend more aggressively below 40% HP
const TRADER_BASE_DEFEND_CHANCE = 0.3; // 30% defend probability at normal HP
const TRADER_LOW_HP_DEFEND_CHANCE = 0.6; // 60% defend when HP is low

// ---------------------------------------------------------------------------
// TraderAgent
// ---------------------------------------------------------------------------

export class TraderAgent extends BaseAgent {
  constructor(id: string, name: string) {
    super(id, name, 'TRADER');
  }

  getPersonality(): string {
    return PERSONALITIES.TRADER.systemPrompt;
  }

  getSkillDefinition(): SkillDefinition {
    return {
      name: 'INSIDER_INFO',
      cooldown: BaseAgent.DEFAULT_SKILL_COOLDOWN,
      description: 'INSIDER INFO: Your prediction automatically succeeds this epoch, regardless of actual market direction. Guaranteed profit.',
    };
  }

  async decide(arenaState: ArenaState): Promise<EpochActions> {
    const others = arenaState.agents
      .filter(a => a.id !== this.id && a.isAlive)
      .map(a => ({ name: a.name, class: a.class, hp: a.hp }));

    const skillContext = this.getSkillPromptContext();
    const allianceContext = this.getAlliancePromptContext();

    try {
      const result = await agentDecision(
        this.name,
        this.agentClass,
        this.getPersonality() + '\n' + skillContext + '\n' + allianceContext,
        this.hp,
        {
          eth: arenaState.marketData.prices.ETH ?? 0,
          btc: arenaState.marketData.prices.BTC ?? 0,
          sol: arenaState.marketData.prices.SOL ?? 0,
          mon: arenaState.marketData.prices.MON ?? 0,
        },
        others,
        this.lessons.slice(-3).map(l => l.learning),
        this.llmKeys,
        this.currentSpatialContext || undefined,
      );

      // -------------------------------------------------------------------
      // Trader guardrails: enforce class-specific constraints
      // -------------------------------------------------------------------

      // 1. Trader NEVER attacks. Strip ATTACK stance, allow SABOTAGE.
      let combatStance: CombatStance = (result.combatStance as CombatStance) ?? 'NONE';
      let combatTarget = result.combatTarget;
      let combatStake = result.combatStake;

      if (combatStance === 'ATTACK') {
        // Trader doesn't use ATTACK — too risky. Convert to NONE or SABOTAGE.
        combatStance = 'NONE';
        combatTarget = undefined;
        combatStake = undefined;
      }

      // If SABOTAGE, cap the stake
      if (combatStance === 'SABOTAGE' && combatStake) {
        combatStake = Math.min(combatStake, Math.round(this.hp * 0.15));
      }

      // 2. Clamp prediction stake to Trader range (15-25%).
      const rawStake = result.prediction?.stake ?? TRADER_STAKE_MIN;
      const clampedStake = Math.max(
        TRADER_STAKE_MIN,
        Math.min(TRADER_STAKE_MAX, rawStake),
      );

      // 3. Defend logic: Trader defends ~30% of the time as insurance.
      //    If HP is below 40%, defend more aggressively (~60%).
      //    If LLM chose DEFEND, respect it.
      if (combatStance === 'NONE') {
        const hpRatio = this.hp / this.maxHp;
        if (hpRatio < TRADER_DEFEND_HP_THRESHOLD) {
          if (Math.random() < TRADER_LOW_HP_DEFEND_CHANCE) {
            combatStance = 'DEFEND';
          }
        } else {
          if (Math.random() < TRADER_BASE_DEFEND_CHANCE) {
            combatStance = 'DEFEND';
          }
        }
      }

      // Trader activates INSIDER_INFO when available and in a risky situation
      const wantsSkill = result.useSkill === true;
      const hpRatio = this.hp / this.maxHp;
      const shouldUseSkill = (wantsSkill || (this.canUseSkill() && hpRatio < TRADER_DEFEND_HP_THRESHOLD))
        && this.canUseSkill();

      const parsed = EpochActionsSchema.safeParse({
        prediction: {
          asset: result.prediction?.asset,
          direction: result.prediction?.direction,
          stake: clampedStake,
        },
        combatStance,
        combatTarget: (combatStance === 'SABOTAGE') ? combatTarget : undefined,
        combatStake: (combatStance === 'SABOTAGE') ? combatStake : undefined,
        useSkill: shouldUseSkill,
        reasoning: result.reasoning,
      });

      if (!parsed.success) {
        console.warn(`[TRADER:${this.name}] Invalid LLM response, using defaults`);
        return this._traderDefaults();
      }

      return parsed.data;
    } catch (error) {
      console.error(`[TRADER:${this.name}] Decision failed:`, error);
      return this._traderDefaults();
    }
  }

  // -------------------------------------------------------------------------
  // Trader-specific fallback
  // -------------------------------------------------------------------------

  /**
   * Trader defaults are more conservative than the generic getDefaultActions.
   * Minimum stake, no attack/sabotage, defend based on HP level.
   */
  private _traderDefaults(): EpochActions {
    const base = getDefaultActions(this);

    // Override stake to Trader minimum
    base.prediction.stake = TRADER_STAKE_MIN;

    // Defend if below threshold, otherwise 30% chance
    const hpRatio = this.hp / this.maxHp;
    const shouldDefend =
      hpRatio < TRADER_DEFEND_HP_THRESHOLD ||
      Math.random() < TRADER_BASE_DEFEND_CHANCE;

    base.combatStance = shouldDefend ? 'DEFEND' : 'NONE';
    base.reasoning = `[FALLBACK] ${this.name} defaulted to conservative prediction. The numbers don't lie - but the data was unclear.`;

    return base;
  }
}
