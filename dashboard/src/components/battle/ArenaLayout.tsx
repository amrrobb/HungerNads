"use client";

import AgentCard from "./AgentCard";
import type { BattleAgent } from "./mock-data";

interface ArenaLayoutProps {
  agents: BattleAgent[];
  currentEpoch: number;
}

/**
 * Pentagon arrangement of 5 agent cards around a central arena graphic.
 *
 * On larger screens, cards are positioned absolutely in a circular pattern.
 * On small screens, they stack vertically for readability.
 */
export default function ArenaLayout({ agents, currentEpoch }: ArenaLayoutProps) {
  // Pentagon vertex positions (% from center of container)
  // Starting from top-center, going clockwise
  const positions = [
    { top: "0%", left: "50%", transform: "translateX(-50%)" },             // top center
    { top: "26%", left: "97%", transform: "translateX(-100%)" },           // top right
    { top: "66%", left: "97%", transform: "translateX(-100%)" },           // bottom right
    { top: "66%", left: "3%", transform: "translateX(0%)" },               // bottom left
    { top: "26%", left: "3%", transform: "translateX(0%)" },               // top left
  ];

  const aliveCount = agents.filter((a) => a.alive).length;

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
            The Arena
          </h2>
          <span className="rounded bg-blood/20 px-2 py-0.5 text-xs font-medium text-blood">
            EPOCH {currentEpoch}
          </span>
        </div>
        <div className="text-xs text-gray-600">
          <span className="text-white">{aliveCount}</span>/{agents.length} alive
        </div>
      </div>

      {/* Desktop: Pentagon arrangement */}
      <div className="hidden lg:block">
        <div className="relative mx-auto" style={{ height: "580px", maxWidth: "700px" }}>
          {/* Central arena glow */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-40 w-40 rounded-full bg-blood/5 blur-3xl" />
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-24 w-24 rounded-full border border-blood/20" />
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-48 w-48 rounded-full border border-colosseum-surface-light/30" />
          </div>

          {/* Center text */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gray-700">
              Colosseum
            </div>
          </div>

          {/* Connection lines (subtle) */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 700 580"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Pentagon outline connecting agents */}
            <polygon
              points="350,25 650,190 580,440 120,440 50,190"
              stroke="rgba(37,37,64,0.5)"
              strokeWidth="1"
              fill="none"
            />
          </svg>

          {/* Agent cards positioned at pentagon vertices */}
          {agents.map((agent, i) => (
            <div
              key={agent.id}
              className="absolute w-48"
              style={positions[i]}
            >
              <AgentCard agent={agent} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: vertical stack */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
