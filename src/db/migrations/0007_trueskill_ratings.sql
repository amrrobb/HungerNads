-- HUNGERNADS - TrueSkill Rating System
--
-- Multi-dimensional agent ratings using Microsoft's TrueSkill algorithm.
-- Each agent has ratings in three categories (prediction, combat, survival)
-- plus a weighted composite rating used for the primary leaderboard.
--
-- agent_ratings: Current rating state per agent per category.
-- agent_rating_history: Per-battle snapshots for bootstrap CI computation.

CREATE TABLE IF NOT EXISTS agent_ratings (
  agent_id TEXT NOT NULL,
  category TEXT NOT NULL,  -- 'prediction', 'combat', 'survival', 'composite'
  mu REAL NOT NULL DEFAULT 25.0,
  sigma REAL NOT NULL DEFAULT 8.333,
  battles_counted INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL,
  PRIMARY KEY (agent_id, category)
);

CREATE TABLE IF NOT EXISTS agent_rating_history (
  id TEXT NOT NULL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  battle_id TEXT NOT NULL,
  category TEXT NOT NULL,
  mu_before REAL NOT NULL,
  sigma_before REAL NOT NULL,
  mu_after REAL NOT NULL,
  sigma_after REAL NOT NULL,
  performance_score REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL
);

-- Index for efficient per-agent history lookups (used by bootstrap CI)
CREATE INDEX IF NOT EXISTS idx_rating_history_agent
  ON agent_rating_history (agent_id, category);

-- Index for per-battle lookups (e.g., "what changed in battle X")
CREATE INDEX IF NOT EXISTS idx_rating_history_battle
  ON agent_rating_history (battle_id);
