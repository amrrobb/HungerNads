/**
 * HUNGERNADS - Base Agent Class
 *
 * Abstract agent class that all agent types extend.
 * Handles common logic: HP, decision-making interface, learning hooks, profiles.
 */

import type {
  AgentClass,
  EpochActions,
  HexCoord,
  Lesson,
  AgentProfile,
  ArenaState,
  ArenaAgentState,
  MatchupRecord,
  SkillDefinition,
  SkillName,
} from './schemas';
import type { LLMKeys } from '../llm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum character length for each thought snippet. */
const MAX_THOUGHT_LENGTH = 120;

// ---------------------------------------------------------------------------
// BaseAgent
// ---------------------------------------------------------------------------

export abstract class BaseAgent {
  public id: string;
  public name: string;
  public agentClass: AgentClass;
  public hp: number;
  public maxHp: number;
  public isAlive: boolean;
  public kills: number;
  public epochsSurvived: number;
  public lessons: Lesson[];
  /**
   * Rolling buffer of the agent's most recent LLM reasoning snippets.
   * Shown to spectators as a "thought feed" on the agent card.
   * Each entry is truncated to {@link MAX_THOUGHT_LENGTH} characters.
   */
  public thoughts: string[];
  /**
   * Agent's current hex position in the arena (axial coordinates).
   * Null until assigned by ArenaManager.spawnAgents().
   */
  public position: HexCoord | null;
  /** Optional LLM API keys for Workers env (no process.env). */
  public llmKeys?: LLMKeys;

  // ── Skill System ──
  /** Epochs remaining until skill is available again. 0 = ready. */
  public skillCooldownRemaining: number;
  /** Whether this agent's skill is active (activated) for the current epoch. */
  public skillActiveThisEpoch: boolean;

  /** Maximum number of thoughts retained in the rolling buffer. */
  static readonly MAX_THOUGHTS = 5;
  /** Default cooldown for skills (epochs between uses). */
  static readonly DEFAULT_SKILL_COOLDOWN = 5;

  constructor(id: string, name: string, agentClass: AgentClass) {
    this.id = id;
    this.name = name;
    this.agentClass = agentClass;
    this.hp = 1000;
    this.maxHp = 1000;
    this.isAlive = true;
    this.kills = 0;
    this.epochsSurvived = 0;
    this.lessons = [];
    this.thoughts = [];
    this.position = null;
    this.skillCooldownRemaining = 0;
    this.skillActiveThisEpoch = false;
  }

  // -------------------------------------------------------------------------
  // Abstract methods - each agent class implements its own logic
  // -------------------------------------------------------------------------

  /**
   * Each agent class must implement its own decision logic.
   * Called once per epoch with the full arena state.
   */
  abstract decide(arenaState: ArenaState): Promise<EpochActions>;

  /**
   * Get the agent's personality prompt for LLM calls.
   */
  abstract getPersonality(): string;

  /**
   * Get the agent's unique class skill definition.
   * Each subclass must return its specific skill.
   */
  abstract getSkillDefinition(): SkillDefinition;

  // -------------------------------------------------------------------------
  // HP management
  // -------------------------------------------------------------------------

  /**
   * Apply damage to this agent.
   * Returns the actual damage dealt (capped at current HP).
   */
  takeDamage(amount: number): number {
    if (amount < 0) return 0;
    const actual = Math.min(amount, this.hp);
    this.hp -= actual;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isAlive = false;
    }
    return actual;
  }

  /**
   * Heal this agent. Cannot exceed maxHp.
   * Returns the actual amount healed.
   */
  heal(amount: number): number {
    if (amount < 0 || !this.isAlive) return 0;
    const headroom = this.maxHp - this.hp;
    const actual = Math.min(amount, headroom);
    this.hp += actual;
    return actual;
  }

  /**
   * Check if the agent is still alive.
   */
  alive(): boolean {
    return this.isAlive && this.hp > 0;
  }

  // -------------------------------------------------------------------------
  // Thought Feed
  // -------------------------------------------------------------------------

  /**
   * Record a reasoning snippet from the agent's LLM decision.
   * Truncates to {@link MAX_THOUGHT_LENGTH} chars and maintains a rolling
   * buffer of the last {@link BaseAgent.MAX_THOUGHTS} entries.
   *
   * Call this after each `decide()` with the reasoning string from EpochActions.
   */
  addThought(reasoning: string): void {
    if (!reasoning) return;
    const truncated = reasoning.length > MAX_THOUGHT_LENGTH
      ? reasoning.slice(0, MAX_THOUGHT_LENGTH - 3) + '...'
      : reasoning;
    this.thoughts.push(truncated);
    if (this.thoughts.length > BaseAgent.MAX_THOUGHTS) {
      this.thoughts = this.thoughts.slice(-BaseAgent.MAX_THOUGHTS);
    }
  }

  /**
   * Get the most recent thought (for display on agent cards).
   * Returns null if no thoughts have been recorded yet.
   */
  getLatestThought(): string | null {
    return this.thoughts.length > 0
      ? this.thoughts[this.thoughts.length - 1]
      : null;
  }

  // -------------------------------------------------------------------------
  // Skill System
  // -------------------------------------------------------------------------

  /**
   * Check if this agent's skill is off cooldown and ready to use.
   */
  canUseSkill(): boolean {
    return this.isAlive && this.skillCooldownRemaining === 0;
  }

  /**
   * Activate the agent's skill for this epoch.
   * Sets the active flag and puts the skill on cooldown.
   * Returns true if activation succeeded, false if on cooldown or dead.
   */
  activateSkill(): boolean {
    if (!this.canUseSkill()) return false;
    this.skillActiveThisEpoch = true;
    this.skillCooldownRemaining = this.getSkillDefinition().cooldown;
    return true;
  }

  /**
   * Tick down the skill cooldown by 1 epoch.
   * Called at the end of each epoch by the epoch processor.
   */
  tickSkillCooldown(): void {
    if (this.skillCooldownRemaining > 0) {
      this.skillCooldownRemaining--;
    }
  }

  /**
   * Reset the skill active flag. Called at the end of each epoch.
   */
  resetSkillActive(): void {
    this.skillActiveThisEpoch = false;
  }

  /**
   * Build a skill context string for LLM prompts.
   * Tells the agent about their skill availability and what it does.
   */
  getSkillPromptContext(): string {
    const skill = this.getSkillDefinition();
    const readyStr = this.canUseSkill()
      ? 'READY - set "useSkill": true in your response to activate!'
      : `ON COOLDOWN (${this.skillCooldownRemaining} epochs remaining)`;

    return `\nUNIQUE SKILL: ${skill.name}
Status: ${readyStr}
Effect: ${skill.description}
Cooldown: ${skill.cooldown} epochs after use
To use: Include "useSkill": true in your JSON response.${
      skill.name === 'SIPHON'
        ? '\nSIPHON requires a "skillTarget": "<agent name>" to specify who to steal from.'
        : ''
    }`;
  }

  // -------------------------------------------------------------------------
  // Learning
  // -------------------------------------------------------------------------

  /**
   * Extract lessons from battle history. Typically called after each epoch or battle end.
   * Appends new lessons to the agent's lesson array and returns them.
   */
  async learn(
    battleId: string,
    epoch: number,
    context: string,
    outcome: string,
  ): Promise<Lesson> {
    // Generate learning and applied fields from context + outcome.
    // Subclasses can override for class-specific reflection, but this
    // provides a reasonable default.
    const lesson: Lesson = {
      battleId,
      epoch,
      context,
      outcome,
      learning: `From ${context}: ${outcome}`,
      applied: '', // Filled in when the lesson is actually used in a future decision
    };
    this.lessons.push(lesson);
    return lesson;
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  /**
   * Build a public-facing profile from this agent's accumulated data.
   * Used by the API to show stats to bettors.
   */
  getProfile(): AgentProfile {
    const totalBattles = this._countUniqueBattles();
    const wins = 0; // Determined externally by arena; override in arena context
    const emptyMatchups: Record<string, MatchupRecord> = {};

    return {
      agentId: this.id,
      agentClass: this.agentClass,
      totalBattles,
      wins,
      kills: this.kills,
      matchups: emptyMatchups,
      deathCauses: {},
      avgSurvival: this.epochsSurvived,
      winRate: totalBattles > 0 ? wins / totalBattles : 0,
      streak: 0,
      recentLessons: this.lessons.slice(-5),
    };
  }

  // -------------------------------------------------------------------------
  // State snapshot (for arena broadcasting)
  // -------------------------------------------------------------------------

  /**
   * Get current state snapshot matching ArenaAgentState schema.
   */
  getState(): ArenaAgentState {
    const skill = this.getSkillDefinition();
    return {
      id: this.id,
      name: this.name,
      class: this.agentClass,
      hp: this.hp,
      maxHp: this.maxHp,
      isAlive: this.isAlive,
      kills: this.kills,
      epochsSurvived: this.epochsSurvived,
      thoughts: [...this.thoughts],
      position: this.position ?? undefined,
      skillName: skill.name,
      skillCooldownRemaining: this.skillCooldownRemaining,
      skillActive: this.skillActiveThisEpoch,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _countUniqueBattles(): number {
    const ids = new Set(this.lessons.map(l => l.battleId));
    return ids.size;
  }
}

// ---------------------------------------------------------------------------
// Default fallback actions
// ---------------------------------------------------------------------------

/**
 * Safe fallback actions when LLM fails or returns invalid data.
 * Small stake, random asset, no combat. Keeps the agent alive.
 */
export function getDefaultActions(agent: BaseAgent): EpochActions {
  const assets = ['ETH', 'BTC', 'SOL', 'MON'] as const;
  const asset = assets[Math.floor(Math.random() * assets.length)];
  const direction = Math.random() > 0.5 ? 'UP' : 'DOWN';

  return {
    prediction: {
      asset,
      direction,
      stake: 5, // Minimum stake - play it safe
    },
    combatStance: 'NONE',
    // No combat - just survive
    reasoning: `[FALLBACK] ${agent.name} defaulted to safe prediction.`,
  };
}
