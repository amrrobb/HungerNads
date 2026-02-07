/**
 * HUNGERNADS - Arena Durable Object
 *
 * Manages a single battle instance. Coordinates epochs, resolves
 * combat, tracks HP, and broadcasts state to spectators via WebSocket.
 *
 * Uses the Cloudflare Durable Objects Hibernation API for WebSockets
 * to minimize costs during idle periods between epochs.
 */

import type { Env } from '../index';
import type { AgentClass, AgentState, EpochActions, MarketData } from '../agents';
import {
  type BattleEvent,
  broadcastEvent,
  broadcastEvents,
  epochToEvents,
} from '../api/websocket';

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

// ─── Arena Durable Object ─────────────────────────────────────────

export class ArenaDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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

    return battleState;
  }

  /**
   * Process a single epoch. Called by alarm().
   *
   * When a full EpochResult is available (from the epoch processor),
   * use broadcastEpochResult() to stream rich events to spectators.
   *
   * This placeholder applies bleed, checks deaths, and broadcasts
   * using the new event types from websocket.ts.
   */
  async processEpoch(): Promise<void> {
    const battleState = await this.state.storage.get<BattleState>('battleState');
    if (!battleState || battleState.status !== 'active') return;

    battleState.epoch += 1;
    const sockets = this.state.getWebSockets();

    // ── Phase 1: Collect agent decisions (placeholder) ──────────
    // TODO: Fan out to AgentDO instances for decisions

    // ── Phase 2: Execute predictions (placeholder) ──────────────
    // TODO: Resolve market predictions against real price data

    // ── Phase 3: Resolve combat (placeholder) ────────────────────
    // TODO: Process attacks and defenses

    // ── Phase 4: Apply bleed (2% HP drain) ──────────────────────
    for (const agent of Object.values(battleState.agents)) {
      if (!agent.isAlive) continue;

      const bleed = Math.floor(agent.maxHp * 0.02);
      agent.hp = Math.max(0, agent.hp - bleed);
      agent.epochsSurvived += 1;

      // Check death — broadcast rich agent_death event
      if (agent.hp <= 0) {
        agent.isAlive = false;
        broadcastEvent(sockets, {
          type: 'agent_death',
          data: {
            agentId: agent.id,
            agentName: agent.name,
            agentClass: agent.class,
            epoch: battleState.epoch,
            cause: 'bleed',
            finalWords: 'Time... is the cruelest enemy...',
            finalHp: agent.hp,
          },
        });
      }
    }

    // ── Phase 5: Check for battle end ───────────────────────────
    const alive = Object.values(battleState.agents).filter((a) => a.isAlive);
    const battleComplete = alive.length <= 1;

    // Broadcast epoch_end with current agent states
    broadcastEvent(sockets, {
      type: 'epoch_end',
      data: {
        agentStates: Object.values(battleState.agents).map((a) => ({
          id: a.id,
          name: a.name,
          class: a.class,
          hp: a.hp,
          isAlive: a.isAlive,
        })),
        battleComplete,
      },
    });

    if (battleComplete) {
      battleState.status = 'completed';
      battleState.completedAt = new Date().toISOString();
      battleState.winnerId = alive.length === 1 ? alive[0].id : null;

      if (alive.length === 1) {
        broadcastEvent(sockets, {
          type: 'battle_end',
          data: {
            winnerId: alive[0].id,
            winnerName: alive[0].name,
            totalEpochs: battleState.epoch,
          },
        });
      }

      // Close all WebSocket connections on battle end
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
   * Call this instead of processEpoch's inline broadcasts when you have
   * a complete EpochResult from the epoch processor (arena/epoch.ts).
   * Converts the result to ordered events and streams them to all
   * connected spectators.
   */
  broadcastEpochResult(epochResult: import('../arena/epoch').EpochResult): void {
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
