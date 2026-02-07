import { DeathCause } from "@/types";

const CAUSE_CONFIG: Record<
  DeathCause,
  { label: string; color: string; description: string }
> = {
  prediction: {
    label: "Bad Predictions",
    color: "bg-blue-500",
    description: "Lost HP from wrong market calls",
  },
  combat: {
    label: "Combat",
    color: "bg-blood",
    description: "Killed by another agent's attack",
  },
  bleed: {
    label: "Bleed Out",
    color: "bg-accent",
    description: "Drained by 2% passive HP loss",
  },
  multi: {
    label: "Multi-Cause",
    color: "bg-gold",
    description: "Combination of damage sources",
  },
};

interface DeathCausesChartProps {
  deathCauses: Record<DeathCause, number>;
}

export function DeathCausesChart({ deathCauses }: DeathCausesChartProps) {
  const causes = Object.entries(deathCauses) as [DeathCause, number][];
  const maxCount = Math.max(...causes.map(([, count]) => count), 1);
  const totalDeaths = causes.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Death Causes
        </h2>
        <span className="text-xs text-gray-600">
          {totalDeaths} death{totalDeaths !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="mb-4 text-xs text-gray-600">
        How this agent gets REKT.
      </p>

      <div className="space-y-3">
        {causes.map(([cause, count]) => {
          const config = CAUSE_CONFIG[cause];
          const pct = totalDeaths > 0 ? (count / totalDeaths) * 100 : 0;
          const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;

          return (
            <div key={cause}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-gray-300">{config.label}</span>
                <span className="text-gray-500">
                  {count} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded bg-colosseum-bg">
                <div
                  className={`h-full ${config.color} rounded transition-all`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-gray-700">
                {config.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
