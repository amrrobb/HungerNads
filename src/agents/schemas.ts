/**
 * HUNGERNADS - Zod Schemas
 *
 * Runtime validation schemas for all agent-related data structures.
 * These enforce correctness at the boundary between LLM outputs and game logic.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums / Primitives
// ---------------------------------------------------------------------------

export const AssetSchema = z.enum(['ETH', 'BTC', 'SOL', 'MON']);
export type Asset = z.infer<typeof AssetSchema>;

export const DirectionSchema = z.enum(['UP', 'DOWN']);
export type Direction = z.infer<typeof DirectionSchema>;

export const AgentClassSchema = z.enum([
  'WARRIOR',
  'TRADER',
  'SURVIVOR',
  'PARASITE',
  'GAMBLER',
]);
export type AgentClass = z.infer<typeof AgentClassSchema>;

// ---------------------------------------------------------------------------
// Hex Grid Coordinates
// ---------------------------------------------------------------------------

export const HexCoordSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
});
export type HexCoord = z.infer<typeof HexCoordSchema>;

// ---------------------------------------------------------------------------
// Skill System - Unique class abilities with cooldowns
// ---------------------------------------------------------------------------

export const SkillNameSchema = z.enum([
  'BERSERK',      // Warrior: double attack damage, take 50% more damage
  'INSIDER_INFO', // Trader: prediction auto-succeeds this epoch
  'FORTIFY',      // Survivor: immune to all damage for 1 epoch
  'SIPHON',       // Parasite: steal 10% HP from target
  'ALL_IN',       // Gambler: double or nothing on prediction stake
]);
export type SkillName = z.infer<typeof SkillNameSchema>;

export const SkillDefinitionSchema = z.object({
  name: SkillNameSchema,
  /** Epochs between uses (after activation, wait this many epochs) */
  cooldown: z.number().int().positive(),
  /** Human-readable description */
  description: z.string(),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const SkillActivationSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  skillName: SkillNameSchema,
  /** Target agent ID (for targeted skills like SIPHON) */
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  /** Description of the effect for spectators */
  effectDescription: z.string(),
});
export type SkillActivation = z.infer<typeof SkillActivationSchema>;

// ---------------------------------------------------------------------------
// EpochActions - What an agent does each epoch
// ---------------------------------------------------------------------------

export const PredictionSchema = z.object({
  asset: AssetSchema,
  direction: DirectionSchema,
  stake: z.number().min(5).max(50),
});
export type Prediction = z.infer<typeof PredictionSchema>;

export const AttackSchema = z.object({
  target: z.string().min(1),
  stake: z.number().positive(),
});
export type Attack = z.infer<typeof AttackSchema>;

// ---------------------------------------------------------------------------
// Combat Stance - 3-way triangle: Attack > Sabotage > Defend > Attack
// ---------------------------------------------------------------------------

export const CombatStanceSchema = z.enum(['ATTACK', 'SABOTAGE', 'DEFEND', 'NONE']);
export type CombatStance = z.infer<typeof CombatStanceSchema>;

export const EpochActionsSchema = z.object({
  prediction: PredictionSchema,
  /** Combat stance for this epoch. NONE = skip combat entirely. */
  combatStance: CombatStanceSchema.optional().default('NONE'),
  /** Target agent name/id. Required for ATTACK and SABOTAGE stances. */
  combatTarget: z.string().optional(),
  /** HP stake for ATTACK and SABOTAGE (absolute HP). */
  combatStake: z.number().positive().optional(),
  /** Optional movement to an adjacent hex. Target hex coordinate. */
  move: HexCoordSchema.optional(),
  /** Whether to activate the agent's unique class skill this epoch. */
  useSkill: z.boolean().optional(),
  /** Target agent name for targeted skills (e.g. SIPHON). */
  skillTarget: z.string().optional(),
  /** Propose a temporary alliance (non-aggression pact) with the named agent. Max 1 alliance per agent. */
  proposeAlliance: z.string().optional(),
  /** Explicitly break the current alliance. */
  breakAlliance: z.boolean().optional(),
  reasoning: z.string(),
  // ── Legacy fields (deprecated, kept for backward compat during migration) ──
  attack: AttackSchema.optional(),
  defend: z.boolean().optional(),
});
export type EpochActions = z.infer<typeof EpochActionsSchema>;

// ---------------------------------------------------------------------------
// Alliance System - Temporary truces with betrayal mechanics
// ---------------------------------------------------------------------------

export const AllianceEventTypeSchema = z.enum([
  'PROPOSED',  // Agent proposed alliance (target already has one or declined)
  'FORMED',    // Alliance formed between two agents
  'EXPIRED',   // Alliance duration ran out naturally
  'BROKEN',    // Agent explicitly broke alliance (no combat)
  'BETRAYED',  // Agent attacked their ally (double damage!)
]);
export type AllianceEventType = z.infer<typeof AllianceEventTypeSchema>;

export const AllianceEventSchema = z.object({
  type: AllianceEventTypeSchema,
  agentId: z.string(),
  agentName: z.string(),
  partnerId: z.string(),
  partnerName: z.string(),
  /** Human-readable description for spectator feed */
  description: z.string(),
  /** Remaining epochs at time of event (for FORMED/EXPIRED) */
  epochsRemaining: z.number().int().nonnegative().optional(),
});
export type AllianceEvent = z.infer<typeof AllianceEventSchema>;

/** Default alliance duration in epochs. */
export const ALLIANCE_DURATION = 3;

/** Damage multiplier when attacking an ally (betrayal). */
export const BETRAYAL_DAMAGE_MULTIPLIER = 2.0;

// ---------------------------------------------------------------------------
// Lesson - What an agent learned from an outcome
// ---------------------------------------------------------------------------

export const LessonSchema = z.object({
  battleId: z.string(),
  epoch: z.number().int().nonnegative(),
  context: z.string(),
  outcome: z.string(),
  learning: z.string(),
  applied: z.string(),
});
export type Lesson = z.infer<typeof LessonSchema>;

// ---------------------------------------------------------------------------
// AgentProfile - Public-facing stats, shown to bettors
// ---------------------------------------------------------------------------

export const MatchupRecordSchema = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});
export type MatchupRecord = z.infer<typeof MatchupRecordSchema>;

export const AgentProfileSchema = z.object({
  agentId: z.string(),
  agentClass: AgentClassSchema,
  totalBattles: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  kills: z.number().int().nonnegative(),
  matchups: z.record(AgentClassSchema, MatchupRecordSchema),
  deathCauses: z.record(z.string(), z.number().int().nonnegative()),
  avgSurvival: z.number().nonnegative(),
  winRate: z.number().min(0).max(1),
  streak: z.number().int(), // positive = win streak, negative = loss streak
  recentLessons: z.array(LessonSchema),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

// ---------------------------------------------------------------------------
// MarketData - Price feeds passed to agents each epoch
// ---------------------------------------------------------------------------

export const MarketDataSchema = z.object({
  prices: z.record(AssetSchema, z.number().nonnegative()),
  changes: z.record(AssetSchema, z.number()), // % change, can be negative
  timestamp: z.number().int().positive(),
});
export type MarketData = z.infer<typeof MarketDataSchema>;

// ---------------------------------------------------------------------------
// ArenaState - The arena context visible to each agent
// ---------------------------------------------------------------------------

export const ArenaAgentStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  class: AgentClassSchema,
  hp: z.number().nonnegative(),
  maxHp: z.number().positive(),
  isAlive: z.boolean(),
  kills: z.number().int().nonnegative(),
  epochsSurvived: z.number().int().nonnegative(),
  /** Rolling buffer of the agent's most recent LLM reasoning snippets. */
  thoughts: z.array(z.string()).default([]),
  /** Agent's current hex position in the arena (axial coordinates). */
  position: HexCoordSchema.optional(),
  // ── Skill System ──
  /** Name of this agent's unique skill. */
  skillName: SkillNameSchema.optional(),
  /** Epochs remaining until skill is available. 0 = ready. */
  skillCooldownRemaining: z.number().int().nonnegative().optional(),
  /** Whether this agent's skill is currently active this epoch. */
  skillActive: z.boolean().optional(),
  // ── Alliance System ──
  /** ID of the current alliance partner (null if no alliance). */
  allyId: z.string().nullable().optional(),
  /** Name of the current alliance partner. */
  allyName: z.string().nullable().optional(),
  /** Epochs remaining in the current alliance. */
  allianceEpochsRemaining: z.number().int().nonnegative().optional(),
});
export type ArenaAgentState = z.infer<typeof ArenaAgentStateSchema>;

export const ArenaStateSchema = z.object({
  battleId: z.string(),
  epoch: z.number().int().nonnegative(),
  agents: z.array(ArenaAgentStateSchema),
  marketData: MarketDataSchema,
});
export type ArenaState = z.infer<typeof ArenaStateSchema>;

// ---------------------------------------------------------------------------
// Generative Memory - Stanford Generative Agents inspired 3-layer memory
// ---------------------------------------------------------------------------

export const MemoryEventTypeSchema = z.enum([
  'prediction_correct',
  'prediction_wrong',
  'attack_landed',
  'attack_blocked',
  'was_attacked',
  'defended',
  'killed_agent',
  'was_killed',
  'bleed',
  'skill_used',
  'alliance_formed',
  'alliance_broken',
  'betrayed',
  'was_betrayed',
  'survived_battle',
  'general',
]);
export type MemoryEventType = z.infer<typeof MemoryEventTypeSchema>;

export const MemoryObservationSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  battleId: z.string(),
  epoch: z.number().int().nonnegative(),
  eventType: MemoryEventTypeSchema,
  description: z.string(),
  importance: z.number().int().min(1).max(10),
  tags: z.array(z.string()),
  createdAt: z.string(),
});
export type MemoryObservation = z.infer<typeof MemoryObservationSchema>;

export const ReflectionAbstractionLevelSchema = z.number().int().min(1).max(3);

export const MemoryReflectionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  sourceObservationIds: z.array(z.string()),
  insight: z.string(),
  importance: z.number().int().min(1).max(10),
  abstractionLevel: ReflectionAbstractionLevelSchema,
  tags: z.array(z.string()),
  createdAt: z.string(),
});
export type MemoryReflection = z.infer<typeof MemoryReflectionSchema>;

export const MemoryPlanStatusSchema = z.enum([
  'active',
  'applied',
  'superseded',
  'expired',
]);
export type MemoryPlanStatus = z.infer<typeof MemoryPlanStatusSchema>;

export const MemoryPlanSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  sourceReflectionIds: z.array(z.string()),
  planText: z.string(),
  status: MemoryPlanStatusSchema,
  importance: z.number().int().min(1).max(10),
  tags: z.array(z.string()),
  createdAt: z.string(),
  appliedAt: z.string().nullable(),
});
export type MemoryPlan = z.infer<typeof MemoryPlanSchema>;
