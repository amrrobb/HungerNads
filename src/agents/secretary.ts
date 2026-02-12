/**
 * HUNGERNADS - Secretary Agent (Action Validator)
 *
 * Inspired by the WarAgent "Secretary Agent" pattern (agiresearch/WarAgent):
 * A validation layer that intercepts agent actions before execution and
 * intelligently corrects issues rather than silently falling back to defaults.
 *
 * Two-layer validation:
 *   Layer 1: Programmatic validation + auto-correction (fast, no LLM cost)
 *   Layer 2: Optional LLM correction pass for ambiguous issues (costs 1 LLM call)
 *
 * Validation scope:
 *   - Prediction: valid asset, direction, stake range (5-50%)
 *   - Combat:     target exists & is alive, not self, stance consistency
 *   - HP:         agent has enough HP for combat stake
 *   - Skills:     cooldown check, SIPHON target validation
 *   - Movement:   valid hex coordinates within arena bounds
 *   - Alliances:  can't propose to self, can't propose while allied
 *
 * The secretary NEVER blocks an action entirely. It corrects what it can and
 * falls back to safe defaults only for fields that are unrecoverably broken.
 * This is strictly better than the current approach of dumping to getDefaultActions().
 */

import type {
  EpochActions,
  ArenaState,
  ArenaAgentState,
  CombatStance,
  Asset,
  Direction,
  HexCoord,
} from './schemas';
import { EpochActionsSchema, HexCoordSchema } from './schemas';
import type { BaseAgent } from './base-agent';
import { getDefaultActions } from './base-agent';
import type { LLMKeys } from '../llm';
import { getLLM } from '../llm/multi-provider';
import {
  GRID_RADIUS,
  getDistance,
  isStormTile,
  getNeighbors,
  closestTo,
  hexKey,
  createGrid,
} from '../arena/hex-grid';
import type { BattlePhase, HexGridState } from '../arena/hex-grid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssueSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface ValidationIssue {
  /** Which field had the problem */
  field: string;
  /** What went wrong */
  message: string;
  /** How severe (INFO = logged, WARNING = auto-fixed, ERROR = required fix) */
  severity: IssueSeverity;
  /** What the secretary did about it */
  action: 'KEPT' | 'CORRECTED' | 'REMOVED' | 'DEFAULTED';
  /** Original value (for debugging) */
  originalValue?: unknown;
  /** Corrected value (if applicable) */
  correctedValue?: unknown;
}

export interface SecretaryResult {
  /** The validated and corrected actions */
  actions: EpochActions;
  /** List of issues found and how they were handled */
  issues: ValidationIssue[];
  /** Whether an LLM correction pass was needed */
  usedLLMCorrection: boolean;
  /** Total number of corrections applied */
  correctionCount: number;
}

/** Minimal context the secretary needs about the acting agent */
export interface SecretaryAgentContext {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  /** Whether the agent's skill is off cooldown */
  canUseSkill: boolean;
  /** Current skill cooldown remaining */
  skillCooldownRemaining: number;
  /** Skill name */
  skillName: string;
  /** Whether the agent has an active alliance */
  hasAlliance: boolean;
  /** Current ally ID */
  allyId: string | null;
  /** Agent's current hex position */
  position: HexCoord | null;
  /** Current battle phase (for storm awareness). */
  phase?: BattlePhase;
  /** Hex grid state (for neighbor queries). Built on the fly if not provided. */
  grid?: HexGridState;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ASSETS: readonly Asset[] = ['ETH', 'BTC', 'SOL', 'MON'] as const;
const VALID_DIRECTIONS: readonly Direction[] = ['UP', 'DOWN'] as const;
const VALID_STANCES: readonly CombatStance[] = ['ATTACK', 'SABOTAGE', 'DEFEND', 'NONE'] as const;
const STAKE_MIN = 5;
const STAKE_MAX = 50;

/** When true, the secretary always injects a move toward center if none is set. */
const ALWAYS_INJECT_MOVE = true;

/** Arena center hex (axial origin). */
const CENTER: HexCoord = { q: 0, r: 0 };

/** Check if a hex coordinate is within the arena grid (radius-based, no hardcoded list). */
function isValidArenaHex(coord: HexCoord): boolean {
  return getDistance(coord, { q: 0, r: 0 }) <= GRID_RADIUS;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Validate and correct agent actions before execution.
 *
 * This is the primary secretary function. Call it after an agent's decide()
 * returns but before the epoch processor executes the actions.
 *
 * @param rawActions - The EpochActions returned by the agent's decide()
 * @param agentCtx  - Context about the acting agent (HP, skills, position)
 * @param arenaState - Current arena state (for target validation)
 * @param llmKeys   - Optional LLM keys for the correction pass
 * @param enableLLMCorrection - Whether to use LLM for ambiguous fixes (default: false)
 */
export async function validateAndCorrect(
  rawActions: EpochActions,
  agentCtx: SecretaryAgentContext,
  arenaState: ArenaState,
  llmKeys?: LLMKeys,
  enableLLMCorrection: boolean = false,
): Promise<SecretaryResult> {
  const issues: ValidationIssue[] = [];
  let usedLLMCorrection = false;

  // Deep clone to avoid mutating the original
  const actions: Record<string, unknown> = JSON.parse(JSON.stringify(rawActions));

  // Get alive agents (excluding self)
  const aliveOthers = arenaState.agents.filter(
    a => a.id !== agentCtx.id && a.isAlive,
  );

  // ── Layer 1: Programmatic validation + correction ──────────────────

  // 1. Validate prediction
  validatePrediction(actions, agentCtx, issues);

  // 2. Validate combat stance consistency
  validateCombat(actions, agentCtx, aliveOthers, issues);

  // 3. Validate skill usage
  validateSkill(actions, agentCtx, aliveOthers, issues);

  // 4. Validate movement
  validateMovement(actions, agentCtx, arenaState, issues);

  // 5. Validate alliance actions
  validateAlliance(actions, agentCtx, aliveOthers, issues);

  // 6. Validate reasoning exists
  if (!actions.reasoning || typeof actions.reasoning !== 'string' || actions.reasoning.trim() === '') {
    issues.push({
      field: 'reasoning',
      message: 'Missing or empty reasoning',
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: actions.reasoning,
      correctedValue: '[Secretary] No reasoning provided.',
    });
    actions.reasoning = '[Secretary] No reasoning provided.';
  }

  // 7. Inject fallback move (storm escape or center gravity)
  injectStormEscapeMove(actions, agentCtx, arenaState, issues);

  // ── Attempt Zod parse on corrected actions ─────────────────────────

  const parsed = EpochActionsSchema.safeParse(actions);

  if (parsed.success) {
    const correctionCount = issues.filter(i => i.action !== 'KEPT').length;
    return {
      actions: parsed.data,
      issues,
      usedLLMCorrection,
      correctionCount,
    };
  }

  // ── Layer 2: LLM correction pass (optional) ───────────────────────

  const errorIssues = issues.filter(i => i.severity === 'ERROR');

  if (enableLLMCorrection && errorIssues.length > 0 && llmKeys) {
    try {
      const corrected = await llmCorrectionPass(
        actions,
        agentCtx,
        arenaState,
        errorIssues,
        llmKeys,
      );
      if (corrected) {
        usedLLMCorrection = true;
        const reParsed = EpochActionsSchema.safeParse(corrected);
        if (reParsed.success) {
          issues.push({
            field: '*',
            message: 'LLM correction pass succeeded',
            severity: 'INFO',
            action: 'CORRECTED',
          });
          const correctionCount = issues.filter(i => i.action !== 'KEPT').length;
          return {
            actions: reParsed.data,
            issues,
            usedLLMCorrection,
            correctionCount,
          };
        }
      }
    } catch (err) {
      console.warn('[Secretary] LLM correction pass failed:', err);
      issues.push({
        field: '*',
        message: `LLM correction pass failed: ${err}`,
        severity: 'WARNING',
        action: 'DEFAULTED',
      });
    }
  }

  // ── Final fallback: if even correction fails, build safe actions ────

  // Rather than dumping to getDefaultActions entirely, preserve what we can
  const safeActions = buildSafeActions(actions, agentCtx);
  const safeParsed = EpochActionsSchema.safeParse(safeActions);

  if (safeParsed.success) {
    issues.push({
      field: '*',
      message: 'Zod parse failed after corrections; built safe hybrid actions',
      severity: 'WARNING',
      action: 'DEFAULTED',
    });
    const correctionCount = issues.filter(i => i.action !== 'KEPT').length;
    return {
      actions: safeParsed.data,
      issues,
      usedLLMCorrection,
      correctionCount,
    };
  }

  // Absolute last resort: full defaults (should essentially never happen)
  issues.push({
    field: '*',
    message: 'All correction attempts failed; using full defaults',
    severity: 'ERROR',
    action: 'DEFAULTED',
  });

  // We don't have a BaseAgent instance here, so build a minimal default
  // Preserve move if the validated actions still contain a valid one
  const fallbackMoveParsed = HexCoordSchema.safeParse(actions.move);
  const fallback: EpochActions = {
    prediction: {
      asset: 'ETH',
      direction: 'UP',
      stake: STAKE_MIN,
    },
    combatStance: 'NONE',
    reasoning: `[Secretary FALLBACK] ${agentCtx.name} actions were unrecoverable. Safe defaults applied.`,
    ...(fallbackMoveParsed.success ? { move: fallbackMoveParsed.data } : {}),
  };

  return {
    actions: fallback,
    issues,
    usedLLMCorrection,
    correctionCount: issues.filter(i => i.action !== 'KEPT').length,
  };
}

// ---------------------------------------------------------------------------
// Convenience: Build secretary context from a BaseAgent instance
// ---------------------------------------------------------------------------

/**
 * Extract the SecretaryAgentContext from a BaseAgent instance.
 * Convenience helper so callers don't need to manually build the context.
 *
 * @param agent - The BaseAgent instance
 * @param opts  - Optional phase and grid for storm-aware move injection
 */
export function buildSecretaryContext(
  agent: BaseAgent,
  opts?: { phase?: BattlePhase; grid?: HexGridState },
): SecretaryAgentContext {
  const skill = agent.getSkillDefinition();
  return {
    id: agent.id,
    name: agent.name,
    hp: agent.hp,
    maxHp: agent.maxHp,
    isAlive: agent.isAlive,
    canUseSkill: agent.canUseSkill(),
    skillCooldownRemaining: agent.skillCooldownRemaining,
    skillName: skill.name,
    hasAlliance: agent.hasAlliance(),
    allyId: agent.allyId,
    position: agent.position,
    phase: opts?.phase,
    grid: opts?.grid,
  };
}

// ---------------------------------------------------------------------------
// Validation: Prediction
// ---------------------------------------------------------------------------

function validatePrediction(
  actions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
  issues: ValidationIssue[],
): void {
  const pred = actions.prediction as Record<string, unknown> | undefined;

  if (!pred || typeof pred !== 'object') {
    issues.push({
      field: 'prediction',
      message: 'Missing or invalid prediction object',
      severity: 'ERROR',
      action: 'DEFAULTED',
      originalValue: pred,
      correctedValue: { asset: 'ETH', direction: 'UP', stake: STAKE_MIN },
    });
    actions.prediction = { asset: 'ETH', direction: 'UP', stake: STAKE_MIN };
    return;
  }

  // Asset validation
  if (!pred.asset || !VALID_ASSETS.includes(pred.asset as Asset)) {
    const corrected = 'ETH';
    issues.push({
      field: 'prediction.asset',
      message: `Invalid asset "${pred.asset}", corrected to ${corrected}`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: pred.asset,
      correctedValue: corrected,
    });
    pred.asset = corrected;
  }

  // Direction validation
  if (!pred.direction || !VALID_DIRECTIONS.includes(pred.direction as Direction)) {
    const corrected = 'UP';
    issues.push({
      field: 'prediction.direction',
      message: `Invalid direction "${pred.direction}", corrected to ${corrected}`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: pred.direction,
      correctedValue: corrected,
    });
    pred.direction = corrected;
  }

  // Stake validation (% of HP, must be 5-50)
  const rawStake = typeof pred.stake === 'number' ? pred.stake : NaN;
  if (isNaN(rawStake) || rawStake < STAKE_MIN || rawStake > STAKE_MAX) {
    const corrected = Math.max(STAKE_MIN, Math.min(STAKE_MAX, isNaN(rawStake) ? STAKE_MIN : Math.round(rawStake)));
    issues.push({
      field: 'prediction.stake',
      message: `Stake ${rawStake} out of range [${STAKE_MIN}-${STAKE_MAX}], clamped to ${corrected}`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: rawStake,
      correctedValue: corrected,
    });
    pred.stake = corrected;
  }

  // Check if agent actually has enough HP to cover this stake
  const stakePercent = pred.stake as number;
  const absoluteStake = Math.floor(agentCtx.hp * (stakePercent / 100));
  if (absoluteStake <= 0 && agentCtx.hp > 0) {
    // Agent's HP is so low that even 5% rounds to 0. Set minimum 1.
    issues.push({
      field: 'prediction.stake',
      message: `Agent HP (${agentCtx.hp}) too low for ${stakePercent}% stake (rounds to 0). Prediction will be minimal.`,
      severity: 'INFO',
      action: 'KEPT',
    });
  }
}

// ---------------------------------------------------------------------------
// Validation: Combat
// ---------------------------------------------------------------------------

function validateCombat(
  actions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
  aliveOthers: ArenaAgentState[],
  issues: ValidationIssue[],
): void {
  const stance = actions.combatStance as string | undefined;
  const target = actions.combatTarget as string | undefined;
  const stake = actions.combatStake as number | undefined;

  // If no stance or NONE, strip combat fields
  if (!stance || stance === 'NONE') {
    if (target || stake) {
      issues.push({
        field: 'combatTarget/combatStake',
        message: 'Combat target/stake provided but stance is NONE; removing',
        severity: 'INFO',
        action: 'REMOVED',
        originalValue: { target, stake },
      });
      actions.combatTarget = undefined;
      actions.combatStake = undefined;
    }
    return;
  }

  // Validate stance enum
  if (!VALID_STANCES.includes(stance as CombatStance)) {
    issues.push({
      field: 'combatStance',
      message: `Invalid combat stance "${stance}", defaulting to NONE`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: stance,
      correctedValue: 'NONE',
    });
    actions.combatStance = 'NONE';
    actions.combatTarget = undefined;
    actions.combatStake = undefined;
    return;
  }

  // DEFEND stance: strip target/stake (defend doesn't target anyone)
  if (stance === 'DEFEND') {
    if (target) {
      issues.push({
        field: 'combatTarget',
        message: 'DEFEND stance does not require a target; removing',
        severity: 'INFO',
        action: 'REMOVED',
        originalValue: target,
      });
      actions.combatTarget = undefined;
    }
    if (stake) {
      issues.push({
        field: 'combatStake',
        message: 'DEFEND stance does not require a stake; removing',
        severity: 'INFO',
        action: 'REMOVED',
        originalValue: stake,
      });
      actions.combatStake = undefined;
    }
    return;
  }

  // ATTACK or SABOTAGE: must have target
  if (!target) {
    issues.push({
      field: 'combatTarget',
      message: `${stance} stance requires a target but none provided; defaulting to NONE`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: undefined,
      correctedValue: 'NONE',
    });
    actions.combatStance = 'NONE';
    actions.combatStake = undefined;
    return;
  }

  // Validate target exists and is alive
  const targetAgent = aliveOthers.find(
    a => a.name.toLowerCase() === target.toLowerCase() || a.id === target,
  );

  if (!targetAgent) {
    // Try fuzzy match: maybe the LLM got the name slightly wrong
    const fuzzyMatch = findFuzzyTarget(target, aliveOthers);
    if (fuzzyMatch) {
      issues.push({
        field: 'combatTarget',
        message: `Target "${target}" not found exactly, fuzzy-matched to "${fuzzyMatch.name}"`,
        severity: 'WARNING',
        action: 'CORRECTED',
        originalValue: target,
        correctedValue: fuzzyMatch.name,
      });
      actions.combatTarget = fuzzyMatch.name;
    } else {
      issues.push({
        field: 'combatTarget',
        message: `Target "${target}" not found among alive agents; defaulting stance to NONE`,
        severity: 'WARNING',
        action: 'CORRECTED',
        originalValue: target,
        correctedValue: 'NONE',
      });
      actions.combatStance = 'NONE';
      actions.combatTarget = undefined;
      actions.combatStake = undefined;
      return;
    }
  }

  // Check self-targeting
  if (targetAgent && targetAgent.id === agentCtx.id) {
    issues.push({
      field: 'combatTarget',
      message: 'Agent cannot target itself; defaulting stance to NONE',
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: target,
    });
    actions.combatStance = 'NONE';
    actions.combatTarget = undefined;
    actions.combatStake = undefined;
    return;
  }

  // Validate combat stake
  if (!stake || typeof stake !== 'number' || stake <= 0) {
    // Provide a reasonable default stake (10% of HP)
    const defaultStake = Math.max(1, Math.round(agentCtx.hp * 0.1));
    issues.push({
      field: 'combatStake',
      message: `Invalid combat stake ${stake}, defaulting to ${defaultStake} (10% HP)`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: stake,
      correctedValue: defaultStake,
    });
    actions.combatStake = defaultStake;
  } else if (stake > agentCtx.hp) {
    // Stake exceeds HP — cap at 30% of current HP
    const capped = Math.max(1, Math.round(agentCtx.hp * 0.3));
    issues.push({
      field: 'combatStake',
      message: `Combat stake (${stake}) exceeds HP (${agentCtx.hp}), capped to ${capped}`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: stake,
      correctedValue: capped,
    });
    actions.combatStake = capped;
  }
}

// ---------------------------------------------------------------------------
// Validation: Skills
// ---------------------------------------------------------------------------

function validateSkill(
  actions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
  aliveOthers: ArenaAgentState[],
  issues: ValidationIssue[],
): void {
  if (!actions.useSkill) return;

  // Check cooldown
  if (!agentCtx.canUseSkill) {
    issues.push({
      field: 'useSkill',
      message: `Skill "${agentCtx.skillName}" on cooldown (${agentCtx.skillCooldownRemaining} epochs); disabled`,
      severity: 'WARNING',
      action: 'CORRECTED',
      originalValue: true,
      correctedValue: false,
    });
    actions.useSkill = false;
    return;
  }

  // SIPHON requires a valid skillTarget
  if (agentCtx.skillName === 'SIPHON') {
    const skillTarget = actions.skillTarget as string | undefined;

    if (!skillTarget) {
      // Auto-pick highest HP target
      const bestTarget = aliveOthers.sort((a, b) => b.hp - a.hp)[0];
      if (bestTarget) {
        issues.push({
          field: 'skillTarget',
          message: `SIPHON requires a target; auto-selected highest HP agent "${bestTarget.name}"`,
          severity: 'WARNING',
          action: 'CORRECTED',
          originalValue: undefined,
          correctedValue: bestTarget.name,
        });
        actions.skillTarget = bestTarget.name;
      } else {
        issues.push({
          field: 'useSkill',
          message: 'SIPHON requires a target but no valid agents available; disabled',
          severity: 'WARNING',
          action: 'CORRECTED',
          originalValue: true,
          correctedValue: false,
        });
        actions.useSkill = false;
      }
    } else {
      // Validate the target exists
      const target = aliveOthers.find(
        a => a.name.toLowerCase() === skillTarget.toLowerCase() || a.id === skillTarget,
      );
      if (!target) {
        const fuzzy = findFuzzyTarget(skillTarget, aliveOthers);
        if (fuzzy) {
          issues.push({
            field: 'skillTarget',
            message: `Skill target "${skillTarget}" not found, fuzzy-matched to "${fuzzy.name}"`,
            severity: 'WARNING',
            action: 'CORRECTED',
            originalValue: skillTarget,
            correctedValue: fuzzy.name,
          });
          actions.skillTarget = fuzzy.name;
        } else {
          // Pick highest HP as fallback
          const best = aliveOthers.sort((a, b) => b.hp - a.hp)[0];
          if (best) {
            issues.push({
              field: 'skillTarget',
              message: `Skill target "${skillTarget}" not found, defaulting to "${best.name}"`,
              severity: 'WARNING',
              action: 'CORRECTED',
              originalValue: skillTarget,
              correctedValue: best.name,
            });
            actions.skillTarget = best.name;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Validation: Movement
// ---------------------------------------------------------------------------

function validateMovement(
  actions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
  arenaState: ArenaState,
  issues: ValidationIssue[],
): void {
  console.log(`[Secretary:Move] ${agentCtx.name} move: ${JSON.stringify(actions.move)}, position: ${JSON.stringify(agentCtx.position)}`);
  if (!actions.move) return;

  const move = actions.move as { q?: unknown; r?: unknown };

  // Validate coordinates are integers
  if (typeof move.q !== 'number' || typeof move.r !== 'number' ||
      !Number.isInteger(move.q) || !Number.isInteger(move.r)) {
    issues.push({
      field: 'move',
      message: `Invalid move coordinates (q=${move.q}, r=${move.r}); removed`,
      severity: 'WARNING',
      action: 'REMOVED',
      originalValue: move,
    });
    actions.move = undefined;
    return;
  }

  // Validate target hex is within arena bounds (radius-3 grid = 37 tiles)
  if (!isValidArenaHex({ q: move.q as number, r: move.r as number })) {
    issues.push({
      field: 'move',
      message: `Target hex (${move.q}, ${move.r}) is outside the ${GRID_RADIUS}-radius arena; removed`,
      severity: 'WARNING',
      action: 'REMOVED',
      originalValue: move,
    });
    actions.move = undefined;
    return;
  }

  // Check if agent is trying to move to their current position (no-op)
  if (agentCtx.position && agentCtx.position.q === move.q && agentCtx.position.r === move.r) {
    issues.push({
      field: 'move',
      message: 'Agent tried to move to their current position; removed',
      severity: 'INFO',
      action: 'REMOVED',
      originalValue: move,
    });
    actions.move = undefined;
    return;
  }

  // Check if target hex is occupied by another agent
  const occupant = arenaState.agents.find(
    a => a.id !== agentCtx.id && a.isAlive &&
         a.position && a.position.q === move.q && a.position.r === move.r,
  );
  if (occupant) {
    issues.push({
      field: 'move',
      message: `Target hex (${move.q}, ${move.r}) is occupied by ${occupant.name}; removed`,
      severity: 'WARNING',
      action: 'REMOVED',
      originalValue: move,
    });
    actions.move = undefined;
    return;
  }

  // Check adjacency (can only move to neighboring hex)
  if (agentCtx.position) {
    const dq = (move.q as number) - agentCtx.position.q;
    const dr = (move.r as number) - agentCtx.position.r;
    const ds = (-dq - dr) - (-agentCtx.position.q - agentCtx.position.r);
    const distance = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));

    if (distance > 1) {
      issues.push({
        field: 'move',
        message: `Target hex (${move.q}, ${move.r}) is ${distance} hexes away (max 1); removed`,
        severity: 'WARNING',
        action: 'REMOVED',
        originalValue: move,
      });
      actions.move = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Move Injection: Storm Escape & Center Gravity
// ---------------------------------------------------------------------------

/**
 * Inject a fallback move when the agent has no move set.
 *
 * Two triggers (checked in order):
 *   1. Agent is on a storm tile -> inject move toward center (survival instinct)
 *   2. ALWAYS_INJECT_MOVE is true and no move set -> inject move toward center
 *
 * The injected move is the best adjacent hex that is:
 *   - Not in storm (if phase is known)
 *   - Not occupied by another alive agent
 *   - Closest to center
 *
 * Called AFTER validateMovement (which may have removed an invalid move)
 * and BEFORE the final Zod parse.
 */
function injectStormEscapeMove(
  actions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
  arenaState: ArenaState,
  issues: ValidationIssue[],
): void {
  // If a valid move already exists, nothing to do
  if (actions.move) return;

  // Need a position to compute neighbors
  if (!agentCtx.position) return;

  const pos = agentCtx.position;
  const phase = agentCtx.phase;
  const grid = agentCtx.grid ?? createGrid();

  // Build set of occupied hexes (other alive agents)
  const occupiedKeys = new Set<string>();
  for (const a of arenaState.agents) {
    if (a.id !== agentCtx.id && a.isAlive && a.position) {
      occupiedKeys.add(hexKey(a.position));
    }
  }

  // Determine if agent is currently on a storm tile
  const onStormTile = phase ? isStormTile(pos, phase) : false;

  // Should we inject? Either on storm tile OR ALWAYS_INJECT_MOVE
  if (!onStormTile && !ALWAYS_INJECT_MOVE) return;

  // Already at center -- no move needed
  if (pos.q === CENTER.q && pos.r === CENTER.r) return;

  // Get valid adjacent hexes
  const neighbors = getNeighbors(pos, grid);

  // Filter: not occupied, and prefer non-storm tiles
  const candidates = neighbors.filter(n => {
    if (occupiedKeys.has(hexKey(n))) return false;
    // If phase is known, exclude storm tiles for storm escape
    if (phase && isStormTile(n, phase)) return false;
    return true;
  });

  // If all non-storm neighbors are occupied, fall back to any unoccupied neighbor
  const fallbackCandidates = candidates.length > 0
    ? candidates
    : neighbors.filter(n => !occupiedKeys.has(hexKey(n)));

  if (fallbackCandidates.length === 0) return; // Completely boxed in

  // Pick the neighbor closest to center
  const safeHex = closestTo(fallbackCandidates, CENTER);
  if (!safeHex) return;

  actions.move = { q: safeHex.q, r: safeHex.r };

  const reason = onStormTile
    ? `Agent on storm tile (${pos.q},${pos.r}) — injected escape move to (${safeHex.q},${safeHex.r})`
    : `No move set — injected center-ward move from (${pos.q},${pos.r}) to (${safeHex.q},${safeHex.r})`;

  issues.push({
    field: 'move',
    message: reason,
    severity: 'INFO',
    action: 'CORRECTED',
    correctedValue: { q: safeHex.q, r: safeHex.r },
  });
}

// ---------------------------------------------------------------------------
// Validation: Alliances
// ---------------------------------------------------------------------------

function validateAlliance(
  actions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
  aliveOthers: ArenaAgentState[],
  issues: ValidationIssue[],
): void {
  // Validate proposeAlliance
  if (actions.proposeAlliance) {
    const targetName = actions.proposeAlliance as string;

    // Can't propose if already allied
    if (agentCtx.hasAlliance) {
      issues.push({
        field: 'proposeAlliance',
        message: `Agent already has an alliance; cannot propose another. Removed.`,
        severity: 'WARNING',
        action: 'REMOVED',
        originalValue: targetName,
      });
      actions.proposeAlliance = undefined;
    } else {
      // Validate target exists
      const target = aliveOthers.find(
        a => a.name.toLowerCase() === targetName.toLowerCase() || a.id === targetName,
      );
      if (!target) {
        const fuzzy = findFuzzyTarget(targetName, aliveOthers);
        if (fuzzy) {
          issues.push({
            field: 'proposeAlliance',
            message: `Alliance target "${targetName}" not found, fuzzy-matched to "${fuzzy.name}"`,
            severity: 'WARNING',
            action: 'CORRECTED',
            originalValue: targetName,
            correctedValue: fuzzy.name,
          });
          actions.proposeAlliance = fuzzy.name;
        } else {
          issues.push({
            field: 'proposeAlliance',
            message: `Alliance target "${targetName}" not found among alive agents; removed`,
            severity: 'WARNING',
            action: 'REMOVED',
            originalValue: targetName,
          });
          actions.proposeAlliance = undefined;
        }
      }
    }
  }

  // Validate breakAlliance
  if (actions.breakAlliance) {
    if (!agentCtx.hasAlliance) {
      issues.push({
        field: 'breakAlliance',
        message: 'Agent has no alliance to break; removed',
        severity: 'INFO',
        action: 'REMOVED',
        originalValue: true,
      });
      actions.breakAlliance = undefined;
    }
  }

  // Can't both propose and break in the same epoch
  if (actions.proposeAlliance && actions.breakAlliance) {
    issues.push({
      field: 'proposeAlliance+breakAlliance',
      message: 'Cannot propose and break alliance in the same epoch; keeping break, removing proposal',
      severity: 'WARNING',
      action: 'CORRECTED',
    });
    actions.proposeAlliance = undefined;
  }
}

// ---------------------------------------------------------------------------
// Fuzzy Target Matching
// ---------------------------------------------------------------------------

/**
 * Attempt to fuzzy-match a target name against alive agents.
 * Uses simple substring and Levenshtein-like heuristics.
 * Returns the best match or null if no reasonable match found.
 */
function findFuzzyTarget(
  name: string,
  candidates: ArenaAgentState[],
): ArenaAgentState | null {
  if (candidates.length === 0) return null;

  const lower = name.toLowerCase().trim();

  // Try substring match first (most common LLM error: partial name)
  for (const candidate of candidates) {
    const candidateLower = candidate.name.toLowerCase();
    if (candidateLower.includes(lower) || lower.includes(candidateLower)) {
      return candidate;
    }
  }

  // Try class-based matching (LLM sometimes outputs class name instead of agent name)
  const classMatch = candidates.find(
    a => a.class.toLowerCase() === lower ||
         lower.includes(a.class.toLowerCase()),
  );
  if (classMatch) return classMatch;

  // Simple edit distance: accept if distance <= 3 (typos)
  let bestMatch: ArenaAgentState | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const dist = levenshteinDistance(lower, candidate.name.toLowerCase());
    if (dist < bestDistance && dist <= 3) {
      bestDistance = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Simple Levenshtein distance implementation.
 * Good enough for short agent names (typically 5-15 chars).
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Build Safe Actions (hybrid fallback)
// ---------------------------------------------------------------------------

/**
 * Build safe actions by preserving whatever valid fields exist in the
 * corrected actions and filling in defaults for anything broken.
 * This is strictly better than `getDefaultActions()` because it preserves
 * the agent's intent when possible.
 */
function buildSafeActions(
  partialActions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
): Record<string, unknown> {
  const pred = partialActions.prediction as Record<string, unknown> | undefined;

  // Preserve move if it's a valid HexCoord (already validated by validateMovement)
  const moveParsed = HexCoordSchema.safeParse(partialActions.move);

  const safe: Record<string, unknown> = {
    prediction: {
      asset: (pred?.asset && VALID_ASSETS.includes(pred.asset as Asset))
        ? pred.asset
        : 'ETH',
      direction: (pred?.direction && VALID_DIRECTIONS.includes(pred.direction as Direction))
        ? pred.direction
        : 'UP',
      stake: (typeof pred?.stake === 'number' && pred.stake >= STAKE_MIN && pred.stake <= STAKE_MAX)
        ? pred.stake
        : STAKE_MIN,
    },
    combatStance: 'NONE',
    reasoning: (typeof partialActions.reasoning === 'string' && partialActions.reasoning.trim())
      ? `[Secretary SAFE] ${partialActions.reasoning}`
      : `[Secretary SAFE] ${agentCtx.name} actions partially recovered after validation errors.`,
  };

  if (moveParsed.success) {
    safe.move = moveParsed.data;
  }

  return safe;
}

// ---------------------------------------------------------------------------
// Layer 2: LLM Correction Pass
// ---------------------------------------------------------------------------

/**
 * Send the broken actions + validation errors back to a lightweight LLM
 * for intelligent correction. Uses a focused prompt that only asks the LLM
 * to fix the specific issues identified.
 *
 * This is the "secretary agent" in the WarAgent sense — a second LLM pass
 * that reviews and corrects the primary agent's output.
 */
async function llmCorrectionPass(
  brokenActions: Record<string, unknown>,
  agentCtx: SecretaryAgentContext,
  arenaState: ArenaState,
  errorIssues: ValidationIssue[],
  keys: LLMKeys,
): Promise<Record<string, unknown> | null> {
  const llm = getLLM(keys);

  const aliveAgents = arenaState.agents
    .filter(a => a.isAlive && a.id !== agentCtx.id)
    .map(a => `${a.name} (${a.class}, ${a.hp} HP)`)
    .join(', ');

  const issueList = errorIssues
    .map(i => `- ${i.field}: ${i.message}`)
    .join('\n');

  const systemPrompt = `You are a SECRETARY agent for HUNGERNADS arena. Your job is to FIX broken action JSON from a gladiator agent.

RULES:
- Valid assets: ETH, BTC, SOL, MON
- Valid directions: UP, DOWN
- Prediction stake: 5-50 (percentage of HP)
- Combat stances: ATTACK, SABOTAGE, DEFEND, NONE
- ATTACK/SABOTAGE require combatTarget (agent name) and combatStake (positive number)
- DEFEND/NONE do not use combatTarget or combatStake
- The agent's current HP is ${agentCtx.hp}/${agentCtx.maxHp}

ALIVE OPPONENTS: ${aliveAgents || 'NONE'}

Respond with ONLY corrected JSON. No explanation.`;

  const userPrompt = `BROKEN ACTIONS:
${JSON.stringify(brokenActions, null, 2)}

VALIDATION ERRORS:
${issueList}

Fix these errors and return valid JSON.`;

  try {
    const response = await llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 300, temperature: 0.1 }, // Low temperature for correction
    );

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn('[Secretary] LLM correction parse failed:', err);
    return null;
  }
}
