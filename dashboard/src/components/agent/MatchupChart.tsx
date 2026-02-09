import { AgentClass } from "@/types";

const CLASS_COLORS: Record<AgentClass, { bar: string; text: string }> = {
  WARRIOR: { bar: "bg-blood", text: "text-blood" },
  TRADER: { bar: "bg-blue-500", text: "text-blue-400" },
  SURVIVOR: { bar: "bg-green-500", text: "text-green-400" },
  PARASITE: { bar: "bg-accent", text: "text-accent-light" },
  GAMBLER: { bar: "bg-gold", text: "text-gold" },
};

const CLASS_ICONS: Record<AgentClass, string> = {
  WARRIOR: "\u2694\uFE0F",
  TRADER: "\uD83D\uDCCA",
  SURVIVOR: "\uD83D\uDEE1\uFE0F",
  PARASITE: "\uD83E\uDDA0",
  GAMBLER: "\uD83C\uDFB2",
};

interface MatchupChartProps {
  matchups: Record<AgentClass, { wins: number; losses: number }>;
  ownClass: AgentClass;
}

export function MatchupChart({ matchups, ownClass }: MatchupChartProps) {
  const classes = (
    Object.keys(matchups) as AgentClass[]
  ).filter((c) => c !== ownClass);

  return (
    <div className="card">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
        Matchup History
      </h2>
      <div className="space-y-3">
        {classes.map((cls) => {
          const { wins, losses } = matchups[cls];
          const total = wins + losses;
          const winPct = total > 0 ? (wins / total) * 100 : 0;
          const lossPct = total > 0 ? (losses / total) * 100 : 0;
          const colors = CLASS_COLORS[cls];

          return (
            <div key={cls}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span>{CLASS_ICONS[cls]}</span>
                  <span className={`font-medium ${colors.text}`}>{cls}</span>
                </span>
                <span className="text-gray-500">
                  {wins}W - {losses}L
                </span>
              </div>
              <div className="flex h-4 overflow-hidden rounded bg-colosseum-bg">
                {winPct > 0 && (
                  <div
                    className={`${colors.bar} flex items-center justify-center transition-all`}
                    style={{ width: `${winPct}%` }}
                  >
                    {winPct >= 15 && (
                      <span className="text-[9px] font-bold text-white">
                        {winPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
                {lossPct > 0 && (
                  <div
                    className="flex items-center justify-center bg-gray-700 transition-all"
                    style={{ width: `${lossPct}%` }}
                  >
                    {lossPct >= 15 && (
                      <span className="text-[9px] font-bold text-gray-400">
                        {lossPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-blood" />
          Win
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-gray-700" />
          Loss
        </span>
      </div>
    </div>
  );
}
