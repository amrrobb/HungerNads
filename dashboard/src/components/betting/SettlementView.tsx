"use client";

import { useMemo } from "react";
import type { AgentState, AgentClass } from "@/types";
import { CLASS_CONFIG } from "@/components/battle/mock-data";
import AgentPortrait from "@/components/battle/AgentPortrait";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettledBet {
  id: string;
  agent_id: string;
  agentName: string;
  agentClass?: AgentClass;
  amount: number;
  payout: number;
  settled: boolean;
}

interface WinnerInfo {
  winnerId: string;
  winnerName: string;
  totalEpochs: number;
}

interface SettlementViewProps {
  winner: WinnerInfo;
  agents: AgentState[];
  bets: SettledBet[];
  totalPool: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettlementView({
  winner,
  agents,
  bets,
  totalPool,
}: SettlementViewProps) {
  const winnerAgent = agents.find((a) => a.id === winner.winnerId);
  const winnerCfg = winnerAgent
    ? CLASS_CONFIG[winnerAgent.class]
    : CLASS_CONFIG.WARRIOR;

  // Calculate settlement for each bet
  const settledBets = useMemo(() => {
    return bets.map((bet) => {
      const isWinningBet = bet.agent_id === winner.winnerId;
      return {
        ...bet,
        won: isWinningBet,
        // If payout was already calculated by API, use it; otherwise estimate
        actualPayout: isWinningBet ? bet.payout || bet.amount * 2 : 0,
      };
    });
  }, [bets, winner.winnerId]);

  const totalWagered = settledBets.reduce((sum, b) => sum + b.amount, 0);
  const totalPayout = settledBets.reduce((sum, b) => sum + b.actualPayout, 0);
  const netResult = totalPayout - totalWagered;
  const hasWinningBets = settledBets.some((b) => b.won);

  return (
    <div className="space-y-4">
      {/* Winner banner */}
      <div className="relative overflow-hidden rounded-lg border border-gold/30 bg-gradient-to-br from-gold/10 via-colosseum-surface to-gold/5 p-4 text-center">
        {/* Background glow effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-gold/5 to-transparent" />

        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.3em] text-gold/60">
            Battle Complete
          </div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <AgentPortrait
              image={winnerCfg.image}
              emoji={winnerCfg.emoji}
              alt={winner.winnerName}
              size="w-8 h-8"
              className="text-2xl"
            />
            <span className="font-cinzel text-xl font-black tracking-wider text-gold">
              {winner.winnerName}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-gray-500">
            Last nad standing after {winner.totalEpochs} epochs
          </div>
          <div className="mt-2 text-[10px] text-gray-600">
            Total pool:{" "}
            <span className="font-bold text-gold">
              {totalPool.toFixed(0)} $HNADS
            </span>
          </div>
        </div>
      </div>

      {/* Your results */}
      {settledBets.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
            Your Results
          </h3>

          {/* Net result banner */}
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-center ${
              netResult > 0
                ? "border-green-500/30 bg-green-500/10"
                : netResult < 0
                  ? "border-blood/30 bg-blood/10"
                  : "border-colosseum-surface-light bg-colosseum-bg/50"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-500">
              {netResult > 0
                ? "Profit"
                : netResult < 0
                  ? "Loss"
                  : "Break Even"}
            </div>
            <div
              className={`text-lg font-bold ${
                netResult > 0
                  ? "text-green-400"
                  : netResult < 0
                    ? "text-blood"
                    : "text-gray-400"
              }`}
            >
              {netResult > 0 ? "+" : ""}
              {netResult.toFixed(2)} $HNADS
            </div>
            <div className="mt-0.5 text-[10px] text-gray-600">
              Wagered: {totalWagered.toFixed(0)} | Returned:{" "}
              {totalPayout.toFixed(0)}
            </div>
          </div>

          {/* Individual bets */}
          <div className="space-y-1.5">
            {settledBets.map((bet) => {
              const cfg = bet.agentClass
                ? CLASS_CONFIG[bet.agentClass]
                : null;
              return (
                <div
                  key={bet.id}
                  className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                    bet.won
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-blood/20 bg-blood/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {cfg && (
                      <AgentPortrait
                        image={cfg.image}
                        emoji={cfg.emoji}
                        alt={bet.agentName}
                        size="w-5 h-5"
                        className="text-sm"
                      />
                    )}
                    <div>
                      <span className="font-bold text-white">
                        {bet.agentName}
                      </span>
                      <span className="ml-2 text-gray-500">
                        {bet.amount} $HNADS
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    {bet.won ? (
                      <div>
                        <span className="font-bold text-green-400">WON</span>
                        <div className="text-[10px] text-green-400/80">
                          +{(bet.actualPayout - bet.amount).toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="font-bold text-blood">LOST</span>
                        <div className="text-[10px] text-blood/80">
                          -{bet.amount.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded border border-colosseum-surface-light bg-colosseum-bg/30 p-4 text-center">
          <p className="text-xs text-gray-600">
            You did not place any bets this battle
          </p>
          <p className="mt-1 text-[10px] text-gray-700">
            Next time, may the odds be in your favor
          </p>
        </div>
      )}

      {/* Dramatic footer */}
      {hasWinningBets && (
        <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 text-center">
          <div className="text-xs font-bold text-gold">
            THE CROWD REMEMBERS YOUR FORESIGHT
          </div>
          <div className="mt-0.5 text-[10px] text-gray-600">
            Your winning streak continues
          </div>
        </div>
      )}
    </div>
  );
}
