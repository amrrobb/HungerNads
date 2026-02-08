/**
 * HUNGERNADS - Arena Durable Object
 *
 * Manages a single battle instance. Coordinates epochs, resolves
 * combat, tracks HP, and broadcasts state to spectators via WebSocket.
 *
 * Uses the Cloudflare Durable Objects Hibernation API for WebSockets
 * to minimize costs during idle periods between epochs.
 *
 * Epoch processing is wired to the real arena engine:
 *   - ArenaManager + BaseAgent instances are reconstructed from storage
 *   - processEpoch() from arena/epoch.ts runs the full game loop
 *   - Results are synced back to durable storage and broadcast to spectators
 */

import type { Env } from '../index';
import type { AgentClass, AgentState, EpochActions, MarketData } from '../agents';
import type { LLMKeys } from '../llm';
import {
  type BattleEvent,
  broadcastEvent,
  broadcastEvents,
  epochToEvents,
  curveEventToBattleEvent,
} from '../api/websocket';
import { createNadFunClient, type NadFunClient, type CurveStream } from '../chain/nadfun';
import type { Address } from 'viem';
import { ArenaManager } from '../arena/arena';
import { processEpoch as runEpoch, type EpochResult } from '../arena/epoch';
import { PriceFeed } from '../arena/price-feed';
import { WarriorAgent } from '../agents/warrior';
import { TraderAgent } from '../agents/trader';
import { SurvivorAgent } from '../agents/survivor';
import { ParasiteAgent } from '../agents/parasite';
import { GamblerAgent } from '../agents/gambler';
import type { BaseAgent } from '../agents/base-agent';

// Re-export BattleEvent for consumers that import from arena.ts
export type { BattleEvent } from '../api/websocket';

// ─── Types ────────────────────────────────────────────────────────

export type BattleStatus = 'pending' | 'active' | 'completed';

export interface BattleAgent {
  id: string;
  name: string;
  class: AgentClass;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  kills: number;
  epochsSurvived: number;
}

export interface BattleState {
  battleId: string;
  status: BattleStatus;
  epoch: number;
  agents: Record<string, BattleAgent>;
  startedAt: string | null;
  completedAt: string | null;
  winnerId: string | null;
}

/**
 * Legacy event shape used by the DO's internal lifecycle broadcasts
 * (battle_started, state_update). These are separate from the richer
 * BattleEvent union in websocket.ts which covers per-epoch streaming.
 */
export interface InternalEvent {
  type: 'battle_started' | 'epoch_processed' | 'agent_died' | 'battle_completed' | 'state_update';
  battleId: string;
  epoch: number;
  timestamp: string;
  data: Record<string, unknown>;
}

// Epoch interval: 5 minutes
const EPOCH_INTERVAL_MS = 300_000;

// ─── Agent Factory ────────────────────────────────────────────────

/**
 * Create a BaseAgent subclass instance from a stored BattleAgent record.
 * Restores HP, kills, epochs survived, and alive status.
 */
function createAgentFromState(agent: BattleAgent, llmKeys?: LLMKeys): BaseAgent {
  let instance: BaseAgent;

  switch (agent.class) {
    case 'WARRIOR':
      instance = new WarriorAgent(agent.id, agent.name);
      break;
    case 'TRADER':
      instance = new TraderAgent(agent.id, agent.name);
      break;
    case 'SURVIVOR':
      instance = new SurvivorAgent(agent.id, agent.name);
      break;
    case 'PARASITE':
      instance = new ParasiteAgent(agent.id, agent.name);
      break;
    case 'GAMBLER':
      instance = new GamblerAgent(agent.id, agent.name);
      break;
    default:
      // Fallback to Warrior for unknown classes
      instance = new WarriorAgent(agent.id, agent.name);
      break;
  }

  // Restore state from storage
  instance.hp = agent.hp;
  instance.maxHp = agent.maxHp;
  instance.isAlive = agent.isAlive;
  instance.kills = agent.kills;
  instance.epochsSurvived = agent.epochsSurvived;
  instance.llmKeys = llmKeys;

  return instance;
}

/**
 * Reconstruct an ArenaManager with in-memory BaseAgent instances from
 * a stored BattleState. The ArenaManager is needed by the epoch processor.
 */
function reconstructArena(battleState: BattleState, llmKeys?: LLMKeys): ArenaManager {
  const arena = new ArenaManager(battleState.battleId, {
    maxEpochs: 100,
    epochIntervalMs: EPOCH_INTERVAL_MS,
  });

  // Manually set internal state to match stored battle
  arena.status = 'ACTIVE';
  arena.epochCount = battleState.epoch;
  arena.startedAt = battleState.startedAt ? new Date(battleState.startedAt) : new Date();

  // Create and register agents
  for (const agentData of Object.values(battleState.agents)) {
    const agent = createAgentFromState(agentData, llmKeys);
    arena.agents.set(agent.id, agent);
  }

  return arena;
}

/**
 * Sync epoch results back to the BattleState record for durable storage.
 */
function syncEpochResult(battleState: BattleState, result: EpochResult): void {
  battleState.epoch = result.epochNumber;

  // Update each agent's state from the epoch result
  for (const agentState of result.agentStates) {
    const stored = battleState.agents[agentState.id];
    if (!stored) continue;

    stored.hp = agentState.hp;
    stored.isAlive = agentState.isAlive;
  }

  // Sync kills and epochsSurvived from the arena's in-memory agents
  // (these aren't in agentStates but are tracked by the engine)
  // We'll handle this via the arena instance in processEpoch()

  if (result.battleComplete) {
    battleState.status = 'completed';
    battleState.completedAt = new Date().toISOString();
    battleState.winnerId = result.winner?.id ?? null;
  }
}

// ─── Arena Durable Object ─────────────────────────────────────────

export class ArenaDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  /** PriceFeed persists across epochs so it can compute price changes. */
  private priceFeed: PriceFeed;
  /** NadFun client for curve streaming. Null if env vars are missing. */
  private nadFunClient: NadFunClient | null = null;
  /** Active curve stream subscription. Null if not streaming. */
  private curveStream: CurveStream | null = null;
  /** Unsubscribe callback for the curve stream event listener. */
  private curveStreamUnsub: (() => void) | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.priceFeed = new PriceFeed();

    // Eagerly create the NadFun client (graceful if env vars are missing)
    this.nadFunClient = createNadFunClient({
      MONAD_RPC_URL: env.MONAD_RPC_URL,
      PRIVATE_KEY: env.PRIVATE_KEY,
      MONAD_WS_URL: env.MONAD_WS_URL,
    });
  }

  // ─── Battle Lifecycle ─────────────────────────────────────────

  /**
   * Initialize a new battle with the given agent IDs.
   * Sets up initial state and schedules the first epoch alarm.
   */
  async startBattle(agentIds: string[]): Promise<BattleState> {
    const battleId = crypto.randomUUID();

    // Initialize agent states
    const agents: Record<string, BattleAgent> = {};
    for (const agentId of agentIds) {
      agents[agentId] = {
        id: agentId,
        name: `Agent-${agentId.slice(0, 6)}`,
        class: 'WARRIOR', // Default; will be set by caller or agent DO
        hp: 1000,
        maxHp: 1000,
        isAlive: true,
        kills: 0,
        epochsSurvived: 0,
      };
    }

    const battleState: BattleState = {
      battleId,
      status: 'active',
      epoch: 0,
      agents,
      startedAt: new Date().toISOString(),
      completedAt: null,
      winnerId: null,
    };

    // Persist state
    await this.state.storage.put('battleState', battleState);

    // Schedule the first epoch
    await this.state.storage.setAlarm(Date.now() + EPOCH_INTERVAL_MS);

    // Broadcast battle start
    this.broadcastInternal({
      type: 'battle_started',
      battleId,
      epoch: 0,
      timestamp: new Date().toISOString(),
      data: { agents, agentCount: agentIds.length },
    });

    // Start streaming $HNADS curve events to spectators
    this.startCurveStream();

    return battleState;
  }

  /**
   * Process a single epoch using the real arena engine.
   *
   * Reconstructs an in-memory ArenaManager from durable storage,
   * runs the full epoch processor (agent decisions, predictions,
   * combat, bleed, death checks), syncs results back to storage,
   * and broadcasts rich events to spectators.
   */
  async processEpoch(): Promise<void> {
    const battleState = await this.state.storage.get<BattleState>('battleState');
    if (!battleState || battleState.status !== 'active') return;

    // Extract LLM keys from Cloudflare env bindings
    const llmKeys: LLMKeys = {
      groqApiKey: this.env.GROQ_API_KEY,
      googleApiKey: this.env.GOOGLE_API_KEY,
      openrouterApiKey: this.env.OPENROUTER_API_KEY,
    };

    // Reconstruct in-memory ArenaManager with BaseAgent instances
    const arena = reconstructArena(battleState, llmKeys);

    // Retrieve previous market data for prediction resolution
    const previousMarketData = await this.state.storage.get<MarketData>('previousMarketData');

    // ── Run the full epoch processor ─────────────────────────────
    // This handles ALL phases:
    //   1. Fetch market data
    //   2. Collect agent decisions (with LLM calls)
    //   3. Resolve predictions
    //   4. Resolve combat
    //   5. Apply bleed
    //   6. Check deaths
    //   7. Check win condition
    let result: EpochResult;
    try {
      result = await runEpoch(arena, this.priceFeed, previousMarketData ?? undefined);
    } catch (err) {
      console.error(`[ArenaDO] Epoch processing failed:`, err);
      // On failure, don't crash the DO - just skip this epoch and retry
      await this.state.storage.setAlarm(Date.now() + EPOCH_INTERVAL_MS);
      return;
    }

    // ── Sync results back to BattleState ─────────────────────────
    syncEpochResult(battleState, result);

    // Sync kills and epochsSurvived from the arena's in-memory agents
    for (const agent of arena.getAllAgents()) {
      const stored = battleState.agents[agent.id];
      if (stored) {
        stored.kills = agent.kills;
        stored.epochsSurvived = agent.epochsSurvived;
      }
    }

    // Store market data for next epoch's prediction resolution
    await this.state.storage.put('previousMarketData', result.marketData);

    // ── Broadcast rich events to spectators ──────────────────────
    this.broadcastEpochResult(result);

    // ── Handle battle completion or schedule next epoch ───────────
    if (result.battleComplete) {
      // Stop the curve stream — no more spectators after this
      this.stopCurveStream();

      // Close all WebSocket connections on battle end
      const sockets = this.state.getWebSockets();
      for (const ws of sockets) {
        try {
          ws.close(1000, 'Battle completed');
        } catch {
          // Already closed
        }
      }
    } else {
      // Schedule next epoch
      await this.state.storage.setAlarm(Date.now() + EPOCH_INTERVAL_MS);
    }

    // Persist updated state
    await this.state.storage.put('battleState', battleState);
  }

  /**
   * Broadcast a full EpochResult as a sequence of rich BattleEvents.
   *
   * Converts the result to ordered events and streams them to all
   * connected spectators:
   *   epoch_start -> agent_action (x N) -> prediction_result (x N)
   *   -> combat_result (x M) -> agent_death (x D) -> epoch_end
   *   -> battle_end (if applicable)
   */
  broadcastEpochResult(epochResult: EpochResult): void {
    const sockets = this.state.getWebSockets();
    const events = epochToEvents(epochResult);
    broadcastEvents(sockets, events);
  }

  /**
   * Broadcast an odds_update event to all connected spectators.
   * Call after epoch processing once new odds have been computed.
   */
  broadcastOddsUpdate(odds: Record<string, number>): void {
    const sockets = this.state.getWebSockets();
    broadcastEvent(sockets, {
      type: 'odds_update',
      data: { odds },
    });
  }

  /**
   * Return current battle state for API consumers.
   */
  async getState(): Promise<BattleState | null> {
    return (await this.state.storage.get<BattleState>('battleState')) ?? null;
  }

  // ─── Curve Stream Lifecycle ──────────────────────────────────

  /**
   * Start listening for nad.fun curve events on the $HNADS token and
   * forward them to connected spectators as token_buy / token_sell /
   * curve_update WebSocket events.
   *
   * No-ops if the NadFun client is unavailable (missing env vars) or
   * if the NADFUN_TOKEN_ADDRESS secret hasn't been set yet.
   *
   * Safe to call multiple times — stops any existing stream first.
   */
  private startCurveStream(): void {
    // Guard: need both the client and a token address
    if (!this.nadFunClient || !this.env.NADFUN_TOKEN_ADDRESS) {
      console.log('[ArenaDO] Curve stream skipped — nadFunClient or NADFUN_TOKEN_ADDRESS unavailable');
      return;
    }

    // Teardown previous stream if any
    this.stopCurveStream();

    try {
      const tokenAddress = this.env.NADFUN_TOKEN_ADDRESS as Address;

      this.curveStream = this.nadFunClient.createCurveStream(
        [tokenAddress],
        ['Buy', 'Sell', 'Create'],
      );

      // Subscribe: convert each CurveEvent → BattleEvent and broadcast
      this.curveStreamUnsub = this.curveStream.onEvent((curveEvt) => {
        const sockets = this.state.getWebSockets();
        if (sockets.length === 0) return; // nobody watching

        const battleEvt = curveEventToBattleEvent(curveEvt);
        broadcastEvent(sockets, battleEvt);
      });

      this.curveStream.onError((err) => {
        console.error('[ArenaDO] Curve stream error:', err.message);
      });

      this.curveStream.start();
      console.log(`[ArenaDO] Curve stream started for token ${tokenAddress}`);
    } catch (err) {
      console.error('[ArenaDO] Failed to start curve stream:', err);
    }
  }

  /**
   * Stop the active curve event stream (if any).
   */
  private stopCurveStream(): void {
    if (this.curveStreamUnsub) {
      this.curveStreamUnsub();
      this.curveStreamUnsub = null;
    }
    if (this.curveStream) {
      try {
        this.curveStream.stop();
      } catch {
        // already stopped
      }
      this.curveStream = null;
    }
  }

  // ─── Alarm Handler ────────────────────────────────────────────

  async alarm(): Promise<void> {
    await this.processEpoch();
  }

  // ─── HTTP + WebSocket Handler ─────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for spectators
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept via hibernation API for cost efficiency
      this.state.acceptWebSocket(server);

      // Send current state on connect as an epoch_end snapshot
      // so the client immediately has the latest agent states
      const battleState = await this.getState();
      if (battleState) {
        const stateEvent: BattleEvent = {
          type: 'epoch_end',
          data: {
            agentStates: Object.values(battleState.agents).map((a) => ({
              id: a.id,
              name: a.name,
              class: a.class,
              hp: a.hp,
              isAlive: a.isAlive,
            })),
            battleComplete: battleState.status === 'completed',
          },
        };
        server.send(JSON.stringify(stateEvent));
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    // Start a new battle
    if (url.pathname === '/start' && request.method === 'POST') {
      const body = (await request.json()) as { agentIds?: string[] };
      const agentIds = body.agentIds;

      if (!agentIds || !Array.isArray(agentIds) || agentIds.length < 2) {
        return Response.json({ error: 'Provide at least 2 agentIds' }, { status: 400 });
      }

      const battleState = await this.startBattle(agentIds);
      return Response.json({ ok: true, battle: battleState });
    }

    // Get battle state
    if (url.pathname === '/state') {
      const battleState = await this.getState();
      if (!battleState) {
        return Response.json({ error: 'No active battle' }, { status: 404 });
      }
      return Response.json(battleState);
    }

    // Status (backward compat)
    if (url.pathname === '/status') {
      const battleState = await this.getState();
      return Response.json({
        battleId: battleState?.battleId ?? null,
        epoch: battleState?.epoch ?? 0,
        status: battleState?.status ?? 'idle',
      });
    }

    return Response.json({ error: 'Unknown arena action' }, { status: 404 });
  }

  // ─── WebSocket Hibernation Handlers ───────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Handle incoming messages from spectators
    // For now, spectators are read-only; we could add commands later (e.g., sponsorship)
    try {
      const data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch {
      // Ignore malformed messages
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Hibernation API handles cleanup automatically
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    // Close errored connections
    ws.close(1011, 'WebSocket error');
  }

  // ─── Broadcast to All Connected Spectators ────────────────────

  /**
   * Broadcast a legacy InternalEvent to all connected spectators.
   * Used for lifecycle events (battle_started) that don't map to the
   * richer BattleEvent union. For epoch streaming, use
   * broadcastEpochResult() or the broadcastEvent() helper directly.
   */
  private broadcastInternal(event: InternalEvent): void {
    const message = JSON.stringify(event);
    const sockets = this.state.getWebSockets();

    for (const ws of sockets) {
      try {
        ws.send(message);
      } catch {
        // Socket may be closing; ignore
      }
    }
  }
}
