"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import type { AgentState } from "@/types";
import { CLASS_CONFIG } from "@/components/battle/mock-data";
import { usePlaceBet } from "@/lib/contracts";
import useFetch from "@/hooks/useFetch";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** GET /battle/:id/odds response */
interface OddsResponse {
  battleId: string;
  totalPool: number;
  perAgent: Record<string, number>;
  odds: Record<string, number>;
}

/** GET /user/:address/bets response */
interface UserBetsResponse {
  userAddress: string;
  bets: UserBet[];
  count: number;
}

interface UserBet {
  id: string;
  battle_id: string;
  agent_id: string;
  amount: number;
  payout: number;
  settled: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface BettingPanelProps {
  agents: AgentState[];
  battleId: string;
}

export default function BettingPanel({ agents, battleId }: BettingPanelProps) {
  // ── Wallet state via wagmi ──
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();

  // ── Local UI state ──
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [error, setError] = useState("");
  const [betSuccess, setBetSuccess] = useState(false);

  // ── Fetch live odds from API ──
  const { data: oddsData, loading: oddsLoading } = useFetch<OddsResponse>(
    `/battle/${battleId}/odds`,
    { pollInterval: 15_000 },
  );

  // ── Fetch user bets from API (only when connected) ──
  const {
    data: userBetsData,
    loading: userBetsLoading,
    refetch: refetchUserBets,
  } = useFetch<UserBetsResponse>(
    `/user/${address}/bets?battleId=${battleId}`,
    { skip: !isConnected || !address },
  );

  // ── On-chain bet via wagmi ──
  const {
    placeBet: onChainPlaceBet,
    isPending: isBetPending,
    isSuccess: isBetSuccess,
    error: betError,
  } = usePlaceBet();

  // Reset form on successful bet
  useEffect(() => {
    if (isBetSuccess) {
      setBetAmount("");
      setSelectedAgentId("");
      setBetSuccess(true);
      refetchUserBets();
      const timer = setTimeout(() => setBetSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isBetSuccess, refetchUserBets]);

  // Surface contract errors
  useEffect(() => {
    if (betError) {
      setError(betError.message.slice(0, 120));
    }
  }, [betError]);

  const aliveAgents = useMemo(() => agents.filter((a) => a.alive), [agents]);

  // Derive odds for each alive agent using API data, fallback to equal odds
  const agentOdds = useMemo(() => {
    const apiOdds = oddsData?.odds ?? {};
    return aliveAgents.map((agent) => {
      const multiplier = apiOdds[agent.id] ?? 5.0;
      return {
        ...agent,
        odds: multiplier,
        impliedProbability: (1 / multiplier) * 100,
      };
    });
  }, [aliveAgents, oddsData]);

  // Resolve user bets with agent names for display
  const myBets = useMemo(() => {
    if (!userBetsData?.bets) return [];
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    return userBetsData.bets.map((bet) => {
      const agent = agentMap.get(bet.agent_id);
      const agentOddsEntry = agentOdds.find((a) => a.id === bet.agent_id);
      return {
        ...bet,
        agentName: agent?.name ?? bet.agent_id.slice(0, 8),
        currentOdds: agentOddsEntry?.odds ?? 1,
      };
    });
  }, [userBetsData, agents, agentOdds]);

  // Calculate potential payout
  const selectedAgent = agentOdds.find((a) => a.id === selectedAgentId);
  const parsedAmount = parseFloat(betAmount);
  const potentialPayout =
    selectedAgent && !isNaN(parsedAmount) && parsedAmount > 0
      ? (parsedAmount * selectedAgent.odds).toFixed(2)
      : null;

  const validate = useCallback((): boolean => {
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
  }, [selectedAgentId, parsedAmount]);

  function handlePlaceBet() {
    if (!isConnected) {
      connect({ connector: injected() });
      return;
    }
    if (!validate()) return;

    // Find the numeric index of the selected agent for the on-chain call.
    // The contract uses uint256 agentId — we use the agent's index in the
    // alive list as a simple mapping. For off-chain fallback we use the UUID.
    const agentIndex = agents.findIndex((a) => a.id === selectedAgentId);

    // Try on-chain bet first
    try {
      onChainPlaceBet({
        battleId,
        agentId: agentIndex >= 0 ? agentIndex : 0,
        amountMon: betAmount,
      });
    } catch {
      // If on-chain fails (e.g. contract not deployed), fall back to off-chain
      placeBetOffChain();
    }
  }

  async function placeBetOffChain() {
    setError("");
    const API_BASE =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
    try {
      const res = await fetch(`${API_BASE}/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          battleId,
          userAddress: address,
          agentId: selectedAgentId,
          amount: parsedAmount,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error ?? `HTTP ${res.status}`,
        );
      }

      setBetAmount("");
      setSelectedAgentId("");
      setBetSuccess(true);
      refetchUserBets();
      setTimeout(() => setBetSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const isSubmitting = isBetPending || isConnecting;

  return (
    <div className="space-y-4">
      {/* ------- ODDS TABLE ------- */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
            Live Odds
          </h2>
          {oddsData && (
            <span className="text-[10px] text-gray-600">
              Pool: {oddsData.totalPool.toFixed(0)} $HNADS
            </span>
          )}
        </div>
        {oddsLoading && !oddsData ? (
          <p className="text-xs text-gray-600 animate-pulse">
            Loading odds...
          </p>
        ) : (
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
        )}
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
              {CLASS_CONFIG[agent.class].emoji} {agent.name} (
              {agent.odds.toFixed(1)}x)
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
            <span className="font-bold text-gold">
              {potentialPayout} $HNADS
            </span>
          </div>
        )}

        {/* Success message */}
        {betSuccess && (
          <p className="mb-2 text-xs text-green-400">
            Bet placed successfully!
          </p>
        )}

        {/* Error */}
        {error && <p className="mb-2 text-xs text-blood">{error}</p>}

        {/* Place bet / connect wallet button */}
        <button
          onClick={handlePlaceBet}
          disabled={isSubmitting}
          className={`w-full rounded py-2.5 text-sm font-bold uppercase tracking-wider transition-all ${
            isConnected
              ? "bg-blood text-white hover:bg-blood-dark active:scale-[0.98] disabled:opacity-60"
              : "bg-gold/20 text-gold hover:bg-gold/30"
          }`}
        >
          {isSubmitting
            ? isConnecting
              ? "Connecting..."
              : "Placing..."
            : isConnected
              ? "Place Bet"
              : "Connect Wallet"}
        </button>
      </div>

      {/* ------- MY ACTIVE BETS ------- */}
      {isConnected && (
        <div className="border-t border-colosseum-surface-light pt-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
            Your Bets
          </h2>
          {userBetsLoading ? (
            <p className="text-xs text-gray-600 animate-pulse">
              Loading bets...
            </p>
          ) : myBets.length === 0 ? (
            <p className="text-xs text-gray-600">No bets placed yet</p>
          ) : (
            <div className="space-y-2">
              {myBets.map((bet) => (
                <div
                  key={bet.id}
                  className="flex items-center justify-between rounded border border-colosseum-surface-light bg-colosseum-bg/50 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-white">
                      {bet.agentName}
                    </span>
                    <span className="ml-2 text-gray-500">
                      {bet.amount} $HNADS
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-gold">
                      {bet.currentOdds.toFixed(1)}x
                    </span>
                    <span className="ml-2 text-gray-600">
                      = {(bet.amount * bet.currentOdds).toFixed(0)}
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
