"use client";

import { useState, useMemo } from "react";
import type { AgentState } from "@/types";
import { CLASS_CONFIG } from "@/components/battle/mock-data";

// ---------------------------------------------------------------------------
// Mock odds (multipliers) per agent class
// ---------------------------------------------------------------------------
const MOCK_ODDS: Record<string, number> = {
  WARRIOR: 2.5,
  TRADER: 3.1,
  SURVIVOR: 4.2,
  PARASITE: 6.0,
  GAMBLER: 8.5,
};

// Mock active bets for the connected user
const MOCK_MY_BETS = [
  { id: "bet-1", agentId: "agent-1", agentName: "BLOODFANG", amount: 100, odds: 2.5, placedAt: Date.now() - 600_000 },
  { id: "bet-2", agentId: "agent-5", agentName: "MADLAD", amount: 25, odds: 8.5, placedAt: Date.now() - 300_000 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface BettingPanelProps {
  agents: AgentState[];
  battleId: string;
}

export default function BettingPanel({ agents, battleId }: BettingPanelProps) {
  // battleId will be used for real API calls
  void battleId;

  const [connected, setConnected] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const aliveAgents = useMemo(() => agents.filter((a) => a.alive), [agents]);

  // Derive odds for each alive agent
  const agentOdds = useMemo(() => {
    return aliveAgents.map((agent) => ({
      ...agent,
      odds: MOCK_ODDS[agent.class] ?? 5.0,
      impliedProbability: (1 / (MOCK_ODDS[agent.class] ?? 5.0)) * 100,
    }));
  }, [aliveAgents]);

  // Calculate potential payout
  const selectedAgent = agentOdds.find((a) => a.id === selectedAgentId);
  const parsedAmount = parseFloat(betAmount);
  const potentialPayout =
    selectedAgent && !isNaN(parsedAmount) && parsedAmount > 0
      ? (parsedAmount * selectedAgent.odds).toFixed(2)
      : null;

  function validate(): boolean {
    if (!selectedAgentId) {
      setError("Select a gladiator to bet on");
      return false;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid bet amount");
      return false;
    }
    if (parsedAmount < 1) {
      setError("Minimum bet is 1 $HNADS");
      return false;
    }
    setError("");
    return true;
  }

  function handlePlaceBet() {
    if (!connected) {
      // Simulate wallet connect
      setConnected(true);
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    // Mock submission delay
    setTimeout(() => {
      setSubmitting(false);
      setBetAmount("");
      setSelectedAgentId("");
    }, 800);
  }

  return (
    <div className="space-y-4">
      {/* ------- ODDS TABLE ------- */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Live Odds
        </h2>
        <div className="space-y-2">
          {agentOdds.map((agent) => {
            const cfg = CLASS_CONFIG[agent.class];
            return (
              <div
                key={agent.id}
                className="flex items-center justify-between rounded border border-colosseum-surface-light bg-colosseum-bg/50 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{cfg.emoji}</span>
                  <span className="font-bold text-white">{agent.name}</span>
                  <span className={cfg.badgeClass}>{agent.class}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">
                    {agent.impliedProbability.toFixed(0)}%
                  </span>
                  <span className="min-w-[3rem] rounded bg-gold/20 px-2 py-0.5 text-center font-bold text-gold">
                    {agent.odds.toFixed(1)}x
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------- BET FORM ------- */}
      <div className="border-t border-colosseum-surface-light pt-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Place Bet
        </h2>

        {/* Agent select */}
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-600">
          Gladiator
        </label>
        <select
          value={selectedAgentId}
          onChange={(e) => {
            setSelectedAgentId(e.target.value);
            setError("");
          }}
          className="mb-3 w-full rounded border border-colosseum-surface-light bg-colosseum-bg px-3 py-2 text-sm text-white outline-none focus:border-blood transition-colors"
        >
          <option value="">-- select gladiator --</option>
          {agentOdds.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {CLASS_CONFIG[agent.class].emoji} {agent.name} ({agent.odds.toFixed(1)}x)
            </option>
          ))}
        </select>

        {/* Amount input */}
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-600">
          Amount ($HNADS)
        </label>
        <div className="relative mb-3">
          <input
            type="number"
            min="1"
            step="1"
            placeholder="0"
            value={betAmount}
            onChange={(e) => {
              setBetAmount(e.target.value);
              setError("");
            }}
            className="w-full rounded border border-colosseum-surface-light bg-colosseum-bg px-3 py-2 pr-16 text-sm text-white outline-none focus:border-blood transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-gray-600">
            $HNADS
          </span>
        </div>

        {/* Potential payout */}
        {potentialPayout && (
          <div className="mb-3 flex items-center justify-between rounded bg-gold/10 px-3 py-2 text-xs">
            <span className="text-gray-400">Potential payout</span>
            <span className="font-bold text-gold">{potentialPayout} $HNADS</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mb-2 text-xs text-blood">{error}</p>
        )}

        {/* Place bet / connect wallet button */}
        <button
          onClick={handlePlaceBet}
          disabled={submitting}
          className={`w-full rounded py-2.5 text-sm font-bold uppercase tracking-wider transition-all ${
            connected
              ? "bg-blood text-white hover:bg-blood-dark active:scale-[0.98] disabled:opacity-60"
              : "bg-gold/20 text-gold hover:bg-gold/30"
          }`}
        >
          {submitting
            ? "Placing..."
            : connected
              ? "Place Bet"
              : "Connect Wallet"}
        </button>
      </div>

      {/* ------- MY ACTIVE BETS ------- */}
      {connected && (
        <div className="border-t border-colosseum-surface-light pt-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
            Your Bets
          </h2>
          {MOCK_MY_BETS.length === 0 ? (
            <p className="text-xs text-gray-600">No bets placed yet</p>
          ) : (
            <div className="space-y-2">
              {MOCK_MY_BETS.map((bet) => (
                <div
                  key={bet.id}
                  className="flex items-center justify-between rounded border border-colosseum-surface-light bg-colosseum-bg/50 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-white">{bet.agentName}</span>
                    <span className="ml-2 text-gray-500">
                      {bet.amount} $HNADS
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-gold">{bet.odds}x</span>
                    <span className="ml-2 text-gray-600">
                      = {(bet.amount * bet.odds).toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
