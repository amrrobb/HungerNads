"use client";

import { useState, useMemo } from "react";
import {
  ArenaLayout,
  ActionFeed,
  EpochTimer,
  MarketTicker,
  MOCK_AGENTS,
  MOCK_FEED,
  MOCK_PRICES,
} from "@/components/battle";
import type { BattleAgent, FeedEntry, MarketPrice } from "@/components/battle";
import { BettingPanel, SponsorModal, SponsorFeed } from "@/components/betting";
import { useBattleStream } from "@/hooks/useBattleStream";
import type {
  BattleEvent,
  AgentActionEvent,
  PredictionResultEvent,
  CombatResultEvent,
  AgentDeathEvent,
  EpochStartEvent,
  OddsUpdateEvent,
} from "@/lib/websocket";
import type { AgentClass } from "@/types";

interface BattleViewProps {
  battleId: string;
}

// ---------------------------------------------------------------------------
// Event → FeedEntry transformers
// ---------------------------------------------------------------------------

/** Map of agent IDs to names/classes built from agent_action events */
interface AgentMeta {
  name: string;
  class: AgentClass;
}

function buildAgentMeta(events: BattleEvent[]): Map<string, AgentMeta> {
  const meta = new Map<string, AgentMeta>();
  for (const event of events) {
    if (event.type === "agent_action") {
      const e = event as AgentActionEvent;
      // We only have agentName from agent_action; class comes from epoch_end agentStates
      meta.set(e.data.agentId, {
        name: e.data.agentName,
        class: (meta.get(e.data.agentId)?.class ?? "WARRIOR") as AgentClass,
      });
    }
    if (event.type === "agent_death") {
      const e = event as AgentDeathEvent;
      const existing = meta.get(e.data.agentId);
      if (existing) {
        existing.name = e.data.agentName;
      } else {
        meta.set(e.data.agentId, {
          name: e.data.agentName,
          class: "WARRIOR" as AgentClass,
        });
      }
    }
  }
  return meta;
}

function eventToFeedEntries(
  event: BattleEvent,
  index: number,
  agentMeta: Map<string, AgentMeta>,
  latestEpoch: number,
): FeedEntry[] {
  const ts = Date.now();

  switch (event.type) {
    case "epoch_start": {
      const e = event as EpochStartEvent;
      return [
        {
          id: `ws-${index}`,
          timestamp: ts,
          epoch: e.data.epochNumber,
          type: "MARKET",
          message: `Epoch ${e.data.epochNumber} begins. Market prices updated.`,
        },
      ];
    }

    case "agent_action": {
      const e = event as AgentActionEvent;
      const entries: FeedEntry[] = [];
      const meta = agentMeta.get(e.data.agentId);
      const agentName = meta?.name ?? e.data.agentName;
      const agentClass = meta?.class;

      // Prediction entry
      entries.push({
        id: `ws-${index}-pred`,
        timestamp: ts,
        epoch: latestEpoch,
        type: "PREDICTION",
        agentId: e.data.agentId,
        agentName,
        agentClass,
        message: `${agentName} predicts ${e.data.prediction.asset} ${e.data.prediction.direction} -- stakes ${Math.round(e.data.prediction.stake * 100)}% HP. "${e.data.reasoning}"`,
      });

      // Attack entry
      if (e.data.attack) {
        const targetMeta = agentMeta.get(e.data.attack.target);
        const targetName = targetMeta?.name ?? e.data.attack.target;
        entries.push({
          id: `ws-${index}-atk`,
          timestamp: ts,
          epoch: latestEpoch,
          type: "ATTACK",
          agentId: e.data.agentId,
          agentName,
          agentClass,
          message: `${agentName} targets ${targetName} for attack!`,
        });
      }

      // Defend entry
      if (e.data.defend) {
        entries.push({
          id: `ws-${index}-def`,
          timestamp: ts,
          epoch: latestEpoch,
          type: "DEFEND",
          agentId: e.data.agentId,
          agentName,
          agentClass,
          message: `${agentName} raises defenses (-5% HP).`,
        });
      }

      return entries;
    }

    case "prediction_result": {
      const e = event as PredictionResultEvent;
      const meta = agentMeta.get(e.data.agentId);
      const agentName = meta?.name ?? e.data.agentId;
      const agentClass = meta?.class;
      const result = e.data.correct ? "CORRECT" : "WRONG";
      const hpStr =
        e.data.hpChange >= 0
          ? `+${e.data.hpChange} HP`
          : `${e.data.hpChange} HP`;
      return [
        {
          id: `ws-${index}`,
          timestamp: ts,
          epoch: latestEpoch,
          type: "PREDICTION",
          agentId: e.data.agentId,
          agentName,
          agentClass,
          message: `${agentName} prediction ${result}! (${hpStr}, now ${e.data.hpAfter} HP)`,
        },
      ];
    }

    case "combat_result": {
      const e = event as CombatResultEvent;
      const atkMeta = agentMeta.get(e.data.attackerId);
      const defMeta = agentMeta.get(e.data.defenderId);
      const attackerName = atkMeta?.name ?? e.data.attackerId;
      const defenderName = defMeta?.name ?? e.data.defenderId;
      const atkClass = atkMeta?.class;

      if (e.data.blocked) {
        return [
          {
            id: `ws-${index}`,
            timestamp: ts,
            epoch: latestEpoch,
            type: "ATTACK",
            agentId: e.data.attackerId,
            agentName: attackerName,
            agentClass: atkClass,
            message: `${attackerName} attacks ${defenderName} -- BLOCKED! ${defenderName}'s defenses hold.`,
          },
        ];
      }

      return [
        {
          id: `ws-${index}`,
          timestamp: ts,
          epoch: latestEpoch,
          type: "ATTACK",
          agentId: e.data.attackerId,
          agentName: attackerName,
          agentClass: atkClass,
          message: `${attackerName} attacks ${defenderName} for ${e.data.damage} damage!`,
        },
      ];
    }

    case "agent_death": {
      const e = event as AgentDeathEvent;
      const meta = agentMeta.get(e.data.agentId);
      const agentName = meta?.name ?? e.data.agentName;
      const agentClass = meta?.class;
      const killerInfo = e.data.killedBy
        ? `Eliminated by ${agentMeta.get(e.data.killedBy)?.name ?? e.data.killedBy}.`
        : `Cause: ${e.data.cause}.`;
      return [
        {
          id: `ws-${index}`,
          timestamp: ts,
          epoch: e.data.epochNumber,
          type: "DEATH",
          agentId: e.data.agentId,
          agentName,
          agentClass,
          message: `${agentName} has been REKT! ${killerInfo} HP reached 0.`,
        },
      ];
    }

    case "odds_update": {
      const e = event as OddsUpdateEvent;
      const agentNames = Object.keys(e.data.odds)
        .map((id) => agentMeta.get(id)?.name ?? id)
        .join(", ");
      return [
        {
          id: `ws-${index}`,
          timestamp: ts,
          epoch: latestEpoch,
          type: "MARKET",
          message: `Odds updated for ${agentNames}.`,
        },
      ];
    }

    // epoch_end and battle_end don't generate feed entries (handled by state)
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === "development";

export default function BattleView({ battleId }: BattleViewProps) {
  const {
    connected,
    events,
    agentStates,
    marketData,
    latestEpoch,
    winner,
  } = useBattleStream(battleId);

  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);

  // Build agent metadata lookup from events (for names/classes in feed)
  const agentMeta = useMemo(() => {
    const meta = buildAgentMeta(events);
    // Also enrich from agentStates (which includes class info)
    for (const state of agentStates) {
      const existing = meta.get(state.id);
      if (existing) {
        existing.class = state.class as AgentClass;
        existing.name = state.name;
      } else {
        meta.set(state.id, {
          name: state.name,
          class: state.class as AgentClass,
        });
      }
    }
    return meta;
  }, [events, agentStates]);

  // ─── Transform events → FeedEntry[] ──────────────────────────────
  const feed: FeedEntry[] = useMemo(() => {
    if (!connected && events.length === 0 && isDev) return MOCK_FEED;
    return events.flatMap((event, i) =>
      eventToFeedEntries(event, i, agentMeta, latestEpoch),
    );
  }, [connected, events, agentMeta, latestEpoch]);

  // ─── Transform agentStates → BattleAgent[] ──────────────────────
  const agents: BattleAgent[] = useMemo(() => {
    if (agentStates.length === 0 && isDev) return MOCK_AGENTS;
    if (agentStates.length === 0) return [];

    // Compute transient states from recent events
    // (look at the last N events for animation cues)
    const recentEvents = events.slice(-20);

    // Track kills per agent
    const killCounts = new Map<string, number>();
    for (const event of events) {
      if (event.type === "agent_death") {
        const e = event as AgentDeathEvent;
        if (e.data.killedBy) {
          killCounts.set(
            e.data.killedBy,
            (killCounts.get(e.data.killedBy) ?? 0) + 1,
          );
        }
      }
    }

    // Latest agent_action per agent (for defending, lastAction)
    const latestActions = new Map<string, AgentActionEvent["data"]>();
    // Latest prediction_result per agent
    const latestPredResults = new Map<
      string,
      PredictionResultEvent["data"]
    >();
    // Latest combat involvement per agent
    const latestCombat = new Map<
      string,
      { attacking: boolean; attacked: boolean }
    >();

    for (const event of recentEvents) {
      if (event.type === "agent_action") {
        const e = event as AgentActionEvent;
        latestActions.set(e.data.agentId, e.data);
      }
      if (event.type === "prediction_result") {
        const e = event as PredictionResultEvent;
        latestPredResults.set(e.data.agentId, e.data);
      }
      if (event.type === "combat_result") {
        const e = event as CombatResultEvent;
        latestCombat.set(e.data.attackerId, {
          attacking: true,
          attacked: false,
        });
        latestCombat.set(e.data.defenderId, {
          attacking: false,
          attacked: !e.data.blocked,
        });
      }
    }

    return agentStates.map((state) => {
      const action = latestActions.get(state.id);
      const predResult = latestPredResults.get(state.id);
      const combat = latestCombat.get(state.id);

      let lastAction: string | undefined;
      if (action) {
        if (action.defend) {
          lastAction = "Raised defenses";
        } else if (action.attack) {
          const targetName =
            agentMeta.get(action.attack.target)?.name ??
            action.attack.target;
          lastAction = `Attacked ${targetName} for ${action.attack.stake} stake`;
        } else {
          lastAction = `Predicted ${action.prediction.asset} ${action.prediction.direction} (stake: ${Math.round(action.prediction.stake * 100)}%)`;
        }
      }

      return {
        id: state.id,
        name: state.name,
        class: state.class as AgentClass,
        hp: state.hp,
        maxHp: 1000,
        alive: state.isAlive,
        kills: killCounts.get(state.id) ?? 0,
        defending: action?.defend ?? false,
        lastAction,
        attacking: combat?.attacking,
        attacked: combat?.attacked,
        predictionResult: predResult
          ? predResult.correct
            ? "correct"
            : "wrong"
          : undefined,
        isWinner: winner?.winnerId === state.id,
      } satisfies BattleAgent;
    });
  }, [agentStates, events, agentMeta, winner]);

  // ─── Transform marketData → MarketPrice[] ────────────────────────
  const prices: MarketPrice[] = useMemo(() => {
    if (!marketData && isDev) return MOCK_PRICES;
    if (!marketData) return [];
    return Object.entries(marketData.prices).map(([asset, price]) => ({
      asset: asset as MarketPrice["asset"],
      price,
      change24h: 0, // No historical delta from WS; could track over time
    }));
  }, [marketData]);

  const currentEpoch = latestEpoch || (isDev ? 3 : 0);
  const aliveCount = agents.filter((a) => a.alive).length;

  return (
    <div className="space-y-6">
      {/* Battle header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-cinzel text-2xl font-black tracking-wider text-gold">
            BATTLE #{battleId}
          </h1>
          {winner ? (
            <span className="rounded bg-gold/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-gold">
              FINISHED
            </span>
          ) : (
            <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-green-400 animate-pulse">
              LIVE
            </span>
          )}
          {/* Connection status */}
          <span
            className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${
              connected ? "text-green-500" : "text-gray-600"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                connected ? "bg-green-500" : "bg-gray-600"
              }`}
            />
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            Epoch <span className="text-white">{currentEpoch}</span>/20
          </span>
          <span>
            <span className="text-white">{aliveCount}</span> gladiators remain
          </span>
          <span className="hidden sm:inline text-gray-700">
            Pool: <span className="text-gold">2,450 $HNADS</span>
          </span>
        </div>
      </div>

      {/* Winner announcement */}
      {winner && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 text-center">
          <div className="font-cinzel text-2xl font-black tracking-widest text-gold">
            VICTORY
          </div>
          <div className="mt-1 text-sm text-white">
            <span className="font-bold">{winner.winnerName}</span> is the last
            nad standing after {winner.totalEpochs} epochs!
          </div>
        </div>
      )}

      {/* Cinematic top bar: epoch timer + pool + sponsor button */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <EpochTimer currentEpoch={currentEpoch} />
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
              Pool
            </h2>
            <span className="text-lg font-bold text-gold">2,450 $HNADS</span>
          </div>
          <div className="mt-2 h-px w-full bg-colosseum-surface-light" />
          <div className="mt-2 flex justify-between text-[10px] text-gray-600">
            <span>Bettors: 42</span>
            <span>Sponsors: 7</span>
          </div>
          <button
            onClick={() => setSponsorModalOpen(true)}
            className="mt-3 w-full rounded border border-gold/30 bg-gold/10 py-1.5 text-xs font-bold uppercase tracking-wider text-gold transition-all hover:bg-gold/20 active:scale-[0.98]"
          >
            Sponsor a Gladiator
          </button>
        </div>
      </div>

      {/* Main layout: arena + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Arena */}
        <div className="card lg:col-span-2">
          <ArenaLayout agents={agents} currentEpoch={currentEpoch} />
        </div>

        {/* Sidebar: betting panel + sponsors + market + feed */}
        <div className="flex flex-col gap-4">
          {/* Betting panel */}
          <div className="card">
            <BettingPanel agents={agents} battleId={battleId} />
          </div>

          {/* Sponsor feed */}
          <div className="card">
            <SponsorFeed />
          </div>

          {/* Market ticker */}
          <div className="card">
            <MarketTicker prices={prices} />
          </div>

          {/* Action feed */}
          <div className="card flex-1">
            <ActionFeed entries={feed} />
          </div>
        </div>
      </div>

      {/* Bottom dramatic footer */}
      <div className="text-center text-[10px] uppercase tracking-[0.3em] text-gray-700">
        May the nads be ever in your favor
      </div>

      {/* Sponsor modal */}
      <SponsorModal
        open={sponsorModalOpen}
        onClose={() => setSponsorModalOpen(false)}
        agents={agents}
      />
    </div>
  );
}
