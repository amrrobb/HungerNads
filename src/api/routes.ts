/**
 * HUNGERNADS - API Routes
 *
 * REST endpoints for battle management, agent info, betting, and leaderboards.
 * Uses Hono for routing with CORS middleware.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../index';
import { AgentProfileBuilder, getAgentLeaderboard } from '../learning/profiles';
import { AgentMemory } from '../learning/memory';
import {
  getBattle,
  getEpochsByBattle,
  getEpochActions,
  insertBattle,
  insertAgent,
  getAgentWins,
  getAgentBattleCount,
  checkFaucetEligibility,
  insertFaucetClaim,
  getUserBetCount,
  getUserSponsorCount,
  FAUCET_TIERS,
  getTotalBurnedStats,
  getTotalFaucetDistributed,
  type BattleRow,
  type FaucetClaimRow,
} from '../db/schema';
import { AGENT_CLASSES, AgentClassSchema, AssetSchema } from '../agents';
import type { AgentClass } from '../agents';
import { MIN_AGENTS, MAX_AGENTS } from '../arena/arena';
import { DEFAULT_BATTLE_CONFIG, type BattleConfig } from '../durable-objects/arena';
import {
  SponsorshipManager,
  BettingPool,
  calculateOdds,
  buildOddsInputs,
  parseSponsorTier,
  TIER_CONFIGS,
  SPONSOR_TIERS,
} from '../betting';
import type { SponsorTier } from '../betting';
import {
  createNadFunClient,
  parseEther,
  formatEther,
  type NadFunClient,
  type Address,
} from '../chain/nadfun';
import { createChainClient } from '../chain/client';

// ─── App Setup ──────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// CORS for dashboard
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ─── Health / Root ─────────────────────────────────────────────

app.get('/health', (c) => {
  return c.json({
    status: 'alive',
    service: 'hungernads',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (c) => {
  return c.json({
    name: 'HUNGERNADS',
    tagline: 'May the nads be ever in your favor.',
    version: '0.1.0',
    endpoints: {
      health: '/health',
      battleCreate: 'POST /battle/create',
      battleStart: 'POST /battle/start (legacy)',
      battleState: 'GET /battle/:id',
      battleEpochs: 'GET /battle/:id/epochs',
      battles: 'GET /battles',
      agentProfile: 'GET /agent/:id',
      agentLessons: 'GET /agent/:id/lessons',
      agentMatchups: 'GET /agent/:id/matchups',
      leaderboardAgents: 'GET /leaderboard/agents',
      leaderboardBettors: 'GET /leaderboard/bettors',
      battleOdds: 'GET /battle/:id/odds',
      battlePhase: 'GET /battle/:id/phase',
      battleSponsors: 'GET /battle/:id/sponsors',
      placeBet: 'POST /bet',
      settleBattle: 'POST /battle/:id/settle',
      betBuy: 'POST /bet/buy',
      betSell: 'POST /bet/sell',
      tokenPrice: 'GET /token/price',
      tokenProgress: 'GET /token/progress',
      tokenStats: 'GET /token/stats',
      sponsor: 'POST /sponsor',
      sponsorTiers: 'GET /sponsor/tiers',
      userBets: 'GET /user/:address/bets',
      battleStream: 'WS /battle/:id/stream',
      prices: 'GET /prices',
      faucetClaim: 'POST /faucet',
      faucetStatus: 'GET /faucet/status/:address',
    },
  });
});

// ─── Battle Management ────────────────────────────────────────

// Valid asset list for config validation
const VALID_ASSETS = AssetSchema.options as readonly string[];

/**
 * POST /battle/create
 *
 * Create a new battle with full configuration.
 *
 * Body (all fields optional — sensible defaults applied):
 *   - agentClasses:        AgentClass[]  — classes to include (default: one of each)
 *   - agentCount:          number        — how many agents to spawn (2–20). If agentClasses
 *                                          is also provided, agentCount is ignored.
 *   - maxEpochs:           number        — max epochs before timeout (default 100, range 5–500)
 *   - bettingWindowEpochs: number        — epochs betting stays open (default 3, range 0–50)
 *   - assets:              string[]      — assets agents can predict on (default all four)
 *
 * Response: { ok, battleId, config, agents, arena }
 */
app.post('/battle/create', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));

    // ── Parse & validate agentClasses ──────────────────────────────
    let agentClasses: AgentClass[];

    if (body.agentClasses) {
      if (!Array.isArray(body.agentClasses)) {
        return c.json({ error: 'agentClasses must be an array' }, 400);
      }
      // Validate each class
      for (const cls of body.agentClasses) {
        const parsed = AgentClassSchema.safeParse(cls);
        if (!parsed.success) {
          return c.json(
            {
              error: `Invalid agent class '${cls}'. Valid classes: ${AGENT_CLASSES.join(', ')}`,
            },
            400,
          );
        }
      }
      agentClasses = body.agentClasses as AgentClass[];
    } else if (typeof body.agentCount === 'number') {
      // Generate agentClasses from agentCount by cycling through all classes
      const count = body.agentCount;
      if (!Number.isInteger(count) || count < MIN_AGENTS || count > MAX_AGENTS) {
        return c.json(
          {
            error: `agentCount must be an integer between ${MIN_AGENTS} and ${MAX_AGENTS}`,
          },
          400,
        );
      }
      agentClasses = [];
      for (let i = 0; i < count; i++) {
        agentClasses.push(AGENT_CLASSES[i % AGENT_CLASSES.length]);
      }
    } else {
      // Default: one of each class
      agentClasses = [...AGENT_CLASSES];
    }

    // Enforce agent count limits
    if (agentClasses.length < MIN_AGENTS) {
      return c.json(
        { error: `Need at least ${MIN_AGENTS} agents, got ${agentClasses.length}` },
        400,
      );
    }
    if (agentClasses.length > MAX_AGENTS) {
      return c.json(
        { error: `Cannot exceed ${MAX_AGENTS} agents, got ${agentClasses.length}` },
        400,
      );
    }

    // ── Parse & validate maxEpochs ─────────────────────────────────
    let maxEpochs = DEFAULT_BATTLE_CONFIG.maxEpochs;
    if (body.maxEpochs !== undefined) {
      if (typeof body.maxEpochs !== 'number' || !Number.isInteger(body.maxEpochs)) {
        return c.json({ error: 'maxEpochs must be an integer' }, 400);
      }
      if (body.maxEpochs < 5 || body.maxEpochs > 500) {
        return c.json({ error: 'maxEpochs must be between 5 and 500' }, 400);
      }
      maxEpochs = body.maxEpochs;
    }

    // ── Parse & validate bettingWindowEpochs ───────────────────────
    let bettingWindowEpochs = DEFAULT_BATTLE_CONFIG.bettingWindowEpochs;
    if (body.bettingWindowEpochs !== undefined) {
      if (typeof body.bettingWindowEpochs !== 'number' || !Number.isInteger(body.bettingWindowEpochs)) {
        return c.json({ error: 'bettingWindowEpochs must be an integer' }, 400);
      }
      if (body.bettingWindowEpochs < 0 || body.bettingWindowEpochs > 50) {
        return c.json({ error: 'bettingWindowEpochs must be between 0 and 50' }, 400);
      }
      if (body.bettingWindowEpochs > maxEpochs) {
        return c.json(
          { error: `bettingWindowEpochs (${body.bettingWindowEpochs}) cannot exceed maxEpochs (${maxEpochs})` },
          400,
        );
      }
      bettingWindowEpochs = body.bettingWindowEpochs;
    }

    // ── Parse & validate assets ────────────────────────────────────
    let assets = [...DEFAULT_BATTLE_CONFIG.assets];
    if (body.assets !== undefined) {
      if (!Array.isArray(body.assets) || body.assets.length === 0) {
        return c.json({ error: 'assets must be a non-empty array' }, 400);
      }
      for (const asset of body.assets) {
        if (!VALID_ASSETS.includes(asset)) {
          return c.json(
            { error: `Invalid asset '${asset}'. Valid assets: ${VALID_ASSETS.join(', ')}` },
            400,
          );
        }
      }
      // Deduplicate
      assets = [...new Set(body.assets as string[])];
    }

    // ── Build battle config ────────────────────────────────────────
    const battleConfig: BattleConfig = {
      maxEpochs,
      bettingWindowEpochs,
      assets,
    };

    // ── Generate IDs ───────────────────────────────────────────────
    const battleId = crypto.randomUUID();
    const agentIds: string[] = [];
    for (let i = 0; i < agentClasses.length; i++) {
      agentIds.push(crypto.randomUUID());
    }

    // ── Persist agents to D1 ───────────────────────────────────────
    for (let i = 0; i < agentIds.length; i++) {
      const agentClass = agentClasses[i];
      const agentName = `${agentClass}-${agentIds[i].slice(0, 6)}`;
      await insertAgent(c.env.DB, {
        id: agentIds[i],
        class: agentClass,
        name: agentName,
        created_at: new Date().toISOString(),
      });
    }

    // ── Persist battle to D1 with betting phase OPEN ───────────────
    await insertBattle(c.env.DB, {
      id: battleId,
      status: 'active',
      started_at: new Date().toISOString(),
      epoch_count: 0,
      betting_phase: 'OPEN',
    });

    // ── Start via ArenaDO ──────────────────────────────────────────
    const arenaId = c.env.ARENA_DO.idFromName(battleId);
    const arenaStub = c.env.ARENA_DO.get(arenaId);

    const agentNames = agentIds.map(
      (id: string, i: number) => `${agentClasses[i]}-${id.slice(0, 6)}`,
    );

    const startResponse = await arenaStub.fetch(
      new Request('http://arena/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId,
          agentIds,
          agentClasses,
          agentNames,
          config: battleConfig,
        }),
      }),
    );

    const arenaResult = await startResponse.json() as Record<string, unknown>;

    // ── On-chain registration (non-blocking) ──────────────────────
    const chainClient = createChainClient(c.env);
    if (chainClient) {
      const numericAgentIds = agentIds.map((_: string, i: number) => i + 1);
      const chainWork = (async () => {
        try {
          await chainClient.registerBattle(battleId, numericAgentIds);
          console.log(`[chain] Battle ${battleId} registered on-chain`);
        } catch (err) {
          console.error(`[chain] registerBattle failed for ${battleId}:`, err);
        }
        try {
          await chainClient.createBettingPool(battleId);
          console.log(`[chain] Betting pool created on-chain for ${battleId}`);
        } catch (err) {
          console.error(`[chain] createBettingPool failed for ${battleId}:`, err);
        }
        try {
          await chainClient.activateBattle(battleId);
          console.log(`[chain] Battle ${battleId} activated on-chain`);
        } catch (err) {
          console.error(`[chain] activateBattle failed for ${battleId}:`, err);
        }
      })();
      c.executionCtx.waitUntil(chainWork);
    }

    return c.json({
      ok: true,
      battleId,
      config: battleConfig,
      agents: agentIds.map((id, i) => ({
        id,
        class: agentClasses[i],
        name: `${agentClasses[i]}-${id.slice(0, 6)}`,
      })),
      arena: arenaResult,
    });
  } catch (error) {
    console.error('Failed to create battle:', error);
    return c.json(
      { error: 'Failed to create battle', detail: String(error) },
      500,
    );
  }
});

/**
 * POST /battle/start
 *
 * Legacy endpoint — create a new battle with default config.
 * Use POST /battle/create for full configuration control.
 *
 * Optional body: { agentClasses?: AgentClass[] } (defaults to one of each).
 */
app.post('/battle/start', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const agentClasses = body.agentClasses ?? [...AGENT_CLASSES];

    if (!Array.isArray(agentClasses) || agentClasses.length < MIN_AGENTS) {
      return c.json(
        { error: `Provide at least ${MIN_AGENTS} agent classes, got ${Array.isArray(agentClasses) ? agentClasses.length : 0}` },
        400,
      );
    }
    if (agentClasses.length > MAX_AGENTS) {
      return c.json(
        { error: `Cannot exceed ${MAX_AGENTS} agents per battle, got ${agentClasses.length}` },
        400,
      );
    }

    // Generate a stable battle ID to use as the DO key
    const battleId = crypto.randomUUID();

    // Generate agent IDs for the roster
    const agentIds: string[] = [];
    for (let i = 0; i < agentClasses.length; i++) {
      agentIds.push(crypto.randomUUID());
    }

    // Persist agents to D1
    for (let i = 0; i < agentIds.length; i++) {
      const agentClass = agentClasses[i];
      const agentName = `${agentClass}-${agentIds[i].slice(0, 6)}`;
      await insertAgent(c.env.DB, {
        id: agentIds[i],
        class: agentClass,
        name: agentName,
        created_at: new Date().toISOString(),
      });
    }

    // Persist battle to D1 with betting phase OPEN
    await insertBattle(c.env.DB, {
      id: battleId,
      status: 'active',
      started_at: new Date().toISOString(),
      epoch_count: 0,
      betting_phase: 'OPEN',
    });

    // Get ArenaDO stub using the battleId as the DO name
    const arenaId = c.env.ARENA_DO.idFromName(battleId);
    const arenaStub = c.env.ARENA_DO.get(arenaId);

    // Build agent names for the DO
    const agentNames = agentIds.map(
      (id: string, i: number) => `${agentClasses[i]}-${id.slice(0, 6)}`,
    );

    // Start the battle via ArenaDO (pass battleId, classes, and names)
    const startResponse = await arenaStub.fetch(
      new Request('http://arena/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battleId, agentIds, agentClasses, agentNames }),
      }),
    );

    const arenaResult = await startResponse.json() as Record<string, unknown>;

    // ── On-chain registration (non-blocking) ──────────────────────
    // Register the battle + create betting pool on the smart contracts.
    // Uses waitUntil so the HTTP response isn't delayed by chain calls.
    // Gracefully skipped if env vars are missing (dev mode).
    const chainClient = createChainClient(c.env);
    if (chainClient) {
      const numericAgentIds = agentIds.map((_: string, i: number) => i + 1);
      const chainWork = (async () => {
        try {
          await chainClient.registerBattle(battleId, numericAgentIds);
          console.log(`[chain] Battle ${battleId} registered on-chain`);
        } catch (err) {
          console.error(`[chain] registerBattle failed for ${battleId}:`, err);
        }
        try {
          await chainClient.createBettingPool(battleId);
          console.log(`[chain] Betting pool created on-chain for ${battleId}`);
        } catch (err) {
          console.error(`[chain] createBettingPool failed for ${battleId}:`, err);
        }
        try {
          await chainClient.activateBattle(battleId);
          console.log(`[chain] Battle ${battleId} activated on-chain`);
        } catch (err) {
          console.error(`[chain] activateBattle failed for ${battleId}:`, err);
        }
      })();
      c.executionCtx.waitUntil(chainWork);
    }

    return c.json({
      ok: true,
      battleId,
      agents: agentIds.map((id, i) => ({
        id,
        class: agentClasses[i],
        name: `${agentClasses[i]}-${id.slice(0, 6)}`,
      })),
      arena: arenaResult,
    });
  } catch (error) {
    console.error('Failed to start battle:', error);
    return c.json(
      { error: 'Failed to start battle', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /battle/:id
 *
 * Get battle state from ArenaDO (agents, epoch, status, recent events).
 * Falls back to D1 if the DO has no state (e.g., completed battle).
 */
app.get('/battle/:id', async (c) => {
  try {
    const battleId = c.req.param('id');

    // Try ArenaDO first for live state
    const arenaId = c.env.ARENA_DO.idFromName(battleId);
    const arenaStub = c.env.ARENA_DO.get(arenaId);

    const stateResponse = await arenaStub.fetch(
      new Request('http://arena/state'),
    );

    if (stateResponse.ok) {
      const state = await stateResponse.json() as Record<string, unknown>;
      // Normalize agents from Record<string, BattleAgent> to array for dashboard
      if (state.agents && !Array.isArray(state.agents)) {
        state.agents = Object.values(state.agents);
      }
      return c.json(state);
    }

    // Fall back to D1 for historical data
    const battle = await getBattle(c.env.DB, battleId);
    if (!battle) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    return c.json(battle);
  } catch (error) {
    console.error('Failed to get battle:', error);
    return c.json(
      { error: 'Failed to get battle state', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /battle/:id/epochs
 *
 * List epoch results for a battle from D1, including per-epoch actions.
 */
app.get('/battle/:id/epochs', async (c) => {
  try {
    const battleId = c.req.param('id');

    // Verify battle exists
    const battle = await getBattle(c.env.DB, battleId);
    if (!battle) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const epochs = await getEpochsByBattle(c.env.DB, battleId);

    // Optionally include actions if ?actions=true
    const includeActions = c.req.query('actions') === 'true';
    if (includeActions) {
      const enriched = await Promise.all(
        epochs.map(async (epoch) => {
          const actions = await getEpochActions(c.env.DB, epoch.id);
          return { ...epoch, actions };
        }),
      );
      return c.json({ battleId, epochCount: enriched.length, epochs: enriched });
    }

    return c.json({ battleId, epochCount: epochs.length, epochs });
  } catch (error) {
    console.error('Failed to get epochs:', error);
    return c.json(
      { error: 'Failed to get epochs', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /battles
 *
 * List recent/active battles from D1.
 * Query params: ?status=active|completed|pending&limit=20
 */
app.get('/battles', async (c) => {
  try {
    const status = c.req.query('status');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

    let query: string;
    const bindings: unknown[] = [];

    if (status) {
      query = 'SELECT * FROM battles WHERE status = ? ORDER BY started_at DESC LIMIT ?';
      bindings.push(status, limit);
    } else {
      query = 'SELECT * FROM battles ORDER BY started_at DESC LIMIT ?';
      bindings.push(limit);
    }

    const result = await c.env.DB.prepare(query).bind(...bindings).all<BattleRow>();

    return c.json({
      battles: result.results,
      count: result.results.length,
    });
  } catch (error) {
    console.error('Failed to list battles:', error);
    return c.json(
      { error: 'Failed to list battles', detail: String(error) },
      500,
    );
  }
});

// ─── Agent Info ───────────────────────────────────────────────

/**
 * GET /agent/:id
 *
 * Full agent profile from AgentProfileBuilder (D1-based stats + lessons).
 */
app.get('/agent/:id', async (c) => {
  try {
    const agentId = c.req.param('id');
    const profileBuilder = new AgentProfileBuilder(c.env.DB);

    const profile = await profileBuilder.buildProfile(agentId);
    return c.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      return c.json({ error: 'Agent not found' }, 404);
    }
    console.error('Failed to get agent profile:', error);
    return c.json(
      { error: 'Failed to get agent profile', detail: message },
      500,
    );
  }
});

/**
 * GET /agent/:id/lessons
 *
 * Agent's lesson history from AgentMemory.
 * Query params: ?limit=20
 */
app.get('/agent/:id/lessons', async (c) => {
  try {
    const agentId = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

    const memory = new AgentMemory(c.env.DB);
    const lessons = await memory.getLessons(agentId, limit);

    return c.json({
      agentId,
      lessons,
      count: lessons.length,
    });
  } catch (error) {
    console.error('Failed to get agent lessons:', error);
    return c.json(
      { error: 'Failed to get agent lessons', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /agent/:id/matchups
 *
 * Win rates vs each class from AgentProfileBuilder.
 */
app.get('/agent/:id/matchups', async (c) => {
  try {
    const agentId = c.req.param('id');
    const profileBuilder = new AgentProfileBuilder(c.env.DB);

    const matchups = await profileBuilder.getMatchups(agentId);
    return c.json({ agentId, matchups });
  } catch (error) {
    console.error('Failed to get matchups:', error);
    return c.json(
      { error: 'Failed to get matchups', detail: String(error) },
      500,
    );
  }
});

// ─── Betting ──────────────────────────────────────────────────

/**
 * POST /bet
 *
 * Place a bet on an agent in a battle.
 */
app.post('/bet', async (c) => {
  try {
    const body = await c.req.json();
    const { battleId, userAddress, agentId, amount } = body as {
      battleId?: string;
      userAddress?: string;
      agentId?: string;
      amount?: number;
    };

    if (!battleId || !userAddress || !agentId || !amount) {
      return c.json(
        { error: 'Missing required fields: battleId, userAddress, agentId, amount' },
        400,
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return c.json({ error: 'amount must be a positive number' }, 400);
    }

    // Verify battle exists and is in a bettable state.
    const battle = await getBattle(c.env.DB, battleId);
    if (!battle) {
      return c.json({ error: 'Battle not found' }, 404);
    }
    if (battle.status !== 'betting' && battle.status !== 'active') {
      return c.json(
        { error: `Cannot bet on battle with status '${battle.status}'` },
        400,
      );
    }

    // Enforce betting phase gate: only accept bets when phase is OPEN.
    const bettingPhase = battle.betting_phase ?? 'OPEN';
    if (bettingPhase !== 'OPEN') {
      return c.json(
        {
          error: `Betting is ${bettingPhase.toLowerCase()} for this battle`,
          bettingPhase,
        },
        400,
      );
    }

    const pool = new BettingPool(c.env.DB);
    const result = await pool.placeBet(battleId, userAddress, agentId, amount);

    return c.json({
      ok: true,
      bet: result,
    });
  } catch (error) {
    console.error('Failed to place bet:', error);
    return c.json(
      { error: 'Failed to place bet', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /battle/:id/odds
 *
 * Get current odds for all agents in a battle.
 */
app.get('/battle/:id/odds', async (c) => {
  try {
    const battleId = c.req.param('id');
    const battle = await getBattle(c.env.DB, battleId);

    if (!battle) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    // Get the pool breakdown for this battle.
    const pool = new BettingPool(c.env.DB);
    const { total, perAgent } = await pool.getBattlePool(battleId);

    // Get latest agent HP from the most recent epoch actions.
    // We query the last epoch's actions to build the agent state snapshot.
    const epochs = await getEpochsByBattle(c.env.DB, battleId);
    const latestEpoch = epochs[epochs.length - 1];

    // Build agent HP map from epoch actions, or default to 1000 if no epochs yet.
    const agentHpMap: Record<string, { hp: number; maxHp: number; isAlive: boolean }> = {};

    if (latestEpoch) {
      const actions = await getEpochActions(c.env.DB, latestEpoch.id);
      for (const action of actions) {
        agentHpMap[action.agent_id] = {
          hp: action.hp_after ?? 1000,
          maxHp: 1000,
          isAlive: (action.hp_after ?? 1000) > 0,
        };
      }
    }

    // If no epoch data yet, we can't compute meaningful odds based on HP.
    // Return equal odds for all agents with bets.
    if (Object.keys(agentHpMap).length === 0) {
      // Fall back to agents from bet data — give each equal HP.
      const agentIds = Object.keys(perAgent);
      for (const id of agentIds) {
        agentHpMap[id] = { hp: 1000, maxHp: 1000, isAlive: true };
      }
    }

    // Fetch win rates for each agent.
    const winRates: Record<string, number> = {};
    for (const agentId of Object.keys(agentHpMap)) {
      const [wins, battles] = await Promise.all([
        getAgentWins(c.env.DB, agentId),
        getAgentBattleCount(c.env.DB, agentId),
      ]);
      winRates[agentId] = battles > 0 ? wins / battles : 0;
    }

    // Build inputs and calculate.
    const agents = Object.entries(agentHpMap).map(([id, state]) => ({
      id,
      ...state,
    }));
    const inputs = buildOddsInputs(agents, perAgent, winRates);
    const odds = calculateOdds(inputs);

    return c.json({
      battleId,
      totalPool: total,
      perAgent,
      odds,
    });
  } catch (error) {
    console.error('Failed to calculate odds:', error);
    return c.json(
      { error: 'Failed to calculate odds', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /battle/:id/phase
 *
 * Get the current betting phase for a battle.
 * Returns the phase from the ArenaDO (live state) with D1 fallback.
 *
 * Response: { battleId, bettingPhase: "OPEN"|"LOCKED"|"SETTLED", epoch, status }
 */
app.get('/battle/:id/phase', async (c) => {
  try {
    const battleId = c.req.param('id');

    // Try ArenaDO first for live state
    const arenaId = c.env.ARENA_DO.idFromName(battleId);
    const arenaStub = c.env.ARENA_DO.get(arenaId);

    const phaseResponse = await arenaStub.fetch(
      new Request('http://arena/phase'),
    );

    if (phaseResponse.ok) {
      const data = await phaseResponse.json();
      return c.json(data);
    }

    // Fall back to D1
    const battle = await getBattle(c.env.DB, battleId);
    if (!battle) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    return c.json({
      battleId: battle.id,
      bettingPhase: battle.betting_phase ?? 'OPEN',
      epoch: battle.epoch_count,
      status: battle.status,
    });
  } catch (error) {
    console.error('Failed to get betting phase:', error);
    return c.json(
      { error: 'Failed to get betting phase', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /user/:address/bets
 *
 * Get user's bet history.
 */
app.get('/user/:address/bets', async (c) => {
  try {
    const userAddress = c.req.param('address');
    const battleId = c.req.query('battleId'); // optional filter

    const pool = new BettingPool(c.env.DB);
    const bets = await pool.getUserBets(userAddress, battleId);

    return c.json({
      userAddress,
      bets,
      count: bets.length,
    });
  } catch (error) {
    console.error('Failed to get user bets:', error);
    return c.json(
      { error: 'Failed to get user bets', detail: String(error) },
      500,
    );
  }
});

// ─── Settlement ──────────────────────────────────────────────

/**
 * POST /battle/:id/settle
 *
 * Manually trigger bet settlement for a completed battle.
 * Idempotent — safe to call multiple times (skips if already settled).
 *
 * This is a fallback in case auto-settlement in ArenaDO fails.
 * Can also be called by admin scripts to reconcile missed settlements.
 */
app.post('/battle/:id/settle', async (c) => {
  try {
    const battleId = c.req.param('id');

    // First check D1 for battle status and winner
    let battle = await getBattle(c.env.DB, battleId);
    if (!battle) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    let winnerId = battle.winner_id;

    // If D1 doesn't have winner info yet, check the ArenaDO
    if (!winnerId || battle.status !== 'completed') {
      const arenaId = c.env.ARENA_DO.idFromName(battleId);
      const arenaStub = c.env.ARENA_DO.get(arenaId);
      const stateResponse = await arenaStub.fetch(new Request('http://arena/state'));

      if (stateResponse.ok) {
        const arenaState = (await stateResponse.json()) as {
          status?: string;
          winnerId?: string;
        };

        if (arenaState.status === 'completed' && arenaState.winnerId) {
          winnerId = arenaState.winnerId;
        }
      }
    }

    if (!winnerId) {
      return c.json(
        { error: 'Battle has no winner yet — cannot settle' },
        400,
      );
    }

    // Run settlement (idempotent — BettingPool skips if already settled)
    const pool = new BettingPool(c.env.DB);
    const settlement = await pool.settleBattle(battleId, winnerId);

    // Also settle on-chain (non-blocking best-effort)
    const chainClient = createChainClient(c.env);
    let onChainSettled = false;
    if (chainClient) {
      const chainWork = (async () => {
        try {
          // Use a simple numeric ID — the ArenaDO stores the real mapping,
          // but for manual settle we just need the betting contract to know the winner.
          // settleBets uses the same battleId hash regardless of numeric winner ID.
          await chainClient.settleBets(battleId, 1);
          onChainSettled = true;
          console.log(`[chain] Bets settled on-chain for ${battleId} via manual settle`);
        } catch (err) {
          console.error(`[chain] On-chain settleBets failed for ${battleId}:`, err);
        }
      })();
      c.executionCtx.waitUntil(chainWork);
    }

    return c.json({
      ok: true,
      battleId,
      winnerId,
      payouts: settlement.payouts,
      treasury: settlement.treasury,
      burn: settlement.burn,
      onChain: chainClient ? 'pending' : 'skipped',
    });
  } catch (error) {
    console.error('Failed to settle battle:', error);
    return c.json(
      { error: 'Failed to settle battle', detail: String(error) },
      500,
    );
  }
});

// ─── Sponsorship ──────────────────────────────────────────────

/**
 * POST /sponsor
 *
 * Send a tiered sponsorship to an agent. If tier is provided, uses the tier
 * system with cost validation and epoch targeting. Falls back to legacy
 * non-tiered flow if tier is omitted.
 *
 * Body:
 *   - battleId:       string  (required)
 *   - agentId:        string  (required)
 *   - sponsorAddress: string  (required)
 *   - amount:         number  (required) -- must match tier cost for tiered sponsorships
 *   - message:        string  (optional)
 *   - tier:           string  (optional) -- BREAD_RATION | MEDICINE_KIT | ARMOR_PLATING | WEAPON_CACHE | CORNUCOPIA
 *   - epochNumber:    number  (optional) -- target epoch for effects. Required if tier is set.
 */
app.post('/sponsor', async (c) => {
  try {
    const body = await c.req.json();
    const { battleId, agentId, amount, message, sponsorAddress, tier: tierStr, epochNumber } = body as {
      battleId?: string;
      agentId?: string;
      amount?: number;
      message?: string;
      sponsorAddress?: string;
      tier?: string;
      epochNumber?: number;
    };

    if (!battleId || !agentId || !sponsorAddress) {
      return c.json(
        { error: 'Missing required fields: battleId, agentId, sponsorAddress' },
        400,
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return c.json({ error: 'Amount must be a positive number' }, 400);
    }

    const manager = new SponsorshipManager(c.env.DB);

    // Tiered sponsorship flow
    if (tierStr) {
      const tier = parseSponsorTier(tierStr);
      if (!tier) {
        return c.json(
          {
            error: `Invalid tier '${tierStr}'. Valid tiers: ${SPONSOR_TIERS.join(', ')}`,
            tiers: Object.values(TIER_CONFIGS).map((t) => ({
              tier: t.tier,
              name: t.name,
              cost: t.cost,
              hpBoost: t.hpBoost,
              freeDefend: t.freeDefend,
              attackBoost: t.attackBoost,
              description: t.description,
            })),
          },
          400,
        );
      }

      if (typeof epochNumber !== 'number' || epochNumber < 1) {
        return c.json(
          { error: 'epochNumber is required for tiered sponsorships and must be >= 1' },
          400,
        );
      }

      const sponsorship = await manager.sponsorTiered(
        battleId,
        agentId,
        sponsorAddress,
        amount,
        message ?? '',
        tier,
        epochNumber,
      );

      return c.json({
        ok: true,
        sponsorship,
        tierConfig: TIER_CONFIGS[tier],
      });
    }

    // Legacy non-tiered flow
    const sponsorship = await manager.sponsor(
      battleId,
      agentId,
      sponsorAddress,
      amount,
      message ?? '',
    );

    return c.json({
      ok: true,
      sponsorship,
    });
  } catch (error) {
    console.error('Failed to create sponsorship:', error);
    return c.json(
      { error: 'Failed to create sponsorship', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /sponsor/tiers
 *
 * List all sponsorship tiers with their costs and effects.
 */
app.get('/sponsor/tiers', (c) => {
  const tiers = Object.values(TIER_CONFIGS).map((t) => ({
    tier: t.tier,
    name: t.name,
    cost: t.cost,
    hpBoost: t.hpBoost,
    freeDefend: t.freeDefend,
    attackBoost: t.attackBoost,
    description: t.description,
  }));

  return c.json({ tiers });
});

/**
 * GET /battle/:id/sponsors
 *
 * Get sponsorship feed for a battle.
 */
app.get('/battle/:id/sponsors', async (c) => {
  try {
    const battleId = c.req.param('id');
    const manager = new SponsorshipManager(c.env.DB);
    const sponsorships = await manager.getBattleSponsorships(battleId);

    return c.json({
      battleId,
      sponsorships,
      count: sponsorships.length,
    });
  } catch (error) {
    console.error('Failed to get sponsorships:', error);
    return c.json(
      { error: 'Failed to get sponsorships', detail: String(error) },
      500,
    );
  }
});

// ─── Faucet ──────────────────────────────────────────────────

/**
 * POST /faucet
 *
 * Claim free HNADS tokens from the faucet.
 * 3 tiers with different requirements:
 *   - Tier 1: 100 HNADS (no requirements, 1/day)
 *   - Tier 2: 500 HNADS (3+ bets placed, 1/day)
 *   - Tier 3: 1000 HNADS (2+ sponsorships, 1/day)
 *
 * Body:
 *   - walletAddress: string (required)
 *   - tier: number (required, 1-3)
 */
app.post('/faucet', async (c) => {
  try {
    const body = await c.req.json();
    const { walletAddress, tier } = body as {
      walletAddress?: string;
      tier?: number;
    };

    if (!walletAddress || !tier) {
      return c.json(
        { error: 'Missing required fields: walletAddress, tier' },
        400,
      );
    }

    // Validate tier
    if (![1, 2, 3].includes(tier)) {
      return c.json(
        { error: 'Invalid tier. Must be 1, 2, or 3.' },
        400,
      );
    }

    const tierConfig = FAUCET_TIERS[tier];

    // Check 24h rate limit
    const { eligible, nextClaimAt } = await checkFaucetEligibility(
      c.env.DB,
      walletAddress,
      tier,
    );

    if (!eligible) {
      return c.json(
        {
          error: `Already claimed tier ${tier} today`,
          nextClaimAt,
          tier,
          tierLabel: tierConfig.label,
        },
        429,
      );
    }

    // Check tier-specific requirements
    if (tier === 2) {
      const betCount = await getUserBetCount(c.env.DB, walletAddress);
      if (betCount < 3) {
        return c.json(
          {
            error: `Tier 2 requires 3+ bets placed. You have ${betCount}.`,
            tier,
            tierLabel: tierConfig.label,
            requirement: { betsNeeded: 3, betsPlaced: betCount },
          },
          403,
        );
      }
    }

    if (tier === 3) {
      const sponsorCount = await getUserSponsorCount(c.env.DB, walletAddress);
      if (sponsorCount < 2) {
        return c.json(
          {
            error: `Tier 3 requires 2+ sponsorships. You have ${sponsorCount}.`,
            tier,
            tierLabel: tierConfig.label,
            requirement: { sponsorsNeeded: 2, sponsorsPlaced: sponsorCount },
          },
          403,
        );
      }
    }

    // Record the claim
    const claim: FaucetClaimRow = {
      id: crypto.randomUUID(),
      wallet_address: walletAddress,
      tier,
      amount: tierConfig.amount,
      claimed_at: new Date().toISOString(),
    };

    await insertFaucetClaim(c.env.DB, claim);

    return c.json({
      ok: true,
      claim: {
        id: claim.id,
        tier,
        tierLabel: tierConfig.label,
        amount: tierConfig.amount,
        claimedAt: claim.claimed_at,
      },
    });
  } catch (error) {
    console.error('Failed to process faucet claim:', error);
    return c.json(
      { error: 'Failed to process faucet claim', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /faucet/status/:address
 *
 * Check faucet eligibility for all 3 tiers for a given wallet.
 * Returns per-tier status: eligible, nextClaimAt, requirements met.
 */
app.get('/faucet/status/:address', async (c) => {
  try {
    const walletAddress = c.req.param('address');

    // Check eligibility and requirements for all tiers in parallel
    const [
      tier1Eligibility,
      tier2Eligibility,
      tier3Eligibility,
      betCount,
      sponsorCount,
    ] = await Promise.all([
      checkFaucetEligibility(c.env.DB, walletAddress, 1),
      checkFaucetEligibility(c.env.DB, walletAddress, 2),
      checkFaucetEligibility(c.env.DB, walletAddress, 3),
      getUserBetCount(c.env.DB, walletAddress),
      getUserSponsorCount(c.env.DB, walletAddress),
    ]);

    const tiers = [
      {
        tier: 1,
        label: FAUCET_TIERS[1].label,
        amount: FAUCET_TIERS[1].amount,
        eligible: tier1Eligibility.eligible,
        nextClaimAt: tier1Eligibility.nextClaimAt,
        requirementsMet: true,
        requirements: null,
      },
      {
        tier: 2,
        label: FAUCET_TIERS[2].label,
        amount: FAUCET_TIERS[2].amount,
        eligible: tier2Eligibility.eligible && betCount >= 3,
        nextClaimAt: tier2Eligibility.nextClaimAt,
        requirementsMet: betCount >= 3,
        requirements: {
          betsNeeded: 3,
          betsPlaced: betCount,
        },
      },
      {
        tier: 3,
        label: FAUCET_TIERS[3].label,
        amount: FAUCET_TIERS[3].amount,
        eligible: tier3Eligibility.eligible && sponsorCount >= 2,
        nextClaimAt: tier3Eligibility.nextClaimAt,
        requirementsMet: sponsorCount >= 2,
        requirements: {
          sponsorsNeeded: 2,
          sponsorsPlaced: sponsorCount,
        },
      },
    ];

    // Total claimable right now
    const totalClaimable = tiers
      .filter((t) => t.eligible)
      .reduce((sum, t) => sum + t.amount, 0);

    return c.json({
      walletAddress,
      tiers,
      totalClaimable,
    });
  } catch (error) {
    console.error('Failed to check faucet status:', error);
    return c.json(
      { error: 'Failed to check faucet status', detail: String(error) },
      500,
    );
  }
});

// ─── nad.fun Token / On-Chain Betting ─────────────────────────

/**
 * Helper: build a NadFunClient from env vars.
 * Returns null if MONAD_RPC_URL or PRIVATE_KEY is missing.
 */
function getNadFunClient(env: Env): NadFunClient | null {
  return createNadFunClient(env);
}

/**
 * Helper: resolve the $HNADS token address from env.
 * Returns null if NADFUN_TOKEN_ADDRESS is not set.
 */
function getTokenAddress(env: Env): Address | null {
  const addr = env.NADFUN_TOKEN_ADDRESS;
  if (!addr) return null;
  return addr as Address;
}

/**
 * POST /bet/buy
 *
 * Buy $HNADS via nad.fun SDK to place a bet.
 * Wraps NadFunClient.buyToken (simpleBuy under the hood).
 *
 * Body:
 *   - battleId:        string   (required) battle to bet on
 *   - agentId:         string   (required) agent to bet on
 *   - amountInMon:     string   (required) MON to spend, in ether units (e.g. "0.5")
 *   - slippagePercent: number   (optional, default 1)
 *
 * On success, also records the bet in the off-chain BettingPool for odds
 * tracking and leaderboard purposes.
 */
app.post('/bet/buy', async (c) => {
  try {
    const body = await c.req.json();
    const { battleId, agentId, amountInMon, slippagePercent } = body as {
      battleId?: string;
      agentId?: string;
      amountInMon?: string;
      slippagePercent?: number;
    };

    if (!battleId || !agentId || !amountInMon) {
      return c.json(
        { error: 'Missing required fields: battleId, agentId, amountInMon' },
        400,
      );
    }

    // Validate amount
    let amountWei: bigint;
    try {
      amountWei = parseEther(amountInMon);
    } catch {
      return c.json({ error: 'Invalid amountInMon — must be a decimal string (e.g. "0.5")' }, 400);
    }
    if (amountWei <= 0n) {
      return c.json({ error: 'amountInMon must be positive' }, 400);
    }

    // Verify battle is bettable
    const battle = await getBattle(c.env.DB, battleId);
    if (!battle) {
      return c.json({ error: 'Battle not found' }, 404);
    }
    if (battle.status !== 'betting' && battle.status !== 'active') {
      return c.json(
        { error: `Cannot bet on battle with status '${battle.status}'` },
        400,
      );
    }

    // Enforce betting phase gate: only accept bets when phase is OPEN.
    {
      const bettingPhase = battle.betting_phase ?? 'OPEN';
      if (bettingPhase !== 'OPEN') {
        return c.json(
          {
            error: `Betting is ${bettingPhase.toLowerCase()} for this battle`,
            bettingPhase,
          },
          400,
        );
      }
    }

    // Build nad.fun client
    const client = getNadFunClient(c.env);
    if (!client) {
      return c.json(
        {
          error: 'nad.fun integration not configured',
          hint: 'MONAD_RPC_URL and PRIVATE_KEY must be set. Use POST /bet for off-chain betting.',
        },
        503,
      );
    }

    const tokenAddress = getTokenAddress(c.env);
    if (!tokenAddress) {
      return c.json(
        { error: 'NADFUN_TOKEN_ADDRESS is not configured' },
        503,
      );
    }

    // Execute the buy on-chain
    const txHash = await client.buyToken(
      tokenAddress,
      amountWei,
      slippagePercent ?? 1,
    );

    // Record in off-chain pool for odds/leaderboard tracking
    const pool = new BettingPool(c.env.DB);
    const betRecord = await pool.placeBet(
      battleId,
      client.walletAddress,
      agentId,
      Number(formatEther(amountWei)),
    );

    return c.json({
      ok: true,
      txHash,
      tokenAddress,
      amountInMon,
      bet: betRecord,
    });
  } catch (error) {
    console.error('Failed to buy $HNADS:', error);
    return c.json(
      { error: 'Failed to buy $HNADS', detail: String(error) },
      500,
    );
  }
});

/**
 * POST /bet/sell
 *
 * Sell $HNADS position via nad.fun SDK.
 * Wraps NadFunClient.sellToken (simpleSell under the hood).
 *
 * Body:
 *   - amountInTokens:  string   (required) tokens to sell, in ether units (e.g. "100")
 *   - slippagePercent: number   (optional, default 1)
 */
app.post('/bet/sell', async (c) => {
  try {
    const body = await c.req.json();
    const { amountInTokens, slippagePercent } = body as {
      amountInTokens?: string;
      slippagePercent?: number;
    };

    if (!amountInTokens) {
      return c.json({ error: 'Missing required field: amountInTokens' }, 400);
    }

    let amountWei: bigint;
    try {
      amountWei = parseEther(amountInTokens);
    } catch {
      return c.json(
        { error: 'Invalid amountInTokens — must be a decimal string (e.g. "100")' },
        400,
      );
    }
    if (amountWei <= 0n) {
      return c.json({ error: 'amountInTokens must be positive' }, 400);
    }

    const client = getNadFunClient(c.env);
    if (!client) {
      return c.json(
        {
          error: 'nad.fun integration not configured',
          hint: 'MONAD_RPC_URL and PRIVATE_KEY must be set.',
        },
        503,
      );
    }

    const tokenAddress = getTokenAddress(c.env);
    if (!tokenAddress) {
      return c.json({ error: 'NADFUN_TOKEN_ADDRESS is not configured' }, 503);
    }

    const txHash = await client.sellToken(
      tokenAddress,
      amountWei,
      slippagePercent ?? 1,
    );

    return c.json({
      ok: true,
      txHash,
      tokenAddress,
      amountSold: amountInTokens,
    });
  } catch (error) {
    console.error('Failed to sell $HNADS:', error);
    return c.json(
      { error: 'Failed to sell $HNADS', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /token/price
 *
 * Get current $HNADS price from the bonding curve via getAmountOut.
 * Query params:
 *   - amount: string (optional, default "1") — MON amount for quote
 */
app.get('/token/price', async (c) => {
  try {
    const client = getNadFunClient(c.env);
    if (!client) {
      return c.json(
        {
          error: 'nad.fun integration not configured',
          hint: 'MONAD_RPC_URL and PRIVATE_KEY must be set.',
        },
        503,
      );
    }

    const tokenAddress = getTokenAddress(c.env);
    if (!tokenAddress) {
      return c.json({ error: 'NADFUN_TOKEN_ADDRESS is not configured' }, 503);
    }

    const amountStr = c.req.query('amount') ?? '1';
    let amountWei: bigint;
    try {
      amountWei = parseEther(amountStr);
    } catch {
      return c.json({ error: 'Invalid amount — must be a decimal string' }, 400);
    }

    // Buy quote: how many tokens you get for `amount` MON
    const buyQuote = await client.getQuote(tokenAddress, amountWei, true);
    // Sell quote: how much MON you get for `amount` tokens
    const sellQuote = await client.getQuote(tokenAddress, amountWei, false);

    const graduated = await client.isGraduated(tokenAddress);

    return c.json({
      tokenAddress,
      quotedAmountMon: amountStr,
      buyQuote: {
        tokensOut: formatEther(buyQuote.amount),
        router: buyQuote.router,
      },
      sellQuote: {
        monOut: formatEther(sellQuote.amount),
        router: sellQuote.router,
      },
      graduated,
    });
  } catch (error) {
    console.error('Failed to get token price:', error);
    return c.json(
      { error: 'Failed to get token price', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /token/progress
 *
 * Bonding curve graduation progress for $HNADS.
 * Returns progress value, curve reserves, and graduation status.
 */
app.get('/token/progress', async (c) => {
  try {
    const client = getNadFunClient(c.env);
    if (!client) {
      return c.json(
        {
          error: 'nad.fun integration not configured',
          hint: 'MONAD_RPC_URL and PRIVATE_KEY must be set.',
        },
        503,
      );
    }

    const tokenAddress = getTokenAddress(c.env);
    if (!tokenAddress) {
      return c.json({ error: 'NADFUN_TOKEN_ADDRESS is not configured' }, 503);
    }

    const [progress, curveState, graduated] = await Promise.all([
      client.getProgress(tokenAddress),
      client.getCurveState(tokenAddress),
      client.isGraduated(tokenAddress),
    ]);

    return c.json({
      tokenAddress,
      progress: progress.toString(),
      graduated,
      curve: {
        virtualMonReserve: formatEther(curveState.virtualMonReserve),
        virtualTokenReserve: formatEther(curveState.virtualTokenReserve),
        k: curveState.k.toString(),
        targetTokenAmount: formatEther(curveState.targetTokenAmount),
      },
    });
  } catch (error) {
    console.error('Failed to get token progress:', error);
    return c.json(
      { error: 'Failed to get token progress', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /token/stats
 *
 * Token ecosystem stats: total burned (from sponsorships), total faucet distributed.
 * No auth required.
 */
app.get('/token/stats', async (c) => {
  try {
    const [burnStats, faucetStats] = await Promise.all([
      getTotalBurnedStats(c.env.DB),
      getTotalFaucetDistributed(c.env.DB),
    ]);

    return c.json({
      burned: {
        totalAmount: burnStats.totalBurned,
        totalSponsorships: burnStats.totalSponsorships,
      },
      faucet: {
        totalDistributed: faucetStats.totalDistributed,
        totalClaims: faucetStats.totalClaims,
      },
    });
  } catch (error) {
    console.error('Failed to get token stats:', error);
    return c.json(
      { error: 'Failed to get token stats', detail: String(error) },
      500,
    );
  }
});

// ─── Leaderboard ──────────────────────────────────────────────

/**
 * GET /leaderboard/agents
 *
 * Top agents by win rate (requires at least 1 battle).
 * Query params: ?limit=20
 */
app.get('/leaderboard/agents', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

    const profiles = await getAgentLeaderboard(c.env.DB, limit);
    return c.json({
      leaderboard: profiles,
      count: profiles.length,
    });
  } catch (error) {
    console.error('Failed to get agent leaderboard:', error);
    return c.json(
      { error: 'Failed to get agent leaderboard', detail: String(error) },
      500,
    );
  }
});

/**
 * GET /leaderboard/bettors
 *
 * Top bettors by profit.
 * Query params: ?limit=20
 */
app.get('/leaderboard/bettors', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);

    const result = await c.env.DB
      .prepare(
        `SELECT
           user_address,
           COUNT(*) as total_bets,
           SUM(amount) as total_wagered,
           SUM(payout) as total_payout,
           SUM(payout) - SUM(amount) as profit,
           SUM(CASE WHEN payout > amount THEN 1 ELSE 0 END) as wins,
           CAST(SUM(CASE WHEN payout > amount THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate
         FROM bets
         WHERE settled = 1
         GROUP BY user_address
         HAVING COUNT(*) >= 1
         ORDER BY profit DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all();

    return c.json({
      leaderboard: result.results,
      count: result.results.length,
    });
  } catch (error) {
    console.error('Failed to get bettor leaderboard:', error);
    return c.json(
      { error: 'Failed to get bettor leaderboard', detail: String(error) },
      500,
    );
  }
});

// ─── WebSocket Proxy ──────────────────────────────────────────

/**
 * GET /battle/:id/stream (WebSocket upgrade)
 *
 * Proxies WebSocket connection to ArenaDO for live battle updates.
 */
app.get('/battle/:id/stream', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  try {
    const battleId = c.req.param('id');
    const arenaId = c.env.ARENA_DO.idFromName(battleId);
    const arenaStub = c.env.ARENA_DO.get(arenaId);

    // Forward the WebSocket upgrade request to ArenaDO
    return arenaStub.fetch(
      new Request('http://arena/ws', {
        headers: c.req.raw.headers,
      }),
    );
  } catch (error) {
    console.error('WebSocket upgrade failed:', error);
    return c.json(
      { error: 'WebSocket upgrade failed', detail: String(error) },
      500,
    );
  }
});

// ─── Market Prices ────────────────────────────────────────────

/**
 * In-memory cache for CoinGecko market data.
 * Avoids hammering the free tier (30 req/min limit).
 */
let priceCache: { data: unknown; fetchedAt: number } | null = null;
const PRICE_CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * GET /prices
 *
 * Real-time market prices for ETH, BTC, SOL, and MON.
 * Proxies CoinGecko /coins/markets with sparkline + multi-timeframe changes.
 * MON uses a static placeholder since Monad is pre-mainnet.
 *
 * Response shape:
 * {
 *   prices: [
 *     {
 *       asset: "ETH",
 *       price: 3842.50,
 *       change1h: 0.34,
 *       change24h: 2.15,
 *       change7d: -1.23,
 *       sparkline: [3800, 3810, ...] // 7-day hourly prices (168 points)
 *     },
 *     ...
 *   ],
 *   updatedAt: "2026-02-09T12:00:00.000Z"
 * }
 */
app.get('/prices', async (c) => {
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (priceCache && now - priceCache.fetchedAt < PRICE_CACHE_TTL_MS) {
      return c.json(priceCache.data);
    }

    // Fetch from CoinGecko (free, no API key needed)
    const cgUrl =
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd' +
      '&ids=ethereum,bitcoin,solana' +
      '&order=market_cap_desc' +
      '&sparkline=true' +
      '&price_change_percentage=1h,24h,7d';

    const cgResponse = await fetch(cgUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!cgResponse.ok) {
      // If CoinGecko is down/rate-limited and we have stale cache, return it
      if (priceCache) {
        return c.json(priceCache.data);
      }
      return c.json(
        { error: 'Failed to fetch market data from CoinGecko', status: cgResponse.status },
        502,
      );
    }

    const cgData = (await cgResponse.json()) as Array<{
      symbol: string;
      current_price: number;
      price_change_percentage_1h_in_currency?: number;
      price_change_percentage_24h_in_currency?: number;
      price_change_percentage_7d_in_currency?: number;
      sparkline_in_7d?: { price: number[] };
    }>;

    // Map CoinGecko symbols to our asset names
    const symbolToAsset: Record<string, string> = {
      eth: 'ETH',
      btc: 'BTC',
      sol: 'SOL',
    };

    const prices = cgData.map((coin) => {
      const asset = symbolToAsset[coin.symbol] ?? coin.symbol.toUpperCase();
      // Downsample sparkline from ~168 points to 42 for lighter payloads
      const rawSparkline = coin.sparkline_in_7d?.price ?? [];
      const sparkline = downsampleSparkline(rawSparkline, 42);

      return {
        asset,
        price: coin.current_price,
        change1h: round2(coin.price_change_percentage_1h_in_currency ?? 0),
        change24h: round2(coin.price_change_percentage_24h_in_currency ?? 0),
        change7d: round2(coin.price_change_percentage_7d_in_currency ?? 0),
        sparkline,
      };
    });

    // Add MON (Monad) — pre-mainnet, use placeholder data
    // In production, replace with Pyth or DEX price feed
    prices.push({
      asset: 'MON',
      price: 4.28,
      change1h: round2((Math.random() - 0.5) * 2),
      change24h: round2((Math.random() - 0.3) * 10),
      change7d: round2((Math.random() - 0.2) * 20),
      sparkline: generateMonSparkline(42),
    });

    const responseBody = {
      prices,
      updatedAt: new Date().toISOString(),
    };

    // Cache it
    priceCache = { data: responseBody, fetchedAt: now };

    return c.json(responseBody);
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    // Return stale cache on error
    if (priceCache) {
      return c.json(priceCache.data);
    }
    return c.json(
      { error: 'Failed to fetch market prices', detail: String(error) },
      500,
    );
  }
});

/** Downsample an array to `targetLen` points using simple averaging. */
function downsampleSparkline(data: number[], targetLen: number): number[] {
  if (data.length <= targetLen) return data;
  const result: number[] = [];
  const step = data.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    result.push(round2(sum / (end - start)));
  }
  return result;
}

/** Generate a fake MON sparkline that trends slightly up. */
function generateMonSparkline(points: number): number[] {
  const result: number[] = [];
  let price = 3.8 + Math.random() * 0.5;
  for (let i = 0; i < points; i++) {
    price += (Math.random() - 0.45) * 0.15;
    if (price < 2.5) price = 2.5 + Math.random() * 0.3;
    result.push(round2(price));
  }
  return result;
}

/** Round to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── 404 Catch-All ────────────────────────────────────────────

app.all('*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

export { app as apiRouter };
