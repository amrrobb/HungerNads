/**
 * HUNGERNADS - Survivor Agent
 *
 * Defensive agent that outlasts everyone.
 * Tiny stakes (5-10%), uses DEFEND stance almost always.
 * Below 30% HP enters pure survival mode: minimum stakes, always defend.
 *
 * Combat triangle awareness:
 * - DEFEND is the Survivor's strength (+20% damage reduction)
 * - Vulnerable to SABOTAGE (bypasses defense) — may switch to NONE when
 *   SABOTAGE is suspected to avoid paying the 3% defend cost for nothing
 * - Never ATTACKs (-20% ATTACK damage penalty makes it useless)
 *
 * Unlike other agent classes, SURVIVOR enforces behavioral guardrails
 * post-LLM to ensure the class identity holds even if the LLM drifts.
 * The LLM still provides reasoning and asset/direction picks.
 */

import { BaseAgent, getDefaultActions, getFallbackMove } from './base-agent';
import type { FallbackContext } from './base-agent';
import { EpochActionsSchema } from './schemas';
import type { ArenaState, EpochActions, CombatStance, SkillDefinition } from './schemas';
import { PERSONALITIES } from './personalities';
import { agentDecision } from '../llm';
import type { AgentDecisionResult } from '../llm/multi-provider';

// ---------------------------------------------------------------------------
// Survivor configuration constants
// ---------------------------------------------------------------------------

const SURVIVOR_CONFIG = {
  /** Minimum prediction stake (% of HP) */
  stakeMin: 5,
  /** Maximum prediction stake (% of HP) in normal mode */
  stakeMax: 10,
  /** Maximum stake in survival mode (below survivalThreshold) */
  survivalStakeMax: 5,
  /** HP percentage below which survival mode activates */
  survivalThreshold: 0.3,
  /** Probability of choosing DEFEND each epoch in normal mode */
  defendProbability: 0.9,
  /** Always defend below this HP ratio */
  alwaysDefendBelow: 0.3,
} as const;

// ---------------------------------------------------------------------------
// SurvivorAgent
// ---------------------------------------------------------------------------

export class SurvivorAgent extends BaseAgent {
  constructor(id: string, name: string) {
    super(id, name, 'SURVIVOR');
  }

  getPersonality(): string {
    return PERSONALITIES.SURVIVOR.systemPrompt;
  }

  getSkillDefinition(): SkillDefinition {
    return {
      name: 'FORTIFY',
      cooldown: BaseAgent.DEFAULT_SKILL_COOLDOWN,
      description: 'FORTIFY: Become completely immune to ALL damage this epoch (combat, bleed, prediction losses). The ultimate survival tool.',
    };
  }

  async decide(arenaState: ArenaState, fallbackCtx?: FallbackContext): Promise<EpochActions> {
    const others = arenaState.agents
      .filter(a => a.id !== this.id && a.isAlive)
      .map(a => ({ name: a.name, class: a.class, hp: a.hp }));

    const hpRatio = this.hp / this.maxHp;
    const inSurvivalMode = hpRatio <= SURVIVOR_CONFIG.survivalThreshold;

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

      // -----------------------------------------------------------------
      // Enforce Survivor guardrails on top of LLM output
      // -----------------------------------------------------------------
      const enforced = this.enforceGuardrails(result, hpRatio, inSurvivalMode, others);

      const parsed = EpochActionsSchema.safeParse(enforced);

      if (!parsed.success) {
        console.warn(`[SURVIVOR:${this.name}] Invalid after enforcement, using defaults`);
        return this.getSurvivorDefaults(inSurvivalMode, fallbackCtx);
      }

      return parsed.data;
    } catch (error) {
      console.error(`[SURVIVOR:${this.name}] Decision failed:`, error);
      return this.getSurvivorDefaults(inSurvivalMode, fallbackCtx);
    }
  }

  // -----------------------------------------------------------------------
  // Guardrail enforcement
  // -----------------------------------------------------------------------

  /**
   * Clamp and override LLM output to match Survivor class rules.
   *
   * Rules enforced:
   * 1. Stake clamped to 5-10% (or 5% in survival mode)
   * 2. ATTACK and SABOTAGE are ALWAYS stripped — Survivor never offends
   * 3. Combat stance forced to DEFEND based on probability / HP threshold
   *    (may use NONE if only saboteurs remain, to avoid wasting 3% HP)
   */
  private enforceGuardrails(
    raw: AgentDecisionResult,
    hpRatio: number,
    inSurvivalMode: boolean,
    others: { name: string; class: string; hp: number }[],
  ): Record<string, unknown> {
    const prediction = raw.prediction;

    // --- Stake clamping ---
    const maxStake = inSurvivalMode
      ? SURVIVOR_CONFIG.survivalStakeMax
      : SURVIVOR_CONFIG.stakeMax;

    const clampedStake = prediction
      ? Math.max(SURVIVOR_CONFIG.stakeMin, Math.min(maxStake, prediction.stake))
      : SURVIVOR_CONFIG.stakeMin;

    // --- Combat stance logic ---
    // SURVIVOR never uses ATTACK or SABOTAGE (class penalty makes them useless).
    // Choose between DEFEND and NONE.
    let combatStance: CombatStance;

    if (inSurvivalMode || hpRatio <= SURVIVOR_CONFIG.alwaysDefendBelow) {
      // Always defend in survival mode — unless ONLY sabotage-heavy agents remain
      const hasAttackers = others.some(
        a => a.class === 'WARRIOR' || a.class === 'GAMBLER',
      );
      const onlySaboteurs = !hasAttackers && others.some(
        a => a.class === 'TRADER' || a.class === 'PARASITE',
      );
      combatStance = onlySaboteurs ? 'NONE' : 'DEFEND'; // Don't waste 3% HP if only saboteurs remain
    } else {
      const hasAggressors = others.some(
        a => a.class === 'WARRIOR' || a.class === 'GAMBLER',
      );
      // If aggressors are alive, bump probability to ~95%
      const prob = hasAggressors ? 0.95 : SURVIVOR_CONFIG.defendProbability;
      combatStance = Math.random() < prob ? 'DEFEND' : 'NONE';
    }

    // --- Build reasoning suffix for transparency ---
    const modeTag = inSurvivalMode ? '[SURVIVAL MODE] ' : '';
    const baseReasoning =
      typeof raw.reasoning === 'string' && raw.reasoning.length > 0
        ? raw.reasoning
        : 'Patience is my weapon.';

    const overrides: string[] = [];
    if (prediction && prediction.stake !== clampedStake) {
      overrides.push(`stake clamped ${prediction.stake}% -> ${clampedStake}%`);
    }
    const rawStance = raw.combatStance as string | undefined;
    if (rawStance === 'ATTACK' || rawStance === 'SABOTAGE') {
      overrides.push(`${rawStance} stripped -> ${combatStance}`);
    }
    const overrideNote =
      overrides.length > 0 ? ` [Guardrails: ${overrides.join(', ')}]` : '';

    // Survivor uses FORTIFY when in survival mode (low HP) and skill is available
    const wantsSkill = raw.useSkill === true;
    const shouldUseSkill = (wantsSkill || (this.canUseSkill() && inSurvivalMode))
      && this.canUseSkill();

    return {
      prediction: {
        asset: prediction?.asset ?? 'ETH',
        direction: prediction?.direction ?? 'UP',
        stake: clampedStake,
      },
      combatStance,
      move: raw.move,
      useSkill: shouldUseSkill,
      // NEVER attack or sabotage — core class rule
      reasoning: `${modeTag}${baseReasoning}${overrideNote}`,
    };
  }

  // -----------------------------------------------------------------------
  // Survivor-specific defaults (safer than generic getDefaultActions)
  // -----------------------------------------------------------------------

  /**
   * Fallback actions tuned for Survivor: minimum stake, always defend.
   */
  private getSurvivorDefaults(inSurvivalMode: boolean, ctx?: FallbackContext): EpochActions {
    const assets = ['ETH', 'BTC', 'SOL', 'MON'] as const;
    const asset = assets[Math.floor(Math.random() * assets.length)];
    const direction = Math.random() > 0.5 ? 'UP' : 'DOWN';
    const modeTag = inSurvivalMode ? '[SURVIVAL MODE] ' : '';
    const move = ctx ? (getFallbackMove(this, ctx) ?? undefined) : undefined;

    return {
      prediction: {
        asset,
        direction,
        stake: SURVIVOR_CONFIG.stakeMin,
      },
      combatStance: 'DEFEND',
      move,
      reasoning: `${modeTag}[FALLBACK] ${this.name} defaulted to minimum stake + DEFEND.`,
    };
  }
}
