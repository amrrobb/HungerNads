/**
 * HUNGERNADS - Learning Module
 *
 * Agent memory system, lesson extraction, public profile generation.
 * Lessons are PUBLIC - nads can see what agents learned to inform betting.
 */

// Re-export canonical types from schemas (single source of truth)
export type { Lesson, AgentProfile, MatchupRecord } from '../agents/schemas';

// Memory
export { AgentMemory } from './memory';
export type { BattleRecord } from './memory';

// Lesson extraction
export {
  extractLessons,
  extractAllLessons,
  storeLesson,
  storeBattleLessons,
  getRecentLessons,
} from './lessons';
export type { BattleHistory, AgentInfo, LLMCall } from './lessons';

// Profile generation
export { AgentProfileBuilder, getAgentLeaderboard } from './profiles';

// Generative Memory (Stanford Generative Agents inspired)
export { GenerativeMemory, ObservationFactory, extractKeywords } from './generative-memory';
export type { ScoredMemory, RetrievalQuery, ObservationInput } from './generative-memory';
export type { LLMCall as GenerativeMemoryLLMCall } from './generative-memory';

// Re-export generative memory schemas
export type {
  MemoryObservation,
  MemoryReflection,
  MemoryPlan,
  MemoryEventType,
  MemoryPlanStatus,
} from '../agents/schemas';
