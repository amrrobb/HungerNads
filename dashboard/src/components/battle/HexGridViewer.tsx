"use client";

import { useMemo, useCallback } from "react";
import { CLASS_CONFIG, type BattleAgent } from "./mock-data";
import type { AgentClass } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HexCoord {
  q: number;
  r: number;
}

export interface AgentPosition {
  agentId: string;
  hex: HexCoord;
}

export interface HexGridViewerProps {
  agents: BattleAgent[];
  /**
   * Map of agentId -> hex coordinate. When omitted, agents are auto-placed
   * around the grid in a deterministic pattern (outer ring first, then center).
   */
  positions?: AgentPosition[];
  /** Currently selected agent ID */
  selectedAgentId?: string;
  /** Callback when an agent hex is clicked */
  onSelectAgent?: (agentId: string) => void;
  /** Compact mode reduces padding and hides labels. Default: false. */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Arena hex definitions (mirrored from src/arena/grid.ts for frontend use)
// ---------------------------------------------------------------------------

interface ArenaHex extends HexCoord {
  label: string;
}

const ARENA_HEXES: ArenaHex[] = [
  { q: 0, r: 0, label: "CENTER" },
  { q: 1, r: 0, label: "E" },
  { q: 0, r: 1, label: "SE" },
  { q: -1, r: 1, label: "SW" },
  { q: -1, r: 0, label: "W" },
  { q: 0, r: -1, label: "NW" },
  { q: 1, r: -1, label: "NE" },
];

// Default placement order: outer ring (E, NE, NW, W, SW, SE) then center.
// This spreads agents out for maximum readability.
const DEFAULT_PLACEMENT_ORDER = [
  { q: 1, r: 0 },   // E
  { q: -1, r: 0 },  // W
  { q: 1, r: -1 },  // NE
  { q: -1, r: 1 },  // SW
  { q: 0, r: -1 },  // NW
  { q: 0, r: 1 },   // SE
  { q: 0, r: 0 },   // CENTER
];

// ---------------------------------------------------------------------------
// Geometry helpers — flat-top hexagons
// ---------------------------------------------------------------------------

const HEX_SIZE = 38; // Radius of each hex (corner-to-center)
const SQRT3 = Math.sqrt(3);

/** Convert axial (q, r) to pixel (x, y) for flat-top hexagons. */
function axialToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (3 / 2) * q;
  const y = HEX_SIZE * ((SQRT3 / 2) * q + SQRT3 * r);
  return { x, y };
}

/** Generate the 6-vertex polygon points string for a flat-top hex. */
function hexPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    pts.push(
      `${cx + size * Math.cos(angleRad)},${cy + size * Math.sin(angleRad)}`,
    );
  }
  return pts.join(" ");
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Hex fill color based on agent class (muted version for the hex background). */
function classHexFill(agentClass: AgentClass): string {
  const fills: Record<AgentClass, string> = {
    WARRIOR: "rgba(220,38,38,0.15)",
    TRADER: "rgba(96,165,250,0.15)",
    SURVIVOR: "rgba(74,222,128,0.15)",
    PARASITE: "rgba(167,139,250,0.15)",
    GAMBLER: "rgba(245,158,11,0.15)",
  };
  return fills[agentClass];
}

/** Agent dot fill color (solid). */
function classDotFill(agentClass: AgentClass): string {
  const fills: Record<AgentClass, string> = {
    WARRIOR: "#dc2626",
    TRADER: "#60a5fa",
    SURVIVOR: "#4ade80",
    PARASITE: "#a78bfa",
    GAMBLER: "#f59e0b",
  };
  return fills[agentClass];
}

/** HP percentage to ring color. */
function hpColor(hp: number, maxHp: number): string {
  const pct = (hp / maxHp) * 100;
  if (pct <= 0) return "#374151";     // gray-700 (dead)
  if (pct <= 30) return "#dc2626";    // blood
  if (pct <= 60) return "#f59e0b";    // gold
  return "#22c55e";                    // green
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HexCellProps {
  hex: ArenaHex;
  cx: number;
  cy: number;
  agent?: BattleAgent;
  isSelected: boolean;
  showLabel: boolean;
  onSelect?: (agentId: string) => void;
}

function HexCell({ hex, cx, cy, agent, isSelected, showLabel, onSelect }: HexCellProps) {
  const isEmpty = !agent;
  const isDead = agent && !agent.alive;

  const handleClick = useCallback(() => {
    if (agent && onSelect) {
      onSelect(agent.id);
    }
  }, [agent, onSelect]);

  // Hex polygon fill
  let fill = "rgba(26,26,46,0.6)"; // colosseum-surface with alpha
  let strokeColor = "rgba(37,37,64,0.8)"; // surface-light
  let strokeWidth = 1;

  if (agent) {
    fill = classHexFill(agent.class);
    if (isDead) {
      fill = "rgba(26,26,46,0.3)";
      strokeColor = "rgba(55,65,81,0.5)";
    }
  }

  if (isSelected) {
    strokeColor = "#f59e0b"; // gold
    strokeWidth = 2;
  }

  const cfg = agent ? CLASS_CONFIG[agent.class] : null;
  const hpPct = agent ? Math.max(0, (agent.hp / agent.maxHp) * 100) : 0;

  return (
    <g
      className={agent ? "cursor-pointer" : ""}
      onClick={handleClick}
      role={agent ? "button" : undefined}
      tabIndex={agent ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
      {/* Hex outline */}
      <polygon
        points={hexPoints(cx, cy, HEX_SIZE - 1)}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        className="transition-all duration-200"
      />

      {/* Selected glow ring */}
      {isSelected && (
        <polygon
          points={hexPoints(cx, cy, HEX_SIZE + 2)}
          fill="none"
          stroke="rgba(245,158,11,0.3)"
          strokeWidth={1.5}
        />
      )}

      {agent && !isDead && (
        <>
          {/* HP ring — circular arc behind the agent dot */}
          <circle
            cx={cx}
            cy={cy}
            r={14}
            fill="none"
            stroke="rgba(55,65,81,0.4)"
            strokeWidth={2.5}
          />
          <circle
            cx={cx}
            cy={cy}
            r={14}
            fill="none"
            stroke={hpColor(agent.hp, agent.maxHp)}
            strokeWidth={2.5}
            strokeDasharray={`${(hpPct / 100) * 2 * Math.PI * 14} ${2 * Math.PI * 14}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            className="transition-all duration-500"
          />

          {/* Agent class emoji (centered) */}
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            className="pointer-events-none select-none"
          >
            {cfg?.emoji}
          </text>

          {/* Agent name (below) */}
          <text
            x={cx}
            y={cy + 22}
            textAnchor="middle"
            fontSize={7}
            fontWeight="bold"
            fill="rgba(255,255,255,0.8)"
            letterSpacing="0.5"
            className="pointer-events-none select-none uppercase"
          >
            {agent.name.length > 8 ? agent.name.slice(0, 7) + "." : agent.name}
          </text>
        </>
      )}

      {/* Dead agent — skull + faded */}
      {agent && isDead && (
        <>
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            className="pointer-events-none select-none"
            opacity={0.4}
          >
            {"\uD83D\uDC80"}
          </text>
          <text
            x={cx}
            y={cy + 22}
            textAnchor="middle"
            fontSize={7}
            fontWeight="bold"
            fill="rgba(255,255,255,0.25)"
            letterSpacing="0.5"
            className="pointer-events-none select-none uppercase"
          >
            {agent.name.length > 8 ? agent.name.slice(0, 7) + "." : agent.name}
          </text>
        </>
      )}

      {/* Empty hex label (e.g. "NW", "CENTER") */}
      {isEmpty && showLabel && (
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={7}
          fill="rgba(107,114,128,0.4)"
          letterSpacing="1"
          className="pointer-events-none select-none uppercase"
        >
          {hex.label}
        </text>
      )}

      {/* Defending indicator */}
      {agent?.defending && !isDead && (
        <circle
          cx={cx}
          cy={cy}
          r={17}
          fill="none"
          stroke="rgba(124,58,237,0.6)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          className="animate-spin"
          style={{ animationDuration: "4s" }}
        />
      )}

      {/* Attacking indicator (pulsing outer ring) */}
      {agent?.attacking && !isDead && (
        <circle
          cx={cx}
          cy={cy}
          r={17}
          fill="none"
          stroke="rgba(220,38,38,0.5)"
          strokeWidth={1.5}
          className="animate-ping"
          style={{ animationDuration: "1.5s" }}
        />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HexGridViewer({
  agents,
  positions,
  selectedAgentId,
  onSelectAgent,
  compact = false,
}: HexGridViewerProps) {
  // Build the position map: agentId -> HexCoord
  const positionMap = useMemo(() => {
    const map = new Map<string, HexCoord>();

    if (positions && positions.length > 0) {
      for (const pos of positions) {
        map.set(pos.agentId, pos.hex);
      }
    } else {
      // Auto-place agents around the grid deterministically
      const aliveFirst = [...agents].sort((a, b) => {
        if (a.alive && !b.alive) return -1;
        if (!a.alive && b.alive) return 1;
        return 0;
      });
      aliveFirst.forEach((agent, i) => {
        if (i < DEFAULT_PLACEMENT_ORDER.length) {
          map.set(agent.id, DEFAULT_PLACEMENT_ORDER[i]);
        }
      });
    }

    return map;
  }, [agents, positions]);

  // Build hex -> agent lookup
  const hexAgentMap = useMemo(() => {
    const map = new Map<string, BattleAgent>();
    for (const agent of agents) {
      const pos = positionMap.get(agent.id);
      if (pos) {
        map.set(`${pos.q},${pos.r}`, agent);
      }
    }
    return map;
  }, [agents, positionMap]);

  // Compute SVG viewBox: find the bounding box of all hex centers, add padding
  const { viewBox, centers } = useMemo(() => {
    const c: { hex: ArenaHex; x: number; y: number }[] = ARENA_HEXES.map((hex) => {
      const { x, y } = axialToPixel(hex.q, hex.r);
      return { hex, x, y };
    });

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const { x, y } of c) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const pad = HEX_SIZE + 16;
    return {
      viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`,
      centers: c,
    };
  }, []);

  const aliveCount = agents.filter((a) => a.alive).length;

  return (
    <div className={compact ? "w-full" : "w-full"}>
      {/* Header */}
      {!compact && (
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Arena Map
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blood" />
            <span className="text-[9px] uppercase tracking-wider text-gray-600">
              {aliveCount}/{agents.length}
            </span>
          </div>
        </div>
      )}

      {/* SVG hex grid */}
      <svg
        viewBox={viewBox}
        className="mx-auto w-full"
        style={{ maxWidth: compact ? "180px" : "240px" }}
        role="img"
        aria-label={`Arena hex grid with ${agents.length} agents, ${aliveCount} alive`}
      >
        {/* Subtle center glow */}
        <defs>
          <radialGradient id="hex-grid-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(220,38,38,0.08)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle
          cx={0}
          cy={0}
          r={HEX_SIZE * 2.5}
          fill="url(#hex-grid-glow)"
        />

        {/* Adjacency lines (subtle connections between hexes) */}
        {centers.map((a, i) =>
          centers
            .slice(i + 1)
            .filter((b) => {
              const dq = a.hex.q - b.hex.q;
              const dr = a.hex.r - b.hex.r;
              const ds = -(dq + dr);
              return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) === 1;
            })
            .map((b) => (
              <line
                key={`${a.hex.q},${a.hex.r}-${b.hex.q},${b.hex.r}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(37,37,64,0.4)"
                strokeWidth={0.5}
              />
            )),
        )}

        {/* Hex cells */}
        {centers.map(({ hex, x, y }) => {
          const key = `${hex.q},${hex.r}`;
          const agent = hexAgentMap.get(key);
          return (
            <HexCell
              key={key}
              hex={hex}
              cx={x}
              cy={y}
              agent={agent}
              isSelected={agent?.id === selectedAgentId}
              showLabel={!compact}
              onSelect={onSelectAgent}
            />
          );
        })}
      </svg>

      {/* Legend (non-compact only) */}
      {!compact && (
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {(["WARRIOR", "TRADER", "SURVIVOR", "PARASITE", "GAMBLER"] as AgentClass[]).map(
            (cls) => {
              const hasAgent = agents.some((a) => a.class === cls && a.alive);
              if (!hasAgent) return null;
              return (
                <div key={cls} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: classDotFill(cls) }}
                  />
                  <span className="text-[8px] uppercase tracking-wider text-gray-600">
                    {cls}
                  </span>
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
