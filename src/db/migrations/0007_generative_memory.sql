-- Migration 0007: Generative Memory (Stanford Generative Agents inspired)
--
-- Three-layer memory system:
--   1. Observations  — raw battle events (what happened each epoch)
--   2. Reflections   — synthesized abstract insights from multiple observations
--   3. Plans         — actionable strategies derived from reflections
--
-- Each memory has an importance score (1-10) for retrieval weighting.
-- Tags enable keyword-based situational retrieval.

-- Layer 1: Observations (raw epoch-level events)
CREATE TABLE IF NOT EXISTS memory_observations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  battle_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  -- Event type: prediction_correct, prediction_wrong, attack_landed, attack_blocked,
  --             was_attacked, defended, killed_agent, was_killed, bleed, skill_used,
  --             alliance_formed, alliance_broken, betrayed, was_betrayed, survived_battle
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Importance score (1-10): 1 = routine, 10 = pivotal moment
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  -- JSON array of keyword tags for retrieval matching
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_agent ON memory_observations(agent_id);
CREATE INDEX IF NOT EXISTS idx_obs_agent_importance ON memory_observations(agent_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_obs_battle ON memory_observations(battle_id);

-- Layer 2: Reflections (synthesized insights from observations)
CREATE TABLE IF NOT EXISTS memory_reflections (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  -- JSON array of observation IDs that fed into this reflection
  source_observation_ids_json TEXT NOT NULL DEFAULT '[]',
  -- The synthesized insight text
  insight TEXT NOT NULL,
  -- Importance score (1-10)
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  -- How abstract this reflection is (1 = concrete, 3 = high-level strategy)
  abstraction_level INTEGER NOT NULL DEFAULT 1 CHECK (abstraction_level >= 1 AND abstraction_level <= 3),
  -- JSON array of keyword tags for retrieval matching
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ref_agent ON memory_reflections(agent_id);
CREATE INDEX IF NOT EXISTS idx_ref_agent_importance ON memory_reflections(agent_id, importance DESC);

-- Layer 3: Plans (actionable strategies from reflections)
CREATE TABLE IF NOT EXISTS memory_plans (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  -- JSON array of reflection IDs that informed this plan
  source_reflection_ids_json TEXT NOT NULL DEFAULT '[]',
  -- The plan text (actionable strategy)
  plan_text TEXT NOT NULL,
  -- Status: active, applied, superseded, expired
  status TEXT NOT NULL DEFAULT 'active',
  -- Importance score (1-10)
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  -- JSON array of keyword tags for retrieval matching
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  -- When this plan was last applied in a battle
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_agent ON memory_plans(agent_id);
CREATE INDEX IF NOT EXISTS idx_plan_agent_status ON memory_plans(agent_id, status);
