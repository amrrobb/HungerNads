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
  type BattleRow,
} from '../db/schema';
import { AGENT_CLASSES } from '../agents';
import { SponsorshipManager, BettingPool, calculateOdds, buildOddsInputs } from '../betting';
import {
  createNadFunClient,
  parseEther,
  formatEther,
  type NadFunClient,
  type Address,
} from '../chain/nadfun';

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
      battleStart: 'POST /battle/start',
      battleState: 'GET /battle/:id',
      battleEpochs: 'GET /battle/:id/epochs',
      battles: 'GET /battles',
      agentProfile: 'GET /agent/:id',
      agentLessons: 'GET /agent/:id/lessons',
      agentMatchups: 'GET /agent/:id/matchups',
      leaderboardAgents: 'GET /leaderboard/agents',
      leaderboardBettors: 'GET /leaderboard/bettors',
      battleOdds: 'GET /battle/:id/odds',
      battleSponsors: 'GET /battle/:id/sponsors',
      placeBet: 'POST /bet',
      betBuy: 'POST /bet/buy',
      betSell: 'POST /bet/sell',
      tokenPrice: 'GET /token/price',
      tokenProgress: 'GET /token/progress',
      sponsor: 'POST /sponsor',
      userBets: 'GET /user/:address/bets',
      battleStream: 'WS /battle/:id/stream',
    },
  });
});

// ─── Battle Management ────────────────────────────────────────

/**
 * POST /battle/start
 *
 * Create a new battle: generate ID, spawn agents via ArenaDO, persist to D1.
 * Optional body: { agentClasses?: AgentClass[] } (defaults to one of each).
 */
app.post('/battle/start', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const agentClasses = body.agentClasses ?? [...AGENT_CLASSES];

    if (!Array.isArray(agentClasses) || agentClasses.length < 2) {
      return c.json({ error: 'Provide at least 2 agent classes' }, 400);
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

    // Persist battle to D1
    await insertBattle(c.env.DB, {
      id: battleId,
      status: 'active',
      started_at: new Date().toISOString(),
      epoch_count: 0,
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

// ─── Sponsorship ──────────────────────────────────────────────

/**
 * POST /sponsor
 *
 * Send sponsorship to an agent.
 */
app.post('/sponsor', async (c) => {
  try {
    const body = await c.req.json();
    const { battleId, agentId, amount, message, sponsorAddress } = body;

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

// ─── 404 Catch-All ────────────────────────────────────────────

app.all('*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

export { app as apiRouter };
