import { AgentClass } from "@/types";

const CLASS_CONFIG: Record<
  AgentClass,
  { icon: string; image: string; badge: string; label: string }
> = {
  WARRIOR: { icon: "\u2694\uFE0F", image: "/agents/agent.warrior.png", badge: "badge-warrior", label: "Warrior" },
  TRADER: { icon: "\uD83D\uDCCA", image: "/agents/agent.trader.png", badge: "badge-trader", label: "Trader" },
  SURVIVOR: {
    icon: "\uD83D\uDEE1\uFE0F",
    image: "/agents/agent.survivor.png",
    badge: "badge-survivor",
    label: "Survivor",
  },
  PARASITE: {
    icon: "\uD83E\uDDA0",
    image: "/agents/agent.parasite.png",
    badge: "badge-parasite",
    label: "Parasite",
  },
  GAMBLER: { icon: "\uD83C\uDFB2", image: "/agents/agent.gambler.png", badge: "badge-gambler", label: "Gambler" },
};

interface StatsHeaderProps {
  name: string;
  agentClass: AgentClass;
  totalBattles: number;
  wins: number;
  losses: number;
  totalKills: number;
  avgSurvivalEpochs: number;
  currentStreak: number;
}

export function StatsHeader({
  name,
  agentClass,
  totalBattles,
  wins,
  losses,
  totalKills,
  avgSurvivalEpochs,
  currentStreak,
}: StatsHeaderProps) {
  const config = CLASS_CONFIG[agentClass];
  const winRate =
    totalBattles > 0 ? ((wins / totalBattles) * 100).toFixed(1) : "0.0";

  return (
    <div className="card">
      {/* Name and class */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-colosseum-bg text-3xl">
          <img
            src={config.image}
            alt={`${agentClass} portrait`}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement!.textContent = config.icon;
            }}
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-100">
            {name}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={config.badge}>{agentClass}</span>
            {currentStreak > 0 && (
              <span className="text-xs text-gold">
                {currentStreak}W streak
              </span>
            )}
            {currentStreak < 0 && (
              <span className="text-xs text-blood">
                {Math.abs(currentStreak)}L streak
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatBox label="Battles" value={String(totalBattles)} />
        <StatBox
          label="Win Rate"
          value={`${winRate}%`}
          highlight={Number(winRate) >= 50 ? "green" : "red"}
        />
        <StatBox label="Record" value={`${wins}W - ${losses}L`} />
        <StatBox label="Total Kills" value={String(totalKills)} />
        <StatBox
          label="Avg Survival"
          value={`${avgSurvivalEpochs.toFixed(1)} ep`}
        />
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "red";
}) {
  const valueColor =
    highlight === "green"
      ? "text-green-400"
      : highlight === "red"
        ? "text-blood-light"
        : "text-gray-100";

  return (
    <div className="rounded-md bg-colosseum-bg px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}
