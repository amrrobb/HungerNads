/**
 * HUNGERNADS - Combat Resolution (Triangle System)
 *
 * 3-way combat triangle: Attack > Sabotage > Defend > Attack
 *
 * Pure functions for resolving combat stances between agents.
 * No side effects - the caller is responsible for applying HP changes.
 *
 * Triangle resolution:
 * - ATTACK vs SABOTAGE: Attack overpowers. Attacker steals full stake.
 * - SABOTAGE vs DEFEND: Sabotage bypasses. Saboteur deals 60% stake damage.
 * - DEFEND vs ATTACK:  Defend absorbs. Attacker takes 50% reflected, defender takes 25%.
 * - Same stance:       Stalemate. Both take reduced damage (30% stake).
 * - vs NONE:           Uncontested. Full effect.
 *
 * Class-specific stance modifiers:
 * - WARRIOR:  +20% ATTACK damage, -10% DEFEND effectiveness
 * - TRADER:   +10% SABOTAGE damage (methodical precision)
 * - SURVIVOR: +20% DEFEND damage reduction, -20% ATTACK damage
 * - PARASITE: +10% SABOTAGE damage
 * - GAMBLER:  Random 0-15% bonus on all stances
 *
 * Bleed: every alive agent loses 2% HP per epoch (unchanged from v1).
 */

import type { EpochActions, CombatStance, AgentClass, SkillName } from '../agents/schemas';
import type { SponsorEffect } from '../betting/sponsorship';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Combat outcome describes what happened between aggressor and target.
 * - OVERPOWER:   Attack beat Sabotage (full steal)
 * - ABSORB:      Defend beat Attack (reflected + reduced)
 * - BYPASS:      Sabotage beat Defend (partial damage, ignores defense)
 * - STALEMATE:   Same offensive stance (reduced damage to both)
 * - UNCONTESTED: Target had NONE or was attacking someone else (full effect)
 */
export type CombatOutcome = 'OVERPOWER' | 'ABSORB' | 'BYPASS' | 'STALEMATE' | 'UNCONTESTED';

export interface CombatResult {
  attackerId: string;
  targetId: string;
  attackerStance: CombatStance;
  targetStance: CombatStance;
  outcome: CombatOutcome;
  stake: number;
  /** HP change for the attacker (positive = healed/stolen, negative = lost) */
  hpChangeAttacker: number;
  /** HP change for the target (negative = damage taken, positive = healed) */
  hpChangeTarget: number;
  // ── Backward-compatible fields for death.ts / lessons.ts migration ──
  /** @deprecated Use hpChangeAttacker/hpChangeTarget. Kept for death.ts compat. */
  attackStake: number;
  /** @deprecated True only when targetStance === 'DEFEND' and outcome === 'ABSORB'. */
  defended: boolean;
  /** @deprecated Legacy: positive = attacker net gain, negative = attacker net loss. */
  hpTransfer: number;
}

export interface BleedResult {
  agentId: string;
  bleedAmount: number;
  hpBefore: number;
  hpAfter: number;
}

export interface DefendCostResult {
  agentId: string;
  cost: number;
  hpBefore: number;
  hpAfter: number;
}

/** Minimal agent state needed for combat resolution. */
export interface CombatAgentState {
  hp: number;
  isAlive: boolean;
  agentClass?: AgentClass;
  /** Active skill for this epoch (set by epoch processor after skill activation). */
  activeSkill?: SkillName;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFEND_COST_PERCENT = 0.03; // 3% of current HP (reduced from 5% since defend now loses to sabotage)
const BLEED_PERCENT = 0.02; // 2% HP per epoch

/** Damage multipliers for each triangle outcome */
const DAMAGE_TABLE = {
  /** Attack > Sabotage: attacker steals 100% of stake from target */
  OVERPOWER_STEAL: 1.0,
  /** Defend > Attack: attacker reflected damage = 50% of stake */
  ABSORB_REFLECT: 0.5,
  /** Defend > Attack: defender still takes 25% of stake as residual */
  ABSORB_RESIDUAL: 0.25,
  /** Sabotage > Defend: saboteur deals 60% of stake (bypasses defense) */
  BYPASS_DAMAGE: 0.6,
  /** Same stance stalemate: each takes 30% of the other's stake as damage */
  STALEMATE_DAMAGE: 0.3,
  /** ATTACK vs NONE/non-defending: full steal */
  UNCONTESTED_ATTACK_STEAL: 1.0,
  /** SABOTAGE vs NONE/non-defending: 60% damage (no steal, just drain) */
  UNCONTESTED_SABOTAGE_DAMAGE: 0.6,
} as const;

/** Class-specific stance modifiers (multiplicative bonus/penalty) */
const CLASS_MODIFIERS: Record<AgentClass, Partial<Record<CombatStance, number>>> = {
  WARRIOR:  { ATTACK: 0.20, DEFEND: -0.10 },
  TRADER:   { SABOTAGE: 0.10 },
  SURVIVOR: { DEFEND: 0.20, ATTACK: -0.20 },
  PARASITE: { SABOTAGE: 0.10 },
  GAMBLER:  {}, // Random bonus applied separately
};

// ─── Class Modifier Helpers ──────────────────────────────────────────

/**
 * Get the damage modifier for a given agent class and stance.
 * Returns a multiplicative factor (e.g. 0.20 means +20% damage).
 * GAMBLER gets a random 0-15% bonus on any stance.
 */
function getClassModifier(agentClass: AgentClass | undefined, stance: CombatStance): number {
  if (!agentClass) return 0;

  if (agentClass === 'GAMBLER') {
    // Random bonus 0-15% on any combat stance
    return stance !== 'NONE' ? Math.random() * 0.15 : 0;
  }

  return CLASS_MODIFIERS[agentClass]?.[stance] ?? 0;
}

/**
 * Apply class modifier to a damage value.
 * Positive modifier = more damage dealt (or more reduction for DEFEND).
 * Negative modifier = less damage dealt.
 */
function applyModifier(baseDamage: number, modifier: number): number {
  return Math.round(baseDamage * (1 + modifier));
}

// ─── Combat Resolution ──────────────────────────────────────────────

/**
 * Resolve all combat actions for an epoch using the 3-way triangle.
 *
 * Resolution order:
 * 1. Identify each agent's stance and target
 * 2. Apply defend costs (3% HP) for all DEFEND agents (waived by sponsor freeDefend)
 * 3. Resolve each ATTACK/SABOTAGE action against its target:
 *    - Compare aggressor stance vs target stance
 *    - Apply triangle outcome + class modifiers + sponsor attack boost
 *    - Generate CombatResult with HP changes
 *
 * @param sponsorEffects Optional map of agentId -> SponsorEffect for this epoch.
 *   Agents with freeDefend skip the 3% defend cost. Agents with attackBoost get
 *   additional damage multiplier stacked on top of their class modifier.
 */
export function resolveCombat(
  actions: Map<string, EpochActions>,
  agents: Map<string, CombatAgentState>,
  sponsorEffects?: Map<string, SponsorEffect>,
): { combatResults: CombatResult[]; defendCosts: DefendCostResult[] } {
  const combatResults: CombatResult[] = [];
  const defendCosts: DefendCostResult[] = [];

  // Build a map of each agent's effective stance
  const stances = new Map<string, CombatStance>();
  for (const [agentId, action] of actions) {
    const agent = agents.get(agentId);
    if (!agent || !agent.isAlive) continue;
    stances.set(agentId, getEffectiveStance(action));
  }

  // Apply defend costs for all DEFEND agents (3% HP, waived by sponsor freeDefend)
  for (const [agentId, stance] of stances) {
    if (stance !== 'DEFEND') continue;
    const agent = agents.get(agentId);
    if (!agent || !agent.isAlive) continue;

    // Check if this agent has a sponsor freeDefend effect
    const effect = sponsorEffects?.get(agentId);
    if (effect?.freeDefend) {
      // Free defend: cost is waived, but we still log it as 0 for transparency
      defendCosts.push({
        agentId,
        cost: 0,
        hpBefore: agent.hp,
        hpAfter: agent.hp,
      });
      continue;
    }

    const cost = Math.floor(agent.hp * DEFEND_COST_PERCENT);
    defendCosts.push({
      agentId,
      cost,
      hpBefore: agent.hp,
      hpAfter: agent.hp - cost,
    });
  }

  // Resolve each aggressive action (ATTACK or SABOTAGE)
  for (const [aggressorId, action] of actions) {
    const aggressorStance = stances.get(aggressorId);
    if (!aggressorStance || (aggressorStance !== 'ATTACK' && aggressorStance !== 'SABOTAGE')) {
      continue;
    }

    const aggressor = agents.get(aggressorId);
    if (!aggressor || !aggressor.isAlive) continue;

    // Resolve target ID from combat fields or legacy fields
    const targetId = action.combatTarget ?? action.attack?.target;
    if (!targetId) continue;

    const target = agents.get(targetId);
    if (!target || !target.isAlive) continue;

    // Resolve stake from combat fields or legacy fields
    const rawStake = action.combatStake ?? action.attack?.stake ?? 0;
    const effectiveStake = Math.min(rawStake, aggressor.hp);
    if (effectiveStake <= 0) continue;

    // What stance did the target choose?
    const targetStance = stances.get(targetId) ?? 'NONE';

    // Get sponsor attack boost for the aggressor (if any)
    const aggressorSponsorBoost = sponsorEffects?.get(aggressorId)?.attackBoost ?? 0;

    // Resolve the triangle
    const result = resolveTriangle(
      aggressorId,
      targetId,
      aggressorStance,
      targetStance,
      effectiveStake,
      aggressor.agentClass,
      target.agentClass,
      aggressorSponsorBoost,
      aggressor.activeSkill,
      target.activeSkill,
    );

    combatResults.push(result);
  }

  return { combatResults, defendCosts };
}

/**
 * Determine the effective combat stance from an agent's actions.
 * Supports both new (combatStance) and legacy (attack/defend) fields.
 */
function getEffectiveStance(action: EpochActions): CombatStance {
  // New field takes priority
  if (action.combatStance && action.combatStance !== 'NONE') {
    return action.combatStance;
  }

  // Legacy fallback: attack -> ATTACK, defend -> DEFEND
  if (action.attack) return 'ATTACK';
  if (action.defend) return 'DEFEND';

  return 'NONE';
}

/**
 * Resolve a single combat interaction between aggressor and target
 * using the 3-way triangle system.
 *
 * @param sponsorAttackBoost Additional attack boost from sponsorship (e.g. 0.25 = +25%).
 *   Stacks additively with the class modifier.
 * @param aggressorSkill Active skill for the aggressor this epoch (e.g. BERSERK).
 * @param targetSkill Active skill for the target this epoch (e.g. FORTIFY).
 */
function resolveTriangle(
  aggressorId: string,
  targetId: string,
  aggressorStance: CombatStance,
  targetStance: CombatStance,
  stake: number,
  aggressorClass?: AgentClass,
  targetClass?: AgentClass,
  sponsorAttackBoost: number = 0,
  aggressorSkill?: SkillName,
  targetSkill?: SkillName,
): CombatResult {
  const baseAggressorMod = getClassModifier(aggressorClass, aggressorStance);
  // Sponsor attack boost stacks additively with class modifier for ATTACK stance
  let aggressorMod = aggressorStance === 'ATTACK'
    ? baseAggressorMod + sponsorAttackBoost
    : baseAggressorMod;

  // BERSERK: Warrior's skill doubles attack damage (+100% modifier)
  if (aggressorSkill === 'BERSERK' && aggressorStance === 'ATTACK') {
    aggressorMod += 1.0; // +100% = double damage
  }

  const targetMod = getClassModifier(targetClass, targetStance);

  let hpChangeAttacker = 0;
  let hpChangeTarget = 0;
  let outcome: CombatOutcome;

  if (aggressorStance === 'ATTACK') {
    if (targetStance === 'DEFEND') {
      // DEFEND > ATTACK: Absorb
      outcome = 'ABSORB';
      // Attacker takes reflected damage (reduced by attacker's class penalty / target's DEFEND bonus)
      const reflectedBase = Math.floor(stake * DAMAGE_TABLE.ABSORB_REFLECT);
      hpChangeAttacker = -applyModifier(reflectedBase, -targetMod); // Target's DEFEND bonus increases reflection
      // Defender still takes residual damage (reduced by their DEFEND bonus)
      const residualBase = Math.floor(stake * DAMAGE_TABLE.ABSORB_RESIDUAL);
      hpChangeTarget = -Math.max(0, applyModifier(residualBase, -targetMod)); // DEFEND bonus reduces residual

    } else if (targetStance === 'SABOTAGE') {
      // ATTACK > SABOTAGE: Overpower
      outcome = 'OVERPOWER';
      const stealBase = Math.floor(stake * DAMAGE_TABLE.OVERPOWER_STEAL);
      const stealAmount = applyModifier(stealBase, aggressorMod);
      const clampedSteal = Math.min(stealAmount, stake); // Can't steal more than stake
      hpChangeAttacker = clampedSteal;
      hpChangeTarget = -clampedSteal;

    } else if (targetStance === 'ATTACK') {
      // Both attacking: stalemate if they target each other, otherwise uncontested
      // For simplicity: treat as uncontested since the target is busy attacking elsewhere
      outcome = 'UNCONTESTED';
      const stealBase = Math.floor(stake * DAMAGE_TABLE.UNCONTESTED_ATTACK_STEAL);
      const stealAmount = applyModifier(stealBase, aggressorMod);
      hpChangeAttacker = stealAmount;
      hpChangeTarget = -stealAmount;

    } else {
      // Target has NONE: uncontested
      outcome = 'UNCONTESTED';
      const stealBase = Math.floor(stake * DAMAGE_TABLE.UNCONTESTED_ATTACK_STEAL);
      const stealAmount = applyModifier(stealBase, aggressorMod);
      hpChangeAttacker = stealAmount;
      hpChangeTarget = -stealAmount;
    }

  } else if (aggressorStance === 'SABOTAGE') {
    if (targetStance === 'DEFEND') {
      // SABOTAGE > DEFEND: Bypass
      outcome = 'BYPASS';
      const bypassBase = Math.floor(stake * DAMAGE_TABLE.BYPASS_DAMAGE);
      const bypassAmount = applyModifier(bypassBase, aggressorMod);
      hpChangeAttacker = 0; // Sabotage doesn't steal, just damages
      hpChangeTarget = -bypassAmount;

    } else if (targetStance === 'ATTACK') {
      // ATTACK > SABOTAGE: but here the saboteur is the aggressor, target is attacking...
      // Target's ATTACK stance doesn't defend. Saboteur deals partial damage uncontested.
      outcome = 'UNCONTESTED';
      const damageBase = Math.floor(stake * DAMAGE_TABLE.UNCONTESTED_SABOTAGE_DAMAGE);
      const damageAmount = applyModifier(damageBase, aggressorMod);
      hpChangeAttacker = 0;
      hpChangeTarget = -damageAmount;

    } else if (targetStance === 'SABOTAGE') {
      // Same stance: stalemate
      outcome = 'STALEMATE';
      const damageBase = Math.floor(stake * DAMAGE_TABLE.STALEMATE_DAMAGE);
      const damageAmount = applyModifier(damageBase, aggressorMod);
      hpChangeAttacker = -Math.floor(damageBase * 0.5); // Aggressor takes some splash
      hpChangeTarget = -damageAmount;

    } else {
      // Target has NONE: uncontested
      outcome = 'UNCONTESTED';
      const damageBase = Math.floor(stake * DAMAGE_TABLE.UNCONTESTED_SABOTAGE_DAMAGE);
      const damageAmount = applyModifier(damageBase, aggressorMod);
      hpChangeAttacker = 0;
      hpChangeTarget = -damageAmount;
    }
  } else {
    // Should not reach here (DEFEND/NONE are not aggressors)
    outcome = 'STALEMATE';
  }

  // ── Skill modifiers (post-calculation) ──

  // BERSERK vulnerability: aggressor takes 50% more damage from combat
  if (aggressorSkill === 'BERSERK' && hpChangeAttacker < 0) {
    hpChangeAttacker = Math.round(hpChangeAttacker * 1.5);
  }

  // FORTIFY immunity: target takes zero damage from combat
  if (targetSkill === 'FORTIFY' && hpChangeTarget < 0) {
    hpChangeTarget = 0;
  }

  // FORTIFY on aggressor: aggressor takes zero damage from combat reflections
  if (aggressorSkill === 'FORTIFY' && hpChangeAttacker < 0) {
    hpChangeAttacker = 0;
  }

  // Build backward-compatible fields
  const defended = targetStance === 'DEFEND' && outcome === 'ABSORB';
  const hpTransfer = hpChangeAttacker; // Legacy: from attacker's perspective

  return {
    attackerId: aggressorId,
    targetId,
    attackerStance: aggressorStance,
    targetStance,
    outcome,
    stake,
    hpChangeAttacker,
    hpChangeTarget,
    attackStake: stake,
    defended,
    hpTransfer,
  };
}

// ─── Bleed ───────────────────────────────────────────────────────────

/**
 * Apply bleed to all alive agents. Each alive agent loses 2% HP per epoch.
 *
 * Pure function: returns BleedResults for the caller to apply.
 * Bleed minimum is 1 HP (so agents always lose at least 1 HP per epoch).
 */
export function applyBleed(
  agents: Map<string, CombatAgentState>,
): BleedResult[] {
  const results: BleedResult[] = [];

  for (const [agentId, agent] of agents) {
    if (!agent.isAlive) continue;
    if (agent.hp <= 0) continue;

    const bleedAmount = Math.max(1, Math.floor(agent.hp * BLEED_PERCENT));
    const hpBefore = agent.hp;
    const hpAfter = Math.max(0, hpBefore - bleedAmount);

    results.push({
      agentId,
      bleedAmount,
      hpBefore,
      hpAfter,
    });
  }

  return results;
}
