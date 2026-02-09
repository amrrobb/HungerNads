/**
 * HUNGERNADS - Epoch Processor (Orchestrator)
 *
 * THE core game loop. Processes a single epoch by wiring together all engine
 * components in the correct order:
 *
 *   1. Fetch market data (PriceFeed)
 *   2. Collect agent decisions in parallel (BaseAgent.decide)
 *   2.5. Apply sponsor HP boosts (from tiered sponsorships)
 *   3. Resolve predictions (prediction.ts)
 *   4. Resolve combat (combat.ts) — with sponsor freeDefend + attackBoost
 *   5. Apply 2% bleed (combat.ts applyBleed)
 *   6. Check deaths (death.ts)
 *   7. Check win condition (ArenaManager)
 *   8. Generate epoch summary
 *   9. Return EpochResult for broadcasting
 *
 * All HP changes are applied in order: sponsor -> prediction -> combat -> bleed -> death.
 */

import type { BaseAgent } from '../agents/base-agent';
import { getDefaultActions } from '../agents/base-agent';
import type {
  EpochActions,
  HexCoord,
  MarketData,
  ArenaState,
  SkillActivation,
} from '../agents/schemas';
import { ArenaManager } from './arena';
import { PriceFeed } from './price-feed';
import {
  resolvePredictions,
  type PredictionInput,
  type PredictionResult,
} from './prediction';
import {
  resolveCombat,
  applyBleed,
  type CombatResult,
  type CombatAgentState,
  type BleedResult,
  type DefendCostResult,
} from './combat';
import {
  checkDeaths,
  type DeathEvent,
  type GenerateFinalWords,
} from './death';
import {
  validateMove,
  executeMove,
  type MoveResult,
} from './grid';
import type { SponsorEffect } from '../betting/sponsorship';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of applying a sponsor HP boost to an agent. */
export interface SponsorBoostResult {
  agentId: string;
  tier: string;
  hpBoost: number;
  /** Actual HP gained (may be less than hpBoost if near max HP). */
  actualBoost: number;
  hpBefore: number;
  hpAfter: number;
  /** Whether this sponsor grants free defend. */
  freeDefend: boolean;
  /** Whether this sponsor grants an attack boost. */
  attackBoost: number;
  sponsorshipId: string;
  message: string;
}

export interface EpochResult {
  epochNumber: number;
  marketData: MarketData;
  actions: Map<string, EpochActions>;
  moveResults: MoveResult[];
  /** Sponsor HP boosts applied this epoch (before predictions). */
  sponsorBoosts: SponsorBoostResult[];
  /** Skill activations this epoch (BERSERK, INSIDER_INFO, FORTIFY, SIPHON, ALL_IN). */
  skillActivations: SkillActivation[];
  predictionResults: PredictionResult[];
  combatResults: CombatResult[];
  defendCosts: DefendCostResult[];
  bleedResults: BleedResult[];
  deaths: DeathEvent[];
  agentStates: {
    id: string;
    name: string;
    class: string;
    hp: number;
    isAlive: boolean;
    thoughts: string[];
    position?: HexCoord;
  }[];
  battleComplete: boolean;
  winner?: { id: string; name: string; class: string };
}

// ─── Default final words generator (no LLM needed) ─────────────────────────

const DEFAULT_FINAL_WORDS: GenerateFinalWords = async (agent, cause) => {
  const lines: Record<string, string[]> = {
    prediction: [
      'The market... it betrayed me...',
      'I should have gone the other way...',
      'My charts... were wrong...',
    ],
    combat: [
      'You fight without honor...',
      'I will be avenged...',
      'Tell them... I died fighting...',
    ],
    bleed: [
      'Time... is the cruelest enemy...',
      'The arena drains us all...',
      'Slowly... but surely...',
    ],
    multi: [
      'Everything hit at once...',
      'Death by a thousand cuts...',
      'They all came for me...',
    ],
  };

  const pool = lines[cause] ?? lines.multi;
  return pool[Math.floor(Math.random() * pool.length)];
};

// ─── Core Function ──────────────────────────────────────────────────────────

/**
 * Process a single epoch end-to-end.
 *
 * Takes an ArenaManager (for agent state and lifecycle), a PriceFeed (for
 * market data), and optionally previous market data (for prediction resolution).
 *
 * Returns an EpochResult with the full breakdown for broadcasting.
 *
 * @param arena - The ArenaManager with active battle state
 * @param priceFeed - PriceFeed instance for fetching current prices
 * @param previousMarketData - Market data from the previous epoch (needed for
 *   prediction resolution). If omitted (first epoch), predictions resolve as
 *   flat (no gain/loss).
 * @param generateFinalWords - Optional LLM callback for dramatic death speeches.
 *   Falls back to canned lines if not provided.
 * @param sponsorEffects - Optional sponsor effects for this epoch (from SponsorshipManager).
 *   If provided, HP boosts are applied before predictions, and combat modifiers
 *   (freeDefend, attackBoost) are passed to the combat resolver.
 */
export async function processEpoch(
  arena: ArenaManager,
  priceFeed: PriceFeed,
  previousMarketData?: MarketData,
  generateFinalWords?: GenerateFinalWords,
  sponsorEffects?: Map<string, SponsorEffect>,
): Promise<EpochResult> {
  const finalWordsCallback = generateFinalWords ?? DEFAULT_FINAL_WORDS;

  // ── Step 0: Increment epoch ───────────────────────────────────────────
  arena.incrementEpoch();
  const epochNumber = arena.epochCount;

  // ── Step 1: Fetch market data ─────────────────────────────────────────
  const marketData = await priceFeed.fetchPrices();

  // Build previous market data fallback for the first epoch:
  // If no previous data, use current data so all changes = 0 (flat, no gain/loss).
  const prevMarket: MarketData = previousMarketData ?? {
    prices: { ...marketData.prices },
    changes: { ETH: 0, BTC: 0, SOL: 0, MON: 0 },
    timestamp: marketData.timestamp,
  };

  // ── Step 2: Collect agent decisions in parallel ───────────────────────
  const activeAgents = arena.getActiveAgents();

  const arenaState: ArenaState = {
    battleId: arena.battleId,
    epoch: epochNumber,
    agents: arena.getAllAgents().map(a => a.getState()),
    marketData,
  };

  const actions = await collectDecisions(activeAgents, arenaState);

  // ── Step 2b: Record reasoning as agent thoughts (for spectator feed) ──
  for (const agent of activeAgents) {
    const agentActions = actions.get(agent.id);
    if (agentActions?.reasoning) {
      agent.addThought(agentActions.reasoning);
    }
  }

  // ── Step 2c: Process movement actions ───────────────────────────────
  const moveResults = processMovements(actions, arena);

  // ── Step 2.5: Apply sponsor HP boosts ─────────────────────────────────
  const sponsorBoosts = applySponsorBoosts(arena, sponsorEffects);

  // ── Step 2.6: Activate skills ────────────────────────────────────────
  const skillActivations = activateSkills(actions, arena);

  // ── Step 3: Resolve predictions ───────────────────────────────────────
  const predictionInputs = buildPredictionInputs(actions, arena);
  const predictionResults = resolvePredictions(
    predictionInputs,
    marketData,
    prevMarket,
  );

  // Apply prediction HP changes to agents (with skill modifiers)
  for (const result of predictionResults) {
    const agent = arena.getAgent(result.agentId);
    if (!agent || !agent.alive()) continue;

    let hpChange = result.hpChange;

    // INSIDER_INFO: Trader's prediction always succeeds (force positive)
    if (agent.skillActiveThisEpoch && agent.getSkillDefinition().name === 'INSIDER_INFO') {
      hpChange = Math.abs(result.hpChange); // Force positive (gain even if wrong)
      // Mutate the result for broadcasting accuracy
      (result as { hpChange: number }).hpChange = hpChange;
    }

    // ALL_IN: Gambler's stake is doubled (both gain and loss)
    if (agent.skillActiveThisEpoch && agent.getSkillDefinition().name === 'ALL_IN') {
      hpChange = hpChange * 2;
      (result as { hpChange: number }).hpChange = hpChange;
    }

    // FORTIFY: Survivor takes no prediction losses (but still gains)
    if (agent.skillActiveThisEpoch && agent.getSkillDefinition().name === 'FORTIFY' && hpChange < 0) {
      hpChange = 0;
      (result as { hpChange: number }).hpChange = 0;
    }

    if (hpChange > 0) {
      agent.heal(hpChange);
    } else if (hpChange < 0) {
      agent.takeDamage(Math.abs(hpChange));
    }
  }

  // ── Step 4: Resolve combat ────────────────────────────────────────────
  // Resolve attack targets: actions use agent names, combat needs agent IDs
  const resolvedActions = resolveAttackTargets(actions, arena);

  // Build combat agent state map from current (post-prediction) HP
  // Includes active skills for BERSERK/FORTIFY modifiers in combat resolution
  const combatAgentStates = buildCombatAgentStates(arena);

  // Pass sponsor effects to combat resolver for freeDefend + attackBoost
  const { combatResults, defendCosts } = resolveCombat(
    resolvedActions,
    combatAgentStates,
    sponsorEffects,
  );

  // Apply defend costs (FORTIFY agents skip defend cost)
  for (const dc of defendCosts) {
    const agent = arena.getAgent(dc.agentId);
    if (agent && agent.alive()) {
      if (agent.skillActiveThisEpoch && agent.getSkillDefinition().name === 'FORTIFY') {
        // FORTIFY: immune to defend cost too
        continue;
      }
      agent.takeDamage(dc.cost);
    }
  }

  // Apply combat HP changes (triangle system)
  for (const cr of combatResults) {
    const attacker = arena.getAgent(cr.attackerId);
    const target = arena.getAgent(cr.targetId);

    // Apply attacker HP change
    if (attacker && attacker.alive()) {
      if (cr.hpChangeAttacker > 0) {
        attacker.heal(cr.hpChangeAttacker);
      } else if (cr.hpChangeAttacker < 0) {
        attacker.takeDamage(Math.abs(cr.hpChangeAttacker));
      }
    }

    // Apply target HP change
    if (target && target.alive()) {
      if (cr.hpChangeTarget > 0) {
        target.heal(cr.hpChangeTarget);
      } else if (cr.hpChangeTarget < 0) {
        target.takeDamage(Math.abs(cr.hpChangeTarget));
      }
    }
  }

  // ── Step 4.5: Process SIPHON skill ─────────────────────────────────────
  processSiphonSkills(skillActivations, arena);

  // ── Step 5: Apply bleed ───────────────────────────────────────────────
  const bleedAgentStates = buildCombatAgentStates(arena);
  const bleedResults = applyBleed(bleedAgentStates);

  for (const br of bleedResults) {
    const agent = arena.getAgent(br.agentId);
    if (agent && agent.alive()) {
      // FORTIFY: immune to bleed
      if (agent.skillActiveThisEpoch && agent.getSkillDefinition().name === 'FORTIFY') {
        continue;
      }
      agent.takeDamage(br.bleedAmount);
    }
  }

  // ── Step 6: Check deaths ──────────────────────────────────────────────
  // Build the agent states array that death.ts expects (AgentState = ArenaAgentState)
  const agentStatesForDeath = arena.getAllAgents().map(a => a.getState());

  // death.ts PredictionResult is a subset of prediction.ts PredictionResult — compatible
  const deaths = await checkDeaths(
    agentStatesForDeath,
    combatResults,
    predictionResults,
    epochNumber,
    finalWordsCallback,
  );

  // Eliminate dead agents on the arena and track kills
  for (const death of deaths) {
    arena.eliminateAgent(death.agentId);

    // Credit kill to the killer if there was one
    if (death.killerId) {
      const killer = arena.getAgent(death.killerId);
      if (killer) {
        killer.kills += 1;
      }
    }
  }

  // ── Step 7: Increment epochsSurvived for living agents ────────────────
  for (const agent of arena.getActiveAgents()) {
    agent.epochsSurvived += 1;
  }

  // ── Step 8: Check win condition ───────────────────────────────────────
  const battleComplete = arena.isComplete();
  let winner: { id: string; name: string; class: string } | undefined;

  if (battleComplete) {
    const winnerAgent = arena.getWinner();
    if (winnerAgent) {
      winner = {
        id: winnerAgent.id,
        name: winnerAgent.name,
        class: winnerAgent.agentClass,
      };
    }
  }

  // ── Step 8.5: Tick skill cooldowns and reset active flags ────────────
  for (const agent of arena.getAllAgents()) {
    agent.tickSkillCooldown();
    agent.resetSkillActive();
  }

  // ── Step 9: Build final agent states snapshot ─────────────────────────
  const agentStates = arena.getAllAgents().map(a => ({
    id: a.id,
    name: a.name,
    class: a.agentClass,
    hp: a.hp,
    isAlive: a.alive(),
    thoughts: [...a.thoughts],
    position: a.position ?? undefined,
  }));

  return {
    epochNumber,
    marketData,
    actions,
    moveResults,
    sponsorBoosts,
    skillActivations,
    predictionResults,
    combatResults,
    defendCosts,
    bleedResults,
    deaths,
    agentStates,
    battleComplete,
    winner,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Apply sponsor HP boosts to agents before predictions and combat.
 *
 * Iterates through sponsor effects for this epoch and heals each agent
 * by the tier's hpBoost amount (capped at maxHp). Returns an array of
 * SponsorBoostResult for broadcasting to spectators.
 *
 * Only HP boosts are applied here. Combat modifiers (freeDefend, attackBoost)
 * are handled by the combat resolver via the sponsorEffects map.
 */
function applySponsorBoosts(
  arena: ArenaManager,
  sponsorEffects?: Map<string, SponsorEffect>,
): SponsorBoostResult[] {
  const results: SponsorBoostResult[] = [];
  if (!sponsorEffects || sponsorEffects.size === 0) return results;

  for (const [agentId, effect] of sponsorEffects) {
    const agent = arena.getAgent(agentId);
    if (!agent || !agent.alive()) continue;
    if (effect.hpBoost <= 0) continue;

    const hpBefore = agent.hp;
    agent.heal(effect.hpBoost); // heal() is capped at maxHp internally
    const hpAfter = agent.hp;
    const actualBoost = hpAfter - hpBefore;

    results.push({
      agentId,
      tier: effect.tier,
      hpBoost: effect.hpBoost,
      actualBoost,
      hpBefore,
      hpAfter,
      freeDefend: effect.freeDefend,
      attackBoost: effect.attackBoost,
      sponsorshipId: effect.sponsorshipId,
      message: effect.message,
    });
  }

  return results;
}

/**
 * Collect decisions from all active agents in parallel.
 * If an agent's decide() throws, fall back to safe default actions.
 */
async function collectDecisions(
  agents: BaseAgent[],
  arenaState: ArenaState,
): Promise<Map<string, EpochActions>> {
  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      try {
        const actions = await agent.decide(arenaState);
        return { agentId: agent.id, actions };
      } catch (err) {
        console.error(
          `[Epoch] Agent ${agent.name} (${agent.id}) decide() failed:`,
          err,
        );
        return { agentId: agent.id, actions: getDefaultActions(agent) };
      }
    }),
  );

  const actionsMap = new Map<string, EpochActions>();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      actionsMap.set(result.value.agentId, result.value.actions);
    }
    // 'rejected' should never happen since we catch inside the async fn,
    // but handle defensively
  }

  return actionsMap;
}

/**
 * Convert agent EpochActions predictions into PredictionInput map.
 *
 * The key conversion: EpochActions.prediction.stake is a PERCENTAGE (5-50),
 * but PredictionInput.stake is ABSOLUTE HP. So we compute:
 *   absoluteStake = floor(agent.hp * (stake / 100))
 */
function buildPredictionInputs(
  actions: Map<string, EpochActions>,
  arena: ArenaManager,
): Map<string, PredictionInput> {
  const inputs = new Map<string, PredictionInput>();

  for (const [agentId, action] of actions) {
    const agent = arena.getAgent(agentId);
    if (!agent || !agent.alive()) continue;

    const { asset, direction, stake: stakePercent } = action.prediction;

    // Clamp stake to valid range (5-50%) and convert to absolute HP
    const clampedPercent = Math.max(5, Math.min(50, stakePercent));
    const absoluteStake = Math.floor(agent.hp * (clampedPercent / 100));

    if (absoluteStake <= 0) continue; // Agent has too little HP to stake

    inputs.set(agentId, {
      asset,
      direction,
      stake: absoluteStake,
    });
  }

  return inputs;
}

/**
 * Resolve combat targets from agent names to agent IDs.
 *
 * Handles both new combatTarget field and legacy attack.target field.
 * LLM outputs typically use agent NAMES; combat resolution needs IDs.
 *
 * If a target name cannot be resolved, the combat action is dropped.
 */
function resolveAttackTargets(
  actions: Map<string, EpochActions>,
  arena: ArenaManager,
): Map<string, EpochActions> {
  const resolved = new Map<string, EpochActions>();

  for (const [agentId, action] of actions) {
    // Determine if this action has a target to resolve
    const targetName = action.combatTarget ?? action.attack?.target;

    if (!targetName) {
      // No combat target — pass through as-is
      resolved.set(agentId, action);
      continue;
    }

    // Try to resolve by name first, then by ID as fallback
    const targetAgent =
      arena.getAgentByName(targetName) ?? arena.getAgent(targetName);

    if (!targetAgent || !targetAgent.alive() || targetAgent.id === agentId) {
      // Invalid target: drop combat action, keep everything else
      resolved.set(agentId, {
        ...action,
        combatStance: 'NONE',
        combatTarget: undefined,
        combatStake: undefined,
        attack: undefined,
      });
      continue;
    }

    // Replace name with ID for combat resolution
    resolved.set(agentId, {
      ...action,
      combatTarget: targetAgent.id,
      // Also update legacy field for backward compat
      attack: action.attack
        ? { target: targetAgent.id, stake: action.attack.stake }
        : undefined,
    });
  }

  return resolved;
}

/**
 * Process movement actions for all agents.
 *
 * Movement happens BEFORE predictions and combat, so agents can reposition
 * before fighting. Moves are validated for adjacency and occupancy.
 *
 * Dead agents and agents without a move action are skipped.
 * If two agents try to move to the same hex, only the first processed succeeds.
 */
function processMovements(
  actions: Map<string, EpochActions>,
  arena: ArenaManager,
): MoveResult[] {
  const results: MoveResult[] = [];
  const positions = arena.getAgentPositions();

  // If no positions assigned (backward compat), skip movement entirely
  if (positions.size === 0) return results;

  for (const [agentId, action] of actions) {
    if (!action.move) continue;

    const agent = arena.getAgent(agentId);
    if (!agent || !agent.alive()) continue;

    const result = executeMove(agentId, action.move, positions);
    results.push(result);

    // Update the agent's position on the actual agent object
    if (result.success) {
      agent.position = { q: action.move.q, r: action.move.r };
    }
  }

  return results;
}

/**
 * Build the CombatAgentState map from current arena state.
 * combat.ts needs a Map<string, { hp, isAlive, agentClass, activeSkill }>.
 */
function buildCombatAgentStates(
  arena: ArenaManager,
): Map<string, CombatAgentState> {
  const states = new Map<string, CombatAgentState>();
  for (const agent of arena.getAllAgents()) {
    states.set(agent.id, {
      hp: agent.hp,
      isAlive: agent.alive(),
      agentClass: agent.agentClass,
      activeSkill: agent.skillActiveThisEpoch ? agent.getSkillDefinition().name : undefined,
    });
  }
  return states;
}

// ─── Skill System Helpers ─────────────────────────────────────────────────

/**
 * Validate and activate skills from agent decisions.
 *
 * For each agent that requested useSkill=true, checks cooldown availability
 * and activates the skill. Returns an array of SkillActivation events for
 * broadcasting to spectators.
 *
 * Targeted skills (SIPHON) have their target resolved from name to ID.
 */
function activateSkills(
  actions: Map<string, EpochActions>,
  arena: ArenaManager,
): SkillActivation[] {
  const activations: SkillActivation[] = [];

  for (const [agentId, action] of actions) {
    if (!action.useSkill) continue;

    const agent = arena.getAgent(agentId);
    if (!agent || !agent.alive()) continue;

    // Attempt activation (checks cooldown internally)
    const activated = agent.activateSkill();
    if (!activated) {
      console.warn(
        `[Skill] ${agent.name} tried to use ${agent.getSkillDefinition().name} but it's on cooldown (${agent.skillCooldownRemaining} epochs)`,
      );
      continue;
    }

    const skill = agent.getSkillDefinition();

    // Resolve target for SIPHON
    let targetId: string | undefined;
    let targetName: string | undefined;
    if (skill.name === 'SIPHON' && action.skillTarget) {
      const targetAgent =
        arena.getAgentByName(action.skillTarget) ?? arena.getAgent(action.skillTarget);
      if (targetAgent && targetAgent.alive() && targetAgent.id !== agentId) {
        targetId = targetAgent.id;
        targetName = targetAgent.name;
      } else {
        // Invalid target — pick the highest HP agent as fallback
        const fallback = arena.getActiveAgents()
          .filter(a => a.id !== agentId)
          .sort((a, b) => b.hp - a.hp)[0];
        if (fallback) {
          targetId = fallback.id;
          targetName = fallback.name;
        }
      }
    }

    // Build activation event
    const effectDescription = buildSkillEffectDescription(skill.name, agent.name, targetName);
    activations.push({
      agentId: agent.id,
      agentName: agent.name,
      skillName: skill.name,
      targetId,
      targetName,
      effectDescription,
    });

    // Log for debugging
    console.log(`[Skill] ${agent.name} activated ${skill.name}!${targetName ? ` Target: ${targetName}` : ''}`);
  }

  return activations;
}

/**
 * Build a human-readable description of a skill effect for spectator feeds.
 */
function buildSkillEffectDescription(
  skillName: string,
  agentName: string,
  targetName?: string,
): string {
  switch (skillName) {
    case 'BERSERK':
      return `${agentName} goes BERSERK! Double ATTACK damage but takes 50% more damage this epoch!`;
    case 'INSIDER_INFO':
      return `${agentName} uses INSIDER INFO! Prediction automatically succeeds this epoch!`;
    case 'FORTIFY':
      return `${agentName} FORTIFIES! Immune to ALL damage this epoch!`;
    case 'SIPHON':
      return `${agentName} uses SIPHON on ${targetName ?? 'unknown'}! Stealing 10% of their HP!`;
    case 'ALL_IN':
      return `${agentName} goes ALL IN! Prediction stake DOUBLED - double or nothing!`;
    default:
      return `${agentName} activated ${skillName}!`;
  }
}

/**
 * Process SIPHON skill activations.
 *
 * SIPHON steals 10% of the target's current HP and adds it to the Parasite.
 * Processed after combat resolution so it stacks with other damage.
 */
function processSiphonSkills(
  skillActivations: SkillActivation[],
  arena: ArenaManager,
): void {
  for (const activation of skillActivations) {
    if (activation.skillName !== 'SIPHON') continue;
    if (!activation.targetId) continue;

    const agent = arena.getAgent(activation.agentId);
    const target = arena.getAgent(activation.targetId);
    if (!agent || !agent.alive() || !target || !target.alive()) continue;

    // Steal 10% of target's current HP
    const siphonAmount = Math.max(1, Math.floor(target.hp * 0.10));
    const actualDamage = target.takeDamage(siphonAmount);
    agent.heal(actualDamage);

    console.log(
      `[Skill] SIPHON: ${agent.name} stole ${actualDamage} HP from ${target.name} (${target.hp} HP remaining)`,
    );
  }
}
