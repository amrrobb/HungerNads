"use client";

import { CLASS_CONFIG, type BattleAgent } from "./mock-data";

interface AgentCardProps {
  agent: BattleAgent;
  /** Optional: highlight when this agent is being targeted */
  highlighted?: boolean;
}

function HPBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  // Color shifts: green > 60, yellow > 30, red <= 30
  let barColor = "bg-green-500";
  if (pct <= 30) barColor = "bg-blood";
  else if (pct <= 60) barColor = "bg-gold";

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500">
        <span>HP</span>
        <span>
          {hp}/{maxHp}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-colosseum-bg">
        <div
          className={`hp-bar-fill h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Builds the composite CSS class string for the card based on all possible
 * animation states.  Priority order (highest wins):
 *   winner > dead > attacking > attacked > defending > prediction > idle
 */
function cardAnimationClass(agent: BattleAgent, cfg: (typeof CLASS_CONFIG)[keyof typeof CLASS_CONFIG]): string {
  const isDead = !agent.alive;

  // Winner state trumps everything
  if (agent.isWinner) {
    return "agent-winner border-gold bg-gold/10";
  }

  // Death
  if (isDead) {
    return "agent-rekt border-gray-800 bg-colosseum-surface/50";
  }

  // Attacking (pulsing red)
  if (agent.attacking) {
    return "agent-attacking border-blood bg-blood/5";
  }

  // Being attacked (flash)
  if (agent.attacked) {
    return `agent-attacked border-blood-light ${cfg.bgColor}`;
  }

  // Defending (blue/purple shield glow)
  if (agent.defending) {
    return "agent-defending border-accent bg-accent/10";
  }

  // Prediction result flash
  if (agent.predictionResult === "correct") {
    return `prediction-correct border-green-500 ${cfg.bgColor}`;
  }
  if (agent.predictionResult === "wrong") {
    return `prediction-wrong border-blood ${cfg.bgColor}`;
  }

  // Idle / normal
  return `border-colosseum-surface-light bg-colosseum-surface hover:${cfg.borderColor} hover:shadow-lg`;
}

export default function AgentCard({ agent, highlighted }: AgentCardProps) {
  const cfg = CLASS_CONFIG[agent.class];
  const isDead = !agent.alive;
  const isDefending = agent.defending;

  const animClass = cardAnimationClass(agent, cfg);

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg border p-4 transition-all duration-300
        ${animClass}
        ${highlighted ? "ring-2 ring-gold ring-offset-1 ring-offset-colosseum-bg" : ""}
      `}
    >
      {/* Death vignette overlay */}
      {isDead && <div className="death-vignette absolute inset-0 z-[5] pointer-events-none" />}

      {/* Defending shield overlay */}
      {isDefending && (
        <div className="absolute -right-2 -top-2 text-3xl opacity-40 animate-pulse">
          {"\uD83D\uDEE1\uFE0F"}
        </div>
      )}

      {/* REKT overlay for dead agents */}
      {isDead && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <span
            className="rekt-text rotate-[-12deg] text-4xl font-black tracking-widest text-blood/70 animate-rekt-glow select-none"
          >
            REKT
          </span>
        </div>
      )}

      {/* Winner crown */}
      {agent.isWinner && (
        <div className="absolute -right-1 -top-1 text-2xl animate-bounce">
          {"\uD83D\uDC51"}
        </div>
      )}

      {/* Header: emoji + name + class badge */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{cfg.emoji}</span>
          <div>
            <h3
              className={`text-sm font-bold tracking-wider ${
                isDead ? "text-gray-600" : agent.isWinner ? "text-gold" : "text-white"
              }`}
            >
              {agent.name}
            </h3>
            <span className={cfg.badgeClass}>{agent.class}</span>
          </div>
        </div>

        {/* Kill count */}
        {agent.kills > 0 && (
          <div className="flex items-center gap-1 text-xs text-blood">
            <span>{"\uD83D\uDDE1\uFE0F"}</span>
            <span>{agent.kills}</span>
          </div>
        )}
      </div>

      {/* HP Bar */}
      <div className={isDead ? "opacity-40" : ""}>
        <HPBar hp={agent.hp} maxHp={agent.maxHp} />
      </div>

      {/* Last action */}
      {agent.lastAction && (
        <p
          className={`mt-2 truncate text-[11px] italic ${isDead ? "text-gray-700" : "text-gray-500"}`}
        >
          {agent.lastAction}
        </p>
      )}

      {/* Status indicator dot */}
      {!isDead && (
        <div className="absolute right-2 top-2">
          <span
            className={`inline-block h-2 w-2 rounded-full transition-colors duration-300 ${
              agent.isWinner
                ? "bg-gold animate-ping"
                : isDefending
                  ? "bg-accent-light animate-pulse"
                  : agent.attacking
                    ? "bg-blood animate-ping"
                    : "bg-blood animate-pulse"
            }`}
          />
        </div>
      )}
    </div>
  );
}
