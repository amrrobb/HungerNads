/**
 * HUNGERNADS - WebSocket Event Streaming
 *
 * Defines the real-time event protocol for spectating battles.
 * Converts EpochResult objects into a sequence of typed BattleEvents
 * suitable for broadcasting to connected WebSocket clients.
 *
 * Event flow per epoch:
 *   epoch_start -> agent_action (x N) -> prediction_result (x N)
 *   -> combat_result (x M) -> agent_death (x D) -> epoch_end
 *   -> odds_update
 *
 * On battle completion: battle_end follows epoch_end.
 *
 * Uses the Durable Objects Hibernation API for WebSocket management.
 * The ArenaDO accepts connections and stores them via state.acceptWebSocket().
 * This module provides the event types and conversion utilities.
 */

import type { EpochResult } from '../arena/epoch';
import type { PredictionResult } from '../arena/prediction';
import type { CombatResult } from '../arena/combat';
import type { DeathEvent } from '../arena/death';
import type { MarketData } from '../agents/schemas';

// ─── Event Types ──────────────────────────────────────────────────────────────

export interface EpochStartEvent {
  type: 'epoch_start';
  data: {
    epochNumber: number;
    marketData: MarketData;
  };
}

export interface AgentActionEvent {
  type: 'agent_action';
  data: {
    agentId: string;
    agentName: string;
    prediction: {
      asset: string;
      direction: 'UP' | 'DOWN';
      stake: number;
    };
    attack?: {
      target: string;
      stake: number;
    };
    defend: boolean;
    reasoning: string;
  };
}

export interface PredictionResultEvent {
  type: 'prediction_result';
  data: PredictionResult;
}

export interface CombatResultEvent {
  type: 'combat_result';
  data: CombatResult;
}

export interface AgentDeathEvent {
  type: 'agent_death';
  data: DeathEvent;
}

export interface EpochEndEvent {
  type: 'epoch_end';
  data: {
    agentStates: {
      id: string;
      name: string;
      class: string;
      hp: number;
      isAlive: boolean;
    }[];
    battleComplete: boolean;
  };
}

export interface BattleEndEvent {
  type: 'battle_end';
  data: {
    winnerId: string;
    winnerName: string;
    totalEpochs: number;
  };
}

export interface OddsUpdateEvent {
  type: 'odds_update';
  data: {
    odds: Record<string, number>;
  };
}

/** Discriminated union of all events streamed to spectators. */
export type BattleEvent =
  | EpochStartEvent
  | AgentActionEvent
  | PredictionResultEvent
  | CombatResultEvent
  | AgentDeathEvent
  | EpochEndEvent
  | BattleEndEvent
  | OddsUpdateEvent;

// ─── Broadcast Helper ─────────────────────────────────────────────────────────

/**
 * Broadcast a BattleEvent to all connected WebSocket sessions.
 *
 * Silently swallows errors on individual sockets — they may be mid-close
 * or already disconnected. The Hibernation API will clean them up.
 */
export function broadcastEvent(sessions: WebSocket[], event: BattleEvent): void {
  const message = JSON.stringify(event);
  for (const ws of sessions) {
    try {
      ws.send(message);
    } catch {
      // Socket may be mid-close; safe to ignore.
      // The Hibernation API will fire webSocketClose/webSocketError
      // for cleanup.
    }
  }
}

/**
 * Broadcast multiple BattleEvents in sequence to all sessions.
 * Useful for replaying an entire epoch's events to spectators.
 */
export function broadcastEvents(sessions: WebSocket[], events: BattleEvent[]): void {
  for (const event of events) {
    broadcastEvent(sessions, event);
  }
}

// ─── EpochResult -> BattleEvent[] Conversion ──────────────────────────────────

/**
 * Convert an EpochResult into an ordered sequence of BattleEvents
 * suitable for broadcasting to spectators.
 *
 * The returned array preserves the narrative order of an epoch:
 *   1. epoch_start   — market context for this epoch
 *   2. agent_action   (per agent) — what each agent decided
 *   3. prediction_result (per agent) — prediction outcomes
 *   4. combat_result  (per combat) — attack/defend outcomes
 *   5. agent_death    (per death) — agents that died this epoch
 *   6. epoch_end      — surviving agent states + completion flag
 *   7. battle_end     (if applicable) — winner announcement
 *
 * Note: odds_update is NOT included here. Odds should be computed
 * separately by the betting module and broadcast after epoch_end.
 */
export function epochToEvents(result: EpochResult): BattleEvent[] {
  const events: BattleEvent[] = [];

  // ── 1. Epoch start ────────────────────────────────────────────────
  events.push({
    type: 'epoch_start',
    data: {
      epochNumber: result.epochNumber,
      marketData: result.marketData,
    },
  });

  // ── 2. Agent actions ──────────────────────────────────────────────
  // Build a name lookup from agentStates (always has id + name)
  const nameById = new Map<string, string>();
  for (const agent of result.agentStates) {
    nameById.set(agent.id, agent.name);
  }

  for (const [agentId, actions] of result.actions) {
    events.push({
      type: 'agent_action',
      data: {
        agentId,
        agentName: nameById.get(agentId) ?? agentId,
        prediction: {
          asset: actions.prediction.asset,
          direction: actions.prediction.direction,
          stake: actions.prediction.stake,
        },
        attack: actions.attack
          ? { target: actions.attack.target, stake: actions.attack.stake }
          : undefined,
        defend: actions.defend ?? false,
        reasoning: actions.reasoning,
      },
    });
  }

  // ── 3. Prediction results ─────────────────────────────────────────
  for (const predResult of result.predictionResults) {
    events.push({
      type: 'prediction_result',
      data: predResult,
    });
  }

  // ── 4. Combat results ─────────────────────────────────────────────
  for (const combatResult of result.combatResults) {
    events.push({
      type: 'combat_result',
      data: combatResult,
    });
  }

  // ── 5. Agent deaths ───────────────────────────────────────────────
  for (const death of result.deaths) {
    events.push({
      type: 'agent_death',
      data: death,
    });
  }

  // ── 6. Epoch end ──────────────────────────────────────────────────
  events.push({
    type: 'epoch_end',
    data: {
      agentStates: result.agentStates,
      battleComplete: result.battleComplete,
    },
  });

  // ── 7. Battle end (only when battle is complete with a winner) ────
  if (result.battleComplete && result.winner) {
    events.push({
      type: 'battle_end',
      data: {
        winnerId: result.winner.id,
        winnerName: result.winner.name,
        totalEpochs: result.epochNumber,
      },
    });
  }

  return events;
}
