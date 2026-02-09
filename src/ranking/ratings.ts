/**
 * HUNGERNADS - Rating Manager
 *
 * D1 integration for TrueSkill ratings. Manages persistence, updates,
 * and leaderboard queries for the three-category rating system.
 *
 * Schema:
 *   agent_ratings(agent_id, category, mu, sigma, battles_counted, last_updated)
 *   agent_rating_history(id, agent_id, battle_id, category, mu_before, sigma_before,
 *                        mu_after, sigma_after, performance_score, recorded_at)
 *
 * The rating_history table stores per-battle snapshots for bootstrap CI computation.
 */

import {
  createRating,
  conservativeRating,
  computeComposite,
  updateFfa,
  deriveCategoryPlacements,
  bootstrapCI,
  DEFAULT_MU,
  DEFAULT_SIGMA,
  type Rating,
  type RatingCategory,
  type AgentRatings,
  type BattlePerformance,
  type ConfidenceInterval,
} from './trueskill';

// ─── D1 Row Types ─────────────────────────────────────────────────────────────

export interface AgentRatingRow {
  agent_id: string;
  category: string; // 'prediction' | 'combat' | 'survival' | 'composite'
  mu: number;
  sigma: number;
  battles_counted: number;
  last_updated: string;
}

export interface RatingHistoryRow {
  id: string;
  agent_id: string;
  battle_id: string;
  category: string;
  mu_before: number;
  sigma_before: number;
  mu_after: number;
  sigma_after: number;
  performance_score: number;
  recorded_at: string;
}

// ─── Rating Manager ───────────────────────────────────────────────────────────

export class RatingManager {
  constructor(private db: D1Database) {}

  /**
   * Ensure the agent_ratings and agent_rating_history tables exist.
   * Safe to call multiple times (idempotent).
   */
  async ensureTables(): Promise<void> {
    await this.db.batch([
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS agent_ratings (
          agent_id TEXT NOT NULL,
          category TEXT NOT NULL,
          mu REAL NOT NULL DEFAULT 25.0,
          sigma REAL NOT NULL DEFAULT 8.333,
          battles_counted INTEGER NOT NULL DEFAULT 0,
          last_updated TEXT NOT NULL,
          PRIMARY KEY (agent_id, category)
        )
      `),
      this.db.prepare(`
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
        )
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_rating_history_agent
        ON agent_rating_history (agent_id, category)
      `),
    ]);
  }

  // ─── Read Operations ──────────────────────────────────────────────────────

  /**
   * Get all ratings for a single agent.
   * Returns default ratings if the agent has no rating history.
   */
  async getAgentRatings(agentId: string): Promise<AgentRatings> {
    await this.ensureTables();

    const result = await this.db
      .prepare('SELECT * FROM agent_ratings WHERE agent_id = ?')
      .bind(agentId)
      .all<AgentRatingRow>();

    const ratings: Record<string, Rating> = {};
    let battlesCounted = 0;

    for (const row of result.results) {
      ratings[row.category] = { mu: row.mu, sigma: row.sigma };
      if (row.battles_counted > battlesCounted) {
        battlesCounted = row.battles_counted;
      }
    }

    const prediction = ratings['prediction'] ?? createRating();
    const combat = ratings['combat'] ?? createRating();
    const survival = ratings['survival'] ?? createRating();
    const composite = ratings['composite'] ?? computeComposite(prediction, combat, survival);

    return {
      prediction,
      combat,
      survival,
      composite,
      conservativeEstimate: conservativeRating(composite),
      battlesCounted,
    };
  }

  /**
   * Get ratings for multiple agents at once.
   * More efficient than calling getAgentRatings() in a loop.
   */
  async getBulkRatings(agentIds: string[]): Promise<Map<string, AgentRatings>> {
    await this.ensureTables();

    if (agentIds.length === 0) return new Map();

    const placeholders = agentIds.map(() => '?').join(', ');
    const result = await this.db
      .prepare(`SELECT * FROM agent_ratings WHERE agent_id IN (${placeholders})`)
      .bind(...agentIds)
      .all<AgentRatingRow>();

    // Group by agent_id
    const byAgent = new Map<string, AgentRatingRow[]>();
    for (const row of result.results) {
      const rows = byAgent.get(row.agent_id) ?? [];
      rows.push(row);
      byAgent.set(row.agent_id, rows);
    }

    const ratings = new Map<string, AgentRatings>();
    for (const agentId of agentIds) {
      const agentRows = byAgent.get(agentId) ?? [];

      const ratingMap: Record<string, Rating> = {};
      let battlesCounted = 0;

      for (const row of agentRows) {
        ratingMap[row.category] = { mu: row.mu, sigma: row.sigma };
        if (row.battles_counted > battlesCounted) {
          battlesCounted = row.battles_counted;
        }
      }

      const prediction = ratingMap['prediction'] ?? createRating();
      const combat = ratingMap['combat'] ?? createRating();
      const survival = ratingMap['survival'] ?? createRating();
      const composite = ratingMap['composite'] ?? computeComposite(prediction, combat, survival);

      ratings.set(agentId, {
        prediction,
        combat,
        survival,
        composite,
        conservativeEstimate: conservativeRating(composite),
        battlesCounted,
      });
    }

    return ratings;
  }

  // ─── Write Operations ─────────────────────────────────────────────────────

  /**
   * Update ratings for all agents in a completed battle.
   *
   * This is the main entry point called after a battle ends.
   * It:
   *   1. Fetches current ratings for all participating agents
   *   2. Derives category-specific placement orders
   *   3. Runs TrueSkill FFA update for each category
   *   4. Computes new composite ratings
   *   5. Persists all updates + history to D1
   *
   * @param battleId The completed battle's ID.
   * @param performances Per-agent performance data from the battle.
   */
  async updateBattleRatings(
    battleId: string,
    performances: BattlePerformance[],
  ): Promise<void> {
    await this.ensureTables();

    const agentIds = performances.map((p) => p.agentId);
    const currentRatings = await this.getBulkRatings(agentIds);

    // Derive category-specific placement orders
    const categoryPlacements = deriveCategoryPlacements(performances, currentRatings);

    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];

    // Process each category
    const categories: RatingCategory[] = ['prediction', 'combat', 'survival'];
    const updatedCategoryRatings = new Map<string, Record<string, Rating>>();

    // Initialize the nested map
    for (const agentId of agentIds) {
      updatedCategoryRatings.set(agentId, {});
    }

    for (const category of categories) {
      const placements = categoryPlacements.get(category);
      if (!placements || placements.length < 2) continue;

      const updated = updateFfa(placements);

      for (const [agentId, newRating] of updated) {
        const current = currentRatings.get(agentId);
        const before = current ? current[category] : createRating();
        const battlesCounted = (current?.battlesCounted ?? 0) + 1;

        // Store updated category rating
        updatedCategoryRatings.get(agentId)![category] = newRating;

        // Compute performance score for this category (mu delta)
        const performanceScore = newRating.mu - before.mu;

        // Upsert agent_ratings
        statements.push(
          this.db
            .prepare(
              `INSERT INTO agent_ratings (agent_id, category, mu, sigma, battles_counted, last_updated)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(agent_id, category) DO UPDATE SET
                 mu = excluded.mu,
                 sigma = excluded.sigma,
                 battles_counted = excluded.battles_counted,
                 last_updated = excluded.last_updated`,
            )
            .bind(agentId, category, newRating.mu, newRating.sigma, battlesCounted, now),
        );

        // Insert history record
        const historyId = crypto.randomUUID();
        statements.push(
          this.db
            .prepare(
              `INSERT INTO agent_rating_history (id, agent_id, battle_id, category, mu_before, sigma_before, mu_after, sigma_after, performance_score, recorded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              historyId,
              agentId,
              battleId,
              category,
              before.mu,
              before.sigma,
              newRating.mu,
              newRating.sigma,
              performanceScore,
              now,
            ),
        );
      }
    }

    // Compute and persist composite ratings
    for (const agentId of agentIds) {
      const catRatings = updatedCategoryRatings.get(agentId)!;
      const current = currentRatings.get(agentId);

      const prediction = catRatings['prediction'] ?? current?.prediction ?? createRating();
      const combat = catRatings['combat'] ?? current?.combat ?? createRating();
      const survival = catRatings['survival'] ?? current?.survival ?? createRating();

      const composite = computeComposite(prediction, combat, survival);
      const battlesCounted = (current?.battlesCounted ?? 0) + 1;

      statements.push(
        this.db
          .prepare(
            `INSERT INTO agent_ratings (agent_id, category, mu, sigma, battles_counted, last_updated)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(agent_id, category) DO UPDATE SET
               mu = excluded.mu,
               sigma = excluded.sigma,
               battles_counted = excluded.battles_counted,
               last_updated = excluded.last_updated`,
          )
          .bind(agentId, 'composite', composite.mu, composite.sigma, battlesCounted, now),
      );

      // Composite history
      const historyId = crypto.randomUUID();
      const prevComposite = current?.composite ?? createRating();
      statements.push(
        this.db
          .prepare(
            `INSERT INTO agent_rating_history (id, agent_id, battle_id, category, mu_before, sigma_before, mu_after, sigma_after, performance_score, recorded_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            historyId,
            agentId,
            battleId,
            'composite',
            prevComposite.mu,
            prevComposite.sigma,
            composite.mu,
            composite.sigma,
            composite.mu - prevComposite.mu,
            now,
          ),
      );
    }

    // Execute all statements in a batch
    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  /**
   * Get the TrueSkill leaderboard: agents ranked by composite conservative estimate.
   * Only includes agents with at least `minBattles` recorded.
   */
  async getLeaderboard(
    limit: number = 20,
    minBattles: number = 1,
  ): Promise<TrueSkillLeaderboardEntry[]> {
    await this.ensureTables();

    const result = await this.db
      .prepare(
        `SELECT ar.agent_id, ar.mu, ar.sigma, ar.battles_counted,
                a.class as agent_class, a.name as agent_name
         FROM agent_ratings ar
         LEFT JOIN agents a ON a.id = ar.agent_id
         WHERE ar.category = 'composite'
           AND ar.battles_counted >= ?
         ORDER BY (ar.mu - 3 * ar.sigma) DESC
         LIMIT ?`,
      )
      .bind(minBattles, limit)
      .all<{
        agent_id: string;
        mu: number;
        sigma: number;
        battles_counted: number;
        agent_class: string | null;
        agent_name: string | null;
      }>();

    const entries: TrueSkillLeaderboardEntry[] = [];

    for (const row of result.results) {
      // Fetch category breakdowns
      const catResult = await this.db
        .prepare(
          `SELECT category, mu, sigma FROM agent_ratings
           WHERE agent_id = ? AND category != 'composite'`,
        )
        .bind(row.agent_id)
        .all<{ category: string; mu: number; sigma: number }>();

      const categories: Record<string, { mu: number; sigma: number; conservative: number }> = {};
      for (const cat of catResult.results) {
        categories[cat.category] = {
          mu: round3(cat.mu),
          sigma: round3(cat.sigma),
          conservative: round3(cat.mu - 3 * cat.sigma),
        };
      }

      entries.push({
        agentId: row.agent_id,
        agentName: row.agent_name ?? row.agent_id.slice(0, 8),
        agentClass: row.agent_class ?? 'UNKNOWN',
        composite: {
          mu: round3(row.mu),
          sigma: round3(row.sigma),
          conservative: round3(row.mu - 3 * row.sigma),
        },
        categories,
        battlesCounted: row.battles_counted,
      });
    }

    return entries;
  }

  // ─── Confidence Intervals ─────────────────────────────────────────────────

  /**
   * Compute bootstrap confidence intervals for an agent's ratings.
   * Uses the agent_rating_history table for per-battle performance scores.
   *
   * @param agentId The agent to compute CIs for.
   * @param category Rating category (or 'composite').
   * @param numSamples Bootstrap sample count (default 200).
   * @returns ConfidenceInterval or null if insufficient data.
   */
  async getConfidenceInterval(
    agentId: string,
    category: string = 'composite',
    numSamples: number = 200,
  ): Promise<ConfidenceInterval | null> {
    await this.ensureTables();

    // Fetch performance scores from history
    const result = await this.db
      .prepare(
        `SELECT performance_score FROM agent_rating_history
         WHERE agent_id = ? AND category = ?
         ORDER BY recorded_at ASC`,
      )
      .bind(agentId, category)
      .all<{ performance_score: number }>();

    const scores = result.results.map((r) => r.performance_score);
    if (scores.length < 3) return null;

    // Get current rating
    const ratings = await this.getAgentRatings(agentId);
    const baseRating =
      category === 'composite'
        ? ratings.composite
        : category === 'prediction'
          ? ratings.prediction
          : category === 'combat'
            ? ratings.combat
            : ratings.survival;

    return bootstrapCI(scores, baseRating, numSamples);
  }

  /**
   * Get comprehensive rating details for a single agent, including
   * all category ratings, composite, and confidence intervals.
   */
  async getDetailedRatings(agentId: string): Promise<DetailedAgentRatings> {
    const ratings = await this.getAgentRatings(agentId);

    // Compute CIs for each category and composite
    const [predCI, combatCI, survivalCI, compositeCI] = await Promise.all([
      this.getConfidenceInterval(agentId, 'prediction'),
      this.getConfidenceInterval(agentId, 'combat'),
      this.getConfidenceInterval(agentId, 'survival'),
      this.getConfidenceInterval(agentId, 'composite'),
    ]);

    // Fetch rating history for sparkline data
    const historyResult = await this.db
      .prepare(
        `SELECT category, mu_after, recorded_at
         FROM agent_rating_history
         WHERE agent_id = ? AND category = 'composite'
         ORDER BY recorded_at ASC
         LIMIT 50`,
      )
      .bind(agentId)
      .all<{ category: string; mu_after: number; recorded_at: string }>();

    const ratingHistory = historyResult.results.map((r) => ({
      mu: round3(r.mu_after),
      timestamp: r.recorded_at,
    }));

    return {
      agentId,
      ratings: {
        prediction: {
          mu: round3(ratings.prediction.mu),
          sigma: round3(ratings.prediction.sigma),
          conservative: round3(conservativeRating(ratings.prediction)),
          ci: predCI,
        },
        combat: {
          mu: round3(ratings.combat.mu),
          sigma: round3(ratings.combat.sigma),
          conservative: round3(conservativeRating(ratings.combat)),
          ci: combatCI,
        },
        survival: {
          mu: round3(ratings.survival.mu),
          sigma: round3(ratings.survival.sigma),
          conservative: round3(conservativeRating(ratings.survival)),
          ci: survivalCI,
        },
        composite: {
          mu: round3(ratings.composite.mu),
          sigma: round3(ratings.composite.sigma),
          conservative: round3(conservativeRating(ratings.composite)),
          ci: compositeCI,
        },
      },
      conservativeEstimate: round3(ratings.conservativeEstimate),
      battlesCounted: ratings.battlesCounted,
      ratingHistory,
    };
  }
}

// ─── Response Types ───────────────────────────────────────────────────────────

export interface TrueSkillLeaderboardEntry {
  agentId: string;
  agentName: string;
  agentClass: string;
  composite: {
    mu: number;
    sigma: number;
    conservative: number;
  };
  categories: Record<string, {
    mu: number;
    sigma: number;
    conservative: number;
  }>;
  battlesCounted: number;
}

export interface CategoryRatingDetail {
  mu: number;
  sigma: number;
  conservative: number;
  ci: ConfidenceInterval | null;
}

export interface DetailedAgentRatings {
  agentId: string;
  ratings: {
    prediction: CategoryRatingDetail;
    combat: CategoryRatingDetail;
    survival: CategoryRatingDetail;
    composite: CategoryRatingDetail;
  };
  conservativeEstimate: number;
  battlesCounted: number;
  ratingHistory: Array<{ mu: number; timestamp: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ─── Battle Performance Extraction ────────────────────────────────────────────

/**
 * Extract BattlePerformance data from a completed battle's D1 records.
 *
 * Queries epoch_actions for the given battle to compute per-agent metrics:
 * - Prediction accuracy (from prediction results)
 * - Damage dealt/taken (from combat actions)
 * - Kills and survival (from battle_records)
 *
 * @param db D1 database instance.
 * @param battleId The completed battle's ID.
 * @returns Array of BattlePerformance, one per agent.
 */
export async function extractBattlePerformances(
  db: D1Database,
  battleId: string,
): Promise<BattlePerformance[]> {
  // Get battle records for placement order and basic stats
  const recordsResult = await db
    .prepare(
      `SELECT agent_id, result, epochs_survived, kills, agent_class
       FROM battle_records
       WHERE battle_id = ?
       ORDER BY
         CASE WHEN result = 'win' THEN 0 ELSE 1 END ASC,
         epochs_survived DESC,
         kills DESC`,
    )
    .bind(battleId)
    .all<{
      agent_id: string;
      result: string;
      epochs_survived: number;
      kills: number;
      agent_class: string;
    }>();

  if (recordsResult.results.length === 0) return [];

  // Assign placements: winner = 1, then by survival order
  const records = recordsResult.results;
  const performances: BattlePerformance[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    performances.push({
      agentId: r.agent_id,
      placement: i + 1,
      kills: r.kills,
      epochsSurvived: r.epochs_survived,
      predictionAccuracy: 0, // Will be filled below
      damageDealt: r.kills * 100, // Approximate: kills as proxy for damage dealt
      damageTaken: 0, // Approximate: less survived = more damage taken
    });
  }

  // Compute prediction accuracy from epoch_actions
  // Get all epochs for this battle
  const epochsResult = await db
    .prepare('SELECT id FROM epochs WHERE battle_id = ?')
    .bind(battleId)
    .all<{ id: string }>();

  if (epochsResult.results.length > 0) {
    const epochIds = epochsResult.results.map((e) => e.id);

    // Aggregate prediction results per agent across all epochs
    const agentPredictions = new Map<string, { correct: number; total: number }>();

    for (const epochId of epochIds) {
      const actionsResult = await db
        .prepare('SELECT agent_id, prediction_json FROM epoch_actions WHERE epoch_id = ?')
        .bind(epochId)
        .all<{ agent_id: string; prediction_json: string | null }>();

      for (const action of actionsResult.results) {
        if (!action.prediction_json) continue;

        try {
          const pred = JSON.parse(action.prediction_json) as {
            correct?: boolean;
            hpChange?: number;
          };
          const stats = agentPredictions.get(action.agent_id) ?? { correct: 0, total: 0 };
          stats.total += 1;
          // If prediction_json includes a "correct" field or positive hpChange
          if (pred.correct === true || (pred.hpChange !== undefined && pred.hpChange > 0)) {
            stats.correct += 1;
          }
          agentPredictions.set(action.agent_id, stats);
        } catch {
          // Skip malformed prediction data
        }
      }
    }

    // Apply prediction accuracy to performances
    for (const perf of performances) {
      const stats = agentPredictions.get(perf.agentId);
      if (stats && stats.total > 0) {
        perf.predictionAccuracy = stats.correct / stats.total;
      }
    }
  }

  // Approximate damage taken: agents that died earlier took more proportional damage
  const maxEpochs = Math.max(...performances.map((p) => p.epochsSurvived), 1);
  for (const perf of performances) {
    // Agents that died early took more damage relative to their survival
    const survivalRatio = perf.epochsSurvived / maxEpochs;
    perf.damageTaken = Math.round((1 - survivalRatio) * 1000);
  }

  return performances;
}
