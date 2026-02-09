/**
 * HUNGERNADS - Generative Memory System
 *
 * Stanford Generative Agents inspired 3-layer memory architecture:
 *
 *   Layer 1: OBSERVATIONS  — Raw battle events recorded each epoch.
 *   Layer 2: REFLECTIONS   — Abstract insights synthesized from observations (LLM).
 *   Layer 3: PLANS         — Actionable strategies derived from reflections (LLM).
 *
 * Key features:
 *   - Importance scoring (1-10) for each memory item
 *   - Keyword-based situational retrieval (Jaccard similarity)
 *   - Retrieval score = importance * recency_decay * relevance
 *   - Coexists with the existing flat Lesson system
 *
 * Reference: joonspk-research/generative_agents (Stanford, 2023)
 *
 * Uses injected LLM callback (same pattern as lessons.ts) for testability.
 */

import { z } from 'zod';
import type {
  MemoryObservation,
  MemoryReflection,
  MemoryPlan,
  MemoryEventType,
  MemoryPlanStatus,
} from '../agents/schemas';
import {
  insertMemoryObservation,
  getAgentObservations,
  getObservationsByBattle,
  getRecentMemoryObservations,
  getHighImportanceObservations,
  insertMemoryReflection,
  getAgentReflections,
  getReflectionsByAbstraction,
  insertMemoryPlan,
  getActivePlans,
  getAgentPlans,
  updatePlanStatus,
  supersedePlansByAgent,
  type MemoryObservationRow,
  type MemoryReflectionRow,
  type MemoryPlanRow,
} from '../db/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Injected LLM callback: (systemPrompt, userPrompt) => rawText. */
export type LLMCall = (system: string, prompt: string) => Promise<string>;

/** A scored memory item from retrieval. */
export interface ScoredMemory {
  type: 'observation' | 'reflection' | 'plan';
  id: string;
  text: string;
  importance: number;
  recencyScore: number;
  relevanceScore: number;
  /** Combined retrieval score = importance_norm * recency * relevance */
  totalScore: number;
  tags: string[];
  createdAt: string;
}

/** Options for retrieval queries. */
export interface RetrievalQuery {
  /** Situational context to match against (free text). */
  situation: string;
  /** Maximum number of memories to return. */
  limit?: number;
  /** Minimum total score threshold to include. */
  minScore?: number;
  /** Which memory layers to search. Default: all three. */
  layers?: Array<'observation' | 'reflection' | 'plan'>;
}

/** Configuration for observation recording. */
export interface ObservationInput {
  battleId: string;
  epoch: number;
  eventType: MemoryEventType;
  description: string;
  /** Optional explicit importance. If omitted, will be scored automatically. */
  importance?: number;
  /** Optional explicit tags. If omitted, will be auto-extracted. */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Zod schemas for LLM response parsing
// ---------------------------------------------------------------------------

const ImportanceResponseSchema = z.object({
  importance: z.number().int().min(1).max(10),
  rationale: z.string(),
});

const ReflectionResponseSchema = z.object({
  insight: z.string().min(1),
  importance: z.number().int().min(1).max(10),
  tags: z.array(z.string()),
});

const ReflectionsArraySchema = z.array(ReflectionResponseSchema).min(1).max(5);

const PlanResponseSchema = z.object({
  plan: z.string().min(1),
  importance: z.number().int().min(1).max(10),
  tags: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Recency decay half-life in hours. After this many hours, recency = 0.5. */
const RECENCY_HALF_LIFE_HOURS = 24;

/** Default importance for observations when LLM scoring fails. */
const DEFAULT_IMPORTANCE = 5;

/**
 * Importance thresholds for auto-scoring common event types.
 * Used as heuristic fallback when LLM scoring is not called.
 */
const EVENT_TYPE_IMPORTANCE: Record<MemoryEventType, number> = {
  prediction_correct: 3,
  prediction_wrong: 4,
  attack_landed: 5,
  attack_blocked: 4,
  was_attacked: 5,
  defended: 3,
  killed_agent: 9,
  was_killed: 10,
  bleed: 2,
  skill_used: 6,
  alliance_formed: 7,
  alliance_broken: 6,
  betrayed: 9,
  was_betrayed: 9,
  survived_battle: 8,
  general: 3,
};

// ---------------------------------------------------------------------------
// GenerativeMemory
// ---------------------------------------------------------------------------

/**
 * Three-layer memory system for a single agent.
 *
 * Lifecycle:
 *   1. During battle: call recordObservation() after each epoch event.
 *   2. After battle:  call reflect() to synthesize observations into insights.
 *   3. Before battle: call plan() to generate actionable strategy from reflections.
 *   4. During decide: call retrieve() with the current situation to get relevant memories.
 *   5. Build context: call buildContextBlock() for a formatted LLM prompt section.
 */
export class GenerativeMemory {
  constructor(
    private db: D1Database,
    private agentId: string,
  ) {}

  // ─── Layer 1: Observations ──────────────────────────────────

  /**
   * Record a raw observation from a battle event.
   * Importance is either provided or heuristically scored by event type.
   */
  async recordObservation(input: ObservationInput): Promise<MemoryObservation> {
    const importance = input.importance ?? EVENT_TYPE_IMPORTANCE[input.eventType] ?? DEFAULT_IMPORTANCE;
    const tags = input.tags ?? extractKeywords(input.description);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const row: MemoryObservationRow = {
      id,
      agent_id: this.agentId,
      battle_id: input.battleId,
      epoch: input.epoch,
      event_type: input.eventType,
      description: input.description,
      importance,
      tags_json: JSON.stringify(tags),
      created_at: now,
    };

    await insertMemoryObservation(this.db, row);

    return {
      id,
      agentId: this.agentId,
      battleId: input.battleId,
      epoch: input.epoch,
      eventType: input.eventType,
      description: input.description,
      importance,
      tags,
      createdAt: now,
    };
  }

  /**
   * Record multiple observations in parallel.
   * Failures are caught individually so one bad insert doesn't block others.
   */
  async recordObservations(inputs: ObservationInput[]): Promise<MemoryObservation[]> {
    const results = await Promise.allSettled(
      inputs.map((input) => this.recordObservation(input)),
    );

    const observations: MemoryObservation[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        observations.push(result.value);
      } else {
        console.error(`[GenerativeMemory] Failed to record observation:`, result.reason);
      }
    }
    return observations;
  }

  /**
   * Score the importance of a memory description using LLM.
   * Falls back to DEFAULT_IMPORTANCE on failure.
   */
  async scoreImportance(
    description: string,
    llmCall: LLMCall,
  ): Promise<number> {
    const system = [
      'You are a memory importance scorer for an AI gladiator agent.',
      'Rate the importance of a battle event on a scale of 1-10.',
      '1 = completely routine (took bleed damage, made a normal prediction)',
      '5 = moderately notable (landed an attack, got attacked)',
      '10 = pivotal moment (killed someone, got killed, critical betrayal)',
      'Respond with JSON only: {"importance": <1-10>, "rationale": "<brief reason>"}',
    ].join('\n');

    const prompt = `Rate the importance of this event:\n"${description}"`;

    try {
      const raw = await llmCall(system, prompt);
      const cleaned = cleanJsonResponse(raw);
      const parsed = ImportanceResponseSchema.parse(JSON.parse(cleaned));
      return parsed.importance;
    } catch {
      return DEFAULT_IMPORTANCE;
    }
  }

  // ─── Layer 2: Reflections ───────────────────────────────────

  /**
   * Synthesize abstract reflections from recent observations.
   *
   * Typically called after a battle ends. Fetches the most important
   * recent observations, asks the LLM to identify patterns and insights,
   * and stores the resulting reflections.
   *
   * @param llmCall - LLM callback for generating reflections
   * @param agentName - Agent's name (for prompt personalization)
   * @param agentClass - Agent's class (for prompt personalization)
   * @param battleId - If provided, only reflect on observations from this battle
   * @returns Array of generated reflections
   */
  async reflect(
    llmCall: LLMCall,
    agentName: string,
    agentClass: string,
    battleId?: string,
  ): Promise<MemoryReflection[]> {
    // Fetch observations to reflect on
    const observations = battleId
      ? await getObservationsByBattle(this.db, this.agentId, battleId)
      : await getHighImportanceObservations(this.db, this.agentId, 5, 30);

    if (observations.length < 3) {
      // Not enough observations to form meaningful reflections
      return [];
    }

    const system = [
      `You are ${agentName}, a ${agentClass} gladiator in the AI Colosseum.`,
      'You are reviewing your recent battle observations to extract abstract strategic insights.',
      'Look for PATTERNS across events. What strategies worked? What failed? What do you know about your opponents?',
      'Each insight should be a reusable strategic principle, not a description of a single event.',
      'Be specific and tactical. Vague insights are useless.',
      '',
      'Respond with a JSON array of 1-5 reflections:',
      '[{"insight": "...", "importance": 1-10, "tags": ["keyword1", "keyword2"]}]',
    ].join('\n');

    const observationBlock = observations
      .map((o) => `[E${o.epoch}] (${o.event_type}, importance: ${o.importance}) ${o.description}`)
      .join('\n');

    const prompt = [
      `YOUR RECENT OBSERVATIONS (${observations.length} events):`,
      observationBlock,
      '',
      'Synthesize 1-5 strategic reflections from these observations.',
      'Focus on patterns, opponent behaviors, and tactical principles you can reuse.',
      'Respond with JSON array only.',
    ].join('\n');

    try {
      const raw = await llmCall(system, prompt);
      const cleaned = cleanJsonResponse(raw);
      const parsed = ReflectionsArraySchema.parse(JSON.parse(cleaned));

      const now = new Date().toISOString();
      const sourceIds = observations.map((o) => o.id);
      const reflections: MemoryReflection[] = [];

      for (const r of parsed) {
        const id = crypto.randomUUID();
        const row: MemoryReflectionRow = {
          id,
          agent_id: this.agentId,
          source_observation_ids_json: JSON.stringify(sourceIds),
          insight: r.insight,
          importance: r.importance,
          abstraction_level: 1,
          tags_json: JSON.stringify(r.tags),
          created_at: now,
        };

        await insertMemoryReflection(this.db, row);

        reflections.push({
          id,
          agentId: this.agentId,
          sourceObservationIds: sourceIds,
          insight: r.insight,
          importance: r.importance,
          abstractionLevel: 1,
          tags: r.tags,
          createdAt: now,
        });
      }

      return reflections;
    } catch (error) {
      console.error(
        `[GenerativeMemory] Reflection failed for ${agentName}:`,
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  }

  /**
   * Generate higher-abstraction reflections from existing reflections.
   * Level 2 reflections synthesize patterns across Level 1 reflections.
   * Level 3 reflections synthesize patterns across Level 2.
   *
   * Typically called periodically (e.g. every 5 battles) to build
   * increasingly abstract strategic knowledge.
   */
  async reflectOnReflections(
    llmCall: LLMCall,
    agentName: string,
    agentClass: string,
    sourceLevel: 1 | 2 = 1,
  ): Promise<MemoryReflection[]> {
    const targetLevel = (sourceLevel + 1) as 2 | 3;
    const sources = await getReflectionsByAbstraction(
      this.db,
      this.agentId,
      sourceLevel,
      20,
    );

    if (sources.length < 3) {
      return [];
    }

    const system = [
      `You are ${agentName}, a ${agentClass} gladiator in the AI Colosseum.`,
      `You are synthesizing higher-level strategic principles from your existing insights.`,
      'Look for overarching themes and meta-strategies that span multiple battles.',
      'These should be your core strategic beliefs — the deep truths about how the arena works.',
      '',
      'Respond with a JSON array of 1-3 reflections:',
      '[{"insight": "...", "importance": 1-10, "tags": ["keyword1", "keyword2"]}]',
    ].join('\n');

    const insightsBlock = sources
      .map((s) => `- (importance: ${s.importance}) ${s.insight}`)
      .join('\n');

    const prompt = [
      `YOUR EXISTING INSIGHTS (${sources.length}):`,
      insightsBlock,
      '',
      'Synthesize 1-3 higher-level strategic principles from these insights.',
      'These should be abstract, reusable truths about the arena.',
      'Respond with JSON array only.',
    ].join('\n');

    try {
      const raw = await llmCall(system, prompt);
      const cleaned = cleanJsonResponse(raw);
      const parsed = ReflectionsArraySchema.parse(JSON.parse(cleaned));

      const now = new Date().toISOString();
      const sourceIds = sources.map((s) => s.id);
      const reflections: MemoryReflection[] = [];

      for (const r of parsed) {
        const id = crypto.randomUUID();
        const row: MemoryReflectionRow = {
          id,
          agent_id: this.agentId,
          source_observation_ids_json: JSON.stringify(sourceIds),
          insight: r.insight,
          importance: r.importance,
          abstraction_level: targetLevel,
          tags_json: JSON.stringify(r.tags),
          created_at: now,
        };

        await insertMemoryReflection(this.db, row);

        reflections.push({
          id,
          agentId: this.agentId,
          sourceObservationIds: sourceIds,
          insight: r.insight,
          importance: r.importance,
          abstractionLevel: targetLevel,
          tags: r.tags,
          createdAt: now,
        });
      }

      return reflections;
    } catch (error) {
      console.error(
        `[GenerativeMemory] Meta-reflection failed for ${agentName}:`,
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  }

  // ─── Layer 3: Plans ─────────────────────────────────────────

  /**
   * Generate an actionable battle plan from reflections.
   *
   * Typically called before a new battle starts. Supersedes any
   * existing active plans for this agent.
   *
   * @param llmCall - LLM callback
   * @param agentName - Agent's name
   * @param agentClass - Agent's class
   * @returns The generated plan, or null if generation failed
   */
  async plan(
    llmCall: LLMCall,
    agentName: string,
    agentClass: string,
  ): Promise<MemoryPlan | null> {
    // Gather reflections across all abstraction levels
    const reflections = await getAgentReflections(this.db, this.agentId, 15);

    if (reflections.length === 0) {
      return null;
    }

    // Also grab the most recent active plan for context
    const activePlans = await getActivePlans(this.db, this.agentId, 1);
    const previousPlan = activePlans.length > 0 ? activePlans[0].plan_text : null;

    const system = [
      `You are ${agentName}, a ${agentClass} gladiator in the AI Colosseum.`,
      'You are forming a battle plan for your next fight based on everything you have learned.',
      'Your plan should be a concrete, actionable strategy covering:',
      '1. Prediction approach (which assets to focus on, stake levels)',
      '2. Combat stance strategy (when to attack, defend, sabotage, or skip)',
      '3. Target selection (who to attack, who to avoid)',
      '4. Alliance strategy (who to ally with, when to betray)',
      '5. Skill usage timing',
      '',
      'Respond with JSON: {"plan": "...", "importance": 1-10, "tags": ["keyword1", ...]}',
    ].join('\n');

    const reflectionBlock = reflections
      .map(
        (r) =>
          `- [L${r.abstraction_level}] (importance: ${r.importance}) ${r.insight}`,
      )
      .join('\n');

    const prompt = [
      `YOUR STRATEGIC INSIGHTS (${reflections.length}):`,
      reflectionBlock,
      '',
      previousPlan
        ? `YOUR PREVIOUS PLAN (may need updating):\n${previousPlan}\n`
        : '',
      'Create a comprehensive battle plan for your next fight.',
      'Be specific and tactical. Reference your insights.',
      'Respond with JSON only.',
    ].join('\n');

    try {
      const raw = await llmCall(system, prompt);
      const cleaned = cleanJsonResponse(raw);
      const parsed = PlanResponseSchema.parse(JSON.parse(cleaned));

      // Supersede existing active plans
      await supersedePlansByAgent(this.db, this.agentId);

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const sourceIds = reflections.map((r) => r.id);

      const row: MemoryPlanRow = {
        id,
        agent_id: this.agentId,
        source_reflection_ids_json: JSON.stringify(sourceIds),
        plan_text: parsed.plan,
        status: 'active',
        importance: parsed.importance,
        tags_json: JSON.stringify(parsed.tags),
        created_at: now,
        applied_at: null,
      };

      await insertMemoryPlan(this.db, row);

      return {
        id,
        agentId: this.agentId,
        sourceReflectionIds: sourceIds,
        planText: parsed.plan,
        status: 'active' as MemoryPlanStatus,
        importance: parsed.importance,
        tags: parsed.tags,
        createdAt: now,
        appliedAt: null,
      };
    } catch (error) {
      console.error(
        `[GenerativeMemory] Plan generation failed for ${agentName}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * Mark a plan as applied (used in a battle).
   */
  async markPlanApplied(planId: string): Promise<void> {
    await updatePlanStatus(
      this.db,
      planId,
      'applied',
      new Date().toISOString(),
    );
  }

  // ─── Retrieval ──────────────────────────────────────────────

  /**
   * Retrieve the most relevant memories for a given situation.
   *
   * Retrieval score = importance_normalized * recency_decay * relevance
   *
   * Where:
   *   - importance_normalized = importance / 10  (0.1 to 1.0)
   *   - recency_decay = 2^(-hours_since / HALF_LIFE)  (exponential decay)
   *   - relevance = jaccard_similarity(query_keywords, memory_tags)
   *
   * This is the core of the Stanford Generative Agents retrieval mechanism,
   * adapted for keyword matching instead of embeddings.
   */
  async retrieve(query: RetrievalQuery): Promise<ScoredMemory[]> {
    const limit = query.limit ?? 10;
    const minScore = query.minScore ?? 0.01;
    const layers = query.layers ?? ['observation', 'reflection', 'plan'];
    const queryKeywords = extractKeywords(query.situation);
    const now = Date.now();

    const allScoredMemories: ScoredMemory[] = [];

    // Fetch candidates from each requested layer
    if (layers.includes('observation')) {
      const observations = await getAgentObservations(this.db, this.agentId, 50);
      for (const obs of observations) {
        const scored = scoreMemoryItem(
          'observation',
          obs.id,
          obs.description,
          obs.importance,
          parseTags(obs.tags_json),
          obs.created_at,
          queryKeywords,
          now,
        );
        if (scored.totalScore >= minScore) {
          allScoredMemories.push(scored);
        }
      }
    }

    if (layers.includes('reflection')) {
      const reflections = await getAgentReflections(this.db, this.agentId, 30);
      for (const ref of reflections) {
        const scored = scoreMemoryItem(
          'reflection',
          ref.id,
          ref.insight,
          ref.importance,
          parseTags(ref.tags_json),
          ref.created_at,
          queryKeywords,
          now,
        );
        // Boost reflections slightly (they represent synthesized knowledge)
        scored.totalScore *= 1.2;
        if (scored.totalScore >= minScore) {
          allScoredMemories.push(scored);
        }
      }
    }

    if (layers.includes('plan')) {
      const plans = await getActivePlans(this.db, this.agentId, 5);
      for (const plan of plans) {
        const scored = scoreMemoryItem(
          'plan',
          plan.id,
          plan.plan_text,
          plan.importance,
          parseTags(plan.tags_json),
          plan.created_at,
          queryKeywords,
          now,
        );
        // Boost active plans significantly (they represent current intent)
        scored.totalScore *= 1.5;
        if (scored.totalScore >= minScore) {
          allScoredMemories.push(scored);
        }
      }
    }

    // Sort by total score descending and take top N
    allScoredMemories.sort((a, b) => b.totalScore - a.totalScore);
    return allScoredMemories.slice(0, limit);
  }

  // ─── Context Building ──────────────────────────────────────

  /**
   * Build a formatted context block for injection into an LLM decision prompt.
   *
   * This replaces the flat "PAST LESSONS:" block with a richer, multi-layer
   * memory context. Falls back gracefully if no generative memories exist.
   *
   * @param situation - Current battle situation description (for retrieval matching)
   * @returns Formatted string suitable for LLM prompt injection
   */
  async buildContextBlock(situation: string): Promise<string> {
    const parts: string[] = [];

    // Active plan (current strategy)
    const plans = await getActivePlans(this.db, this.agentId, 1);
    if (plans.length > 0) {
      parts.push(`CURRENT BATTLE PLAN:\n${plans[0].plan_text}`);
    }

    // Retrieve situationally relevant memories
    const memories = await this.retrieve({
      situation,
      limit: 8,
      layers: ['observation', 'reflection'],
    });

    if (memories.length > 0) {
      const reflectionMemories = memories.filter((m) => m.type === 'reflection');
      const observationMemories = memories.filter((m) => m.type === 'observation');

      if (reflectionMemories.length > 0) {
        const lines = reflectionMemories.map(
          (m) => `- [importance: ${m.importance}] ${m.text}`,
        );
        parts.push(`STRATEGIC INSIGHTS:\n${lines.join('\n')}`);
      }

      if (observationMemories.length > 0) {
        const lines = observationMemories.map(
          (m) => `- [importance: ${m.importance}] ${m.text}`,
        );
        parts.push(`RELEVANT PAST EVENTS:\n${lines.join('\n')}`);
      }
    }

    if (parts.length === 0) {
      return 'MEMORY: No prior battle memories yet.';
    }

    return parts.join('\n\n');
  }

  // ─── Accessors ─────────────────────────────────────────────

  /** Get all observations, ordered by importance then recency. */
  async getObservations(limit: number = 50): Promise<MemoryObservation[]> {
    const rows = await getAgentObservations(this.db, this.agentId, limit);
    return rows.map(observationRowToModel);
  }

  /** Get observations for a specific battle. */
  async getBattleObservations(battleId: string): Promise<MemoryObservation[]> {
    const rows = await getObservationsByBattle(this.db, this.agentId, battleId);
    return rows.map(observationRowToModel);
  }

  /** Get all reflections, ordered by importance then recency. */
  async getReflections(limit: number = 20): Promise<MemoryReflection[]> {
    const rows = await getAgentReflections(this.db, this.agentId, limit);
    return rows.map(reflectionRowToModel);
  }

  /** Get the current active plan. */
  async getActivePlan(): Promise<MemoryPlan | null> {
    const rows = await getActivePlans(this.db, this.agentId, 1);
    if (rows.length === 0) return null;
    return planRowToModel(rows[0]);
  }

  /** Get all plans (including superseded/applied). */
  async getAllPlans(limit: number = 20): Promise<MemoryPlan[]> {
    const rows = await getAgentPlans(this.db, this.agentId, limit);
    return rows.map(planRowToModel);
  }

  /**
   * Get a summary of the memory system state for debugging/display.
   */
  async getMemoryStats(): Promise<{
    observationCount: number;
    reflectionCount: number;
    activePlanCount: number;
    totalPlanCount: number;
    highImportanceCount: number;
  }> {
    const [observations, reflections, activePlans, allPlans, highObs] =
      await Promise.all([
        getAgentObservations(this.db, this.agentId, 1000),
        getAgentReflections(this.db, this.agentId, 1000),
        getActivePlans(this.db, this.agentId, 100),
        getAgentPlans(this.db, this.agentId, 1000),
        getHighImportanceObservations(this.db, this.agentId, 7, 1000),
      ]);

    return {
      observationCount: observations.length,
      reflectionCount: reflections.length,
      activePlanCount: activePlans.length,
      totalPlanCount: allPlans.length,
      highImportanceCount: highObs.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Retrieval Scoring
// ---------------------------------------------------------------------------

/**
 * Score a single memory item for retrieval relevance.
 *
 * Score = importance_norm * recency * relevance
 *
 * - importance_norm: importance / 10 (0.1 to 1.0)
 * - recency: exponential decay based on age in hours
 * - relevance: Jaccard similarity between query keywords and memory tags
 */
function scoreMemoryItem(
  type: 'observation' | 'reflection' | 'plan',
  id: string,
  text: string,
  importance: number,
  tags: string[],
  createdAt: string,
  queryKeywords: string[],
  nowMs: number,
): ScoredMemory {
  // Importance (normalized to 0-1)
  const importanceNorm = importance / 10;

  // Recency decay: 2^(-hours / halfLife)
  const ageMs = nowMs - new Date(createdAt).getTime();
  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));
  const recencyScore = Math.pow(2, -ageHours / RECENCY_HALF_LIFE_HOURS);

  // Relevance: Jaccard similarity of keywords
  const relevanceScore = jaccardSimilarity(queryKeywords, tags);

  // Combined score
  // If no query keywords, relevance = 1 (no filtering by topic)
  const effectiveRelevance = queryKeywords.length === 0 ? 1 : Math.max(0.1, relevanceScore);
  const totalScore = importanceNorm * recencyScore * effectiveRelevance;

  return {
    type,
    id,
    text,
    importance,
    recencyScore,
    relevanceScore,
    totalScore,
    tags,
    createdAt,
  };
}

// ---------------------------------------------------------------------------
// Text Processing & Similarity
// ---------------------------------------------------------------------------

/**
 * Extract keywords from a text for tag-based matching.
 * Strips common stop words, lowercases, and deduplicates.
 */
export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'this',
    'that', 'these', 'those', 'it', 'its', 'i', 'my', 'me', 'we', 'our',
    'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
    'who', 'whom', 'which', 'what', 'when', 'where', 'how', 'why', 'so',
    'if', 'then', 'than', 'too', 'very', 'just', 'about', 'up', 'out',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'only', 'own', 'same', 'as', 'also', 'into', 'over', 'after',
    'before', 'between', 'under', 'above', 'below', 'during', 'through',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)];
}

/**
 * Jaccard similarity between two keyword sets.
 * Returns 0 if either set is empty, 1 if identical.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;

  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Row <-> Model Mappers
// ---------------------------------------------------------------------------

function observationRowToModel(row: MemoryObservationRow): MemoryObservation {
  return {
    id: row.id,
    agentId: row.agent_id,
    battleId: row.battle_id,
    epoch: row.epoch,
    eventType: row.event_type as MemoryEventType,
    description: row.description,
    importance: row.importance,
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
  };
}

function reflectionRowToModel(row: MemoryReflectionRow): MemoryReflection {
  return {
    id: row.id,
    agentId: row.agent_id,
    sourceObservationIds: parseJsonArray(row.source_observation_ids_json),
    insight: row.insight,
    importance: row.importance,
    abstractionLevel: row.abstraction_level,
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
  };
}

function planRowToModel(row: MemoryPlanRow): MemoryPlan {
  return {
    id: row.id,
    agentId: row.agent_id,
    sourceReflectionIds: parseJsonArray(row.source_reflection_ids_json),
    planText: row.plan_text,
    status: row.status as MemoryPlanStatus,
    importance: row.importance,
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

// ---------------------------------------------------------------------------
// JSON Helpers
// ---------------------------------------------------------------------------

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((t: unknown) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Clean an LLM response to extract JSON.
 * Strips markdown code blocks and non-JSON text.
 */
function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();

  // Strip markdown code blocks
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Find the first JSON structure
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');

  // Try object first, then array
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    if (firstBracket === -1 || firstBrace < firstBracket) {
      return cleaned.slice(firstBrace, lastBrace + 1);
    }
  }
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return cleaned.slice(firstBracket, lastBracket + 1);
  }

  return cleaned.trim();
}

// ---------------------------------------------------------------------------
// Observation Factory Helpers
// ---------------------------------------------------------------------------

/**
 * Helper functions to create properly typed observation inputs
 * from common battle events. Used by the epoch processor.
 */
export const ObservationFactory = {
  predictionResult(
    battleId: string,
    epoch: number,
    asset: string,
    direction: string,
    correct: boolean,
    hpChange: number,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: correct ? 'prediction_correct' : 'prediction_wrong',
      description: `Predicted ${asset} ${direction} — ${correct ? 'CORRECT' : 'WRONG'} (${hpChange > 0 ? '+' : ''}${hpChange} HP)`,
    };
  },

  attackLanded(
    battleId: string,
    epoch: number,
    targetName: string,
    damage: number,
    stance: string,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'attack_landed',
      description: `${stance} on ${targetName} landed — dealt ${damage} HP damage`,
      tags: [stance.toLowerCase(), targetName.toLowerCase(), 'combat', 'offense'],
    };
  },

  attackBlocked(
    battleId: string,
    epoch: number,
    targetName: string,
    stance: string,
    reflectedDamage: number,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'attack_blocked',
      description: `${stance} on ${targetName} was blocked — took ${reflectedDamage} HP reflected damage`,
      tags: [stance.toLowerCase(), targetName.toLowerCase(), 'combat', 'blocked'],
    };
  },

  wasAttacked(
    battleId: string,
    epoch: number,
    attackerName: string,
    damage: number,
    stance: string,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'was_attacked',
      description: `Was ${stance}ed by ${attackerName} — took ${damage} HP damage`,
      tags: [attackerName.toLowerCase(), 'combat', 'defense', stance.toLowerCase()],
    };
  },

  killedAgent(
    battleId: string,
    epoch: number,
    victimName: string,
    victimClass: string,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'killed_agent',
      description: `Killed ${victimName} (${victimClass}) — eliminated from the arena`,
      importance: 9,
      tags: [victimName.toLowerCase(), victimClass.toLowerCase(), 'kill', 'elimination'],
    };
  },

  wasKilled(
    battleId: string,
    epoch: number,
    killerName: string | null,
    cause: string,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'was_killed',
      description: killerName
        ? `Was killed by ${killerName} — cause: ${cause}`
        : `Died from ${cause}`,
      importance: 10,
      tags: killerName
        ? [killerName.toLowerCase(), 'death', cause.toLowerCase()]
        : ['death', cause.toLowerCase()],
    };
  },

  skillUsed(
    battleId: string,
    epoch: number,
    skillName: string,
    effect: string,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'skill_used',
      description: `Activated ${skillName}: ${effect}`,
      importance: 6,
      tags: [skillName.toLowerCase(), 'skill'],
    };
  },

  allianceFormed(
    battleId: string,
    epoch: number,
    partnerName: string,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'alliance_formed',
      description: `Formed non-aggression pact with ${partnerName}`,
      importance: 7,
      tags: [partnerName.toLowerCase(), 'alliance', 'diplomacy'],
    };
  },

  betrayal(
    battleId: string,
    epoch: number,
    victimName: string,
    damage: number,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'betrayed',
      description: `Betrayed ally ${victimName} — dealt ${damage} HP double damage`,
      importance: 9,
      tags: [victimName.toLowerCase(), 'betrayal', 'alliance', 'combat'],
    };
  },

  wasBetrayed(
    battleId: string,
    epoch: number,
    betrayerName: string,
    damage: number,
  ): ObservationInput {
    return {
      battleId,
      epoch,
      eventType: 'was_betrayed',
      description: `Was betrayed by ally ${betrayerName} — took ${damage} HP double damage`,
      importance: 9,
      tags: [betrayerName.toLowerCase(), 'betrayal', 'alliance'],
    };
  },

  survivedBattle(
    battleId: string,
    finalEpoch: number,
    finalHp: number,
    won: boolean,
  ): ObservationInput {
    return {
      battleId,
      epoch: finalEpoch,
      eventType: 'survived_battle',
      description: won
        ? `Won the battle! Survived ${finalEpoch} epochs with ${finalHp} HP remaining`
        : `Survived the battle (${finalEpoch} epochs, ${finalHp} HP remaining) but did not win`,
      importance: won ? 8 : 6,
      tags: won ? ['victory', 'survival'] : ['survival'],
    };
  },
};
