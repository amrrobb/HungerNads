import Link from "next/link";
import type { AgentState } from "@/types";

interface BattleCardProps {
  battleId: string;
  agents: AgentState[];
  currentEpoch: number;
  totalPool: number;
}

const CLASS_COLORS: Record<string, string> = {
  WARRIOR: "bg-blood",
  TRADER: "bg-blue-500",
  SURVIVOR: "bg-green-500",
  PARASITE: "bg-accent",
  GAMBLER: "bg-gold",
};

const CLASS_TEXT: Record<string, string> = {
  WARRIOR: "text-blood",
  TRADER: "text-blue-400",
  SURVIVOR: "text-green-400",
  PARASITE: "text-accent-light",
  GAMBLER: "text-gold",
};

export default function BattleCard({
  battleId,
  agents,
  currentEpoch,
  totalPool,
}: BattleCardProps) {
  const alive = agents.filter((a) => a.alive).length;

  return (
    <Link href={`/battle/${battleId}`} className="block">
      <div className="card group transition-colors hover:border-blood/50">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-200">
              BATTLE #{battleId}
            </span>
            <span className="rounded bg-blood/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blood">
              Live
            </span>
          </div>
          <span className="text-xs text-gray-500">
            Epoch {currentEpoch}
          </span>
        </div>

        {/* Agent HP bars */}
        <div className="mb-3 space-y-2">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2">
              <span
                className={`w-16 truncate text-xs font-medium ${
                  agent.alive ? CLASS_TEXT[agent.class] : "text-gray-600 line-through"
                }`}
              >
                {agent.name}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-colosseum-surface-light">
                <div
                  className={`h-full rounded-full transition-all ${
                    agent.alive
                      ? CLASS_COLORS[agent.class]
                      : "bg-gray-700"
                  }`}
                  style={{
                    width: `${Math.max(0, (agent.hp / agent.maxHp) * 100)}%`,
                  }}
                />
              </div>
              <span className="w-10 text-right text-[10px] text-gray-500">
                {agent.alive ? agent.hp : "REKT"}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-colosseum-surface-light pt-2">
          <span className="text-xs text-gray-500">
            {alive}/5 alive
          </span>
          <span className="text-xs text-gold">
            Pool: {totalPool.toLocaleString()} $HNADS
          </span>
        </div>
      </div>
    </Link>
  );
}
