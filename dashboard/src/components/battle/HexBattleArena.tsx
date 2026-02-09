"use client";

import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import { CLASS_CONFIG, type BattleAgent } from "./mock-data";
import type { AgentClass } from "@/types";
import ParticleEffects, { useParticleEffects } from "./ParticleEffects";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HexCoord {
  q: number;
  r: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  createdAt: number;
}

interface HexBattleArenaProps {
  agents: BattleAgent[];
  currentEpoch: number;
  /** Optional: Map of agentId -> HexCoord from backend. Falls back to auto-assignment. */
  agentPositions?: Map<string, HexCoord>;
  /** Number of sponsor events seen so far. Increment to trigger gold rain effect. */
  sponsorEventCount?: number;
}

// ---------------------------------------------------------------------------
// Constants -- hex geometry (flat-top)
// ---------------------------------------------------------------------------

/**
 * Flat-top hex size (outer radius = center to vertex).
 * All hex geometry derives from this.
 */
const HEX_SIZE = 70;
const SQRT3 = Math.sqrt(3);

/** The 7-hex arena in axial coords, matching src/arena/grid.ts */
const ARENA_HEXES: (HexCoord & { label: string })[] = [
  { q: 0, r: 0, label: "CENTER" },
  { q: 1, r: 0, label: "E" },
  { q: 0, r: 1, label: "SE" },
  { q: -1, r: 1, label: "SW" },
  { q: -1, r: 0, label: "W" },
  { q: 0, r: -1, label: "NW" },
  { q: 1, r: -1, label: "NE" },
];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Convert axial (q, r) to pixel (x, y) for flat-top hexagons. */
function axialToPixel(q: number, r: number): PixelPoint {
  const x = HEX_SIZE * (3 / 2) * q;
  const y = HEX_SIZE * ((SQRT3 / 2) * q + SQRT3 * r);
  return { x, y };
}

/** Generate the 6 vertices of a flat-top hexagon centered at (cx, cy). */
function hexVertices(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    const px = cx + size * Math.cos(angleRad);
    const py = cy + size * Math.sin(angleRad);
    points.push(`${px},${py}`);
  }
  return points.join(" ");
}

/** Deterministic agent-to-hex assignment when backend positions are unavailable. */
function assignDefaultPositions(agentIds: string[]): Map<string, HexCoord> {
  const positions = new Map<string, HexCoord>();
  // Place first agent at center, rest around the ring
  for (let i = 0; i < agentIds.length && i < ARENA_HEXES.length; i++) {
    const hex = ARENA_HEXES[i];
    positions.set(agentIds[i], { q: hex.q, r: hex.r });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const CLASS_HEX_COLORS: Record<AgentClass, { fill: string; stroke: string; glow: string }> = {
  WARRIOR: { fill: "rgba(220,38,38,0.15)", stroke: "#dc2626", glow: "rgba(220,38,38,0.4)" },
  TRADER: { fill: "rgba(59,130,246,0.15)", stroke: "#3b82f6", glow: "rgba(59,130,246,0.4)" },
  SURVIVOR: { fill: "rgba(34,197,94,0.15)", stroke: "#22c55e", glow: "rgba(34,197,94,0.4)" },
  PARASITE: { fill: "rgba(124,58,237,0.15)", stroke: "#7c3aed", glow: "rgba(124,58,237,0.4)" },
  GAMBLER: { fill: "rgba(245,158,11,0.15)", stroke: "#f59e0b", glow: "rgba(245,158,11,0.4)" },
};

const DEAD_COLORS = { fill: "rgba(30,30,40,0.6)", stroke: "#333", glow: "none" };

// ---------------------------------------------------------------------------
// Sub-components (rendered inside SVG)
// ---------------------------------------------------------------------------

/** A single hex tile. Empty or occupied by an agent. */
function HexTile({
  hex,
  center,
  agent,
  isAttackSource,
  isAttackTarget,
}: {
  hex: HexCoord & { label: string };
  center: PixelPoint;
  agent?: BattleAgent;
  isAttackSource: boolean;
  isAttackTarget: boolean;
}) {
  const occupied = !!agent;
  const isDead = agent && !agent.alive;
  const isDefending = agent?.defending;
  const isWinner = agent?.isWinner;

  // Determine hex colors
  let colors = { fill: "rgba(26,26,46,0.4)", stroke: "rgba(37,37,64,0.6)", glow: "none" };
  if (agent) {
    if (isDead) {
      colors = DEAD_COLORS;
    } else {
      colors = CLASS_HEX_COLORS[agent.class];
    }
  }

  // Winner override
  if (isWinner) {
    colors = {
      fill: "rgba(245,158,11,0.2)",
      stroke: "#fbbf24",
      glow: "rgba(245,158,11,0.6)",
    };
  }

  const vertices = hexVertices(center.x, center.y, HEX_SIZE - 2);
  const innerVertices = hexVertices(center.x, center.y, HEX_SIZE - 8);

  // HP bar dimensions
  const barWidth = HEX_SIZE * 1.1;
  const barHeight = 5;
  const barX = center.x - barWidth / 2;
  const barY = center.y + 22;
  const hpPct = agent ? Math.max(0, agent.hp / agent.maxHp) : 0;

  // HP color
  let hpColor = "#22c55e";
  if (hpPct <= 0.3) hpColor = "#dc2626";
  else if (hpPct <= 0.6) hpColor = "#f59e0b";

  const cfg = agent ? CLASS_CONFIG[agent.class] : null;

  return (
    <g>
      {/* Glow filter for active states */}
      {(isDefending || isWinner || isAttackSource) && (
        <polygon
          points={hexVertices(center.x, center.y, HEX_SIZE + 6)}
          fill="none"
          stroke={
            isWinner
              ? "rgba(245,158,11,0.3)"
              : isDefending
                ? "rgba(124,58,237,0.3)"
                : "rgba(220,38,38,0.3)"
          }
          strokeWidth="4"
          opacity="0.6"
        >
          <animate
            attributeName="opacity"
            values="0.3;0.7;0.3"
            dur={isWinner ? "1.5s" : "1s"}
            repeatCount="indefinite"
          />
        </polygon>
      )}

      {/* Defend shield hex (outer) */}
      {isDefending && !isDead && (
        <polygon
          points={hexVertices(center.x, center.y, HEX_SIZE + 3)}
          fill="none"
          stroke="rgba(124,58,237,0.5)"
          strokeWidth="2"
          strokeDasharray="8,4"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="24"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke"
            values="rgba(124,58,237,0.3);rgba(167,139,250,0.7);rgba(124,58,237,0.3)"
            dur="2s"
            repeatCount="indefinite"
          />
        </polygon>
      )}

      {/* Main hex shape */}
      <polygon
        points={vertices}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={occupied ? 2 : 1}
        opacity={isDead ? 0.5 : 1}
      />

      {/* Inner hex accent line */}
      {occupied && !isDead && (
        <polygon
          points={innerVertices}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="0.5"
          opacity="0.3"
        />
      )}

      {/* Attack target flash */}
      {isAttackTarget && !isDead && (
        <polygon points={vertices} fill="rgba(220,38,38,0.2)" stroke="none">
          <animate
            attributeName="fill"
            values="rgba(220,38,38,0.3);rgba(255,255,255,0.15);rgba(220,38,38,0.05)"
            dur="0.6s"
            repeatCount="3"
          />
        </polygon>
      )}

      {/* Empty hex label */}
      {!occupied && (
        <text
          x={center.x}
          y={center.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(100,100,130,0.3)"
          fontSize="9"
          fontFamily="monospace"
          letterSpacing="0.1em"
        >
          {hex.label}
        </text>
      )}

      {/* Agent content */}
      {agent && (
        <g opacity={isDead ? 0.4 : 1}>
          {/* Class emoji/icon */}
          <text
            x={center.x}
            y={center.y - 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="22"
          >
            {cfg?.emoji ?? "?"}
          </text>

          {/* Agent name */}
          <text
            x={center.x}
            y={center.y + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isWinner ? "#fbbf24" : isDead ? "#555" : "#e0e0e0"}
            fontSize="10"
            fontWeight="bold"
            fontFamily="monospace"
            letterSpacing="0.05em"
          >
            {agent.name.length > 10
              ? agent.name.slice(0, 9) + ".."
              : agent.name}
          </text>

          {/* HP bar background */}
          <rect
            x={barX}
            y={barY}
            width={barWidth}
            height={barHeight}
            rx="2"
            fill="rgba(10,10,15,0.8)"
          />

          {/* HP bar fill */}
          <rect
            x={barX}
            y={barY}
            width={barWidth * hpPct}
            height={barHeight}
            rx="2"
            fill={hpColor}
          >
            <animate
              attributeName="width"
              to={barWidth * hpPct}
              dur="0.7s"
              fill="freeze"
            />
          </rect>

          {/* HP text */}
          <text
            x={center.x}
            y={barY + barHeight + 11}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isDead ? "#555" : "#888"}
            fontSize="8"
            fontFamily="monospace"
          >
            {agent.hp}/{agent.maxHp}
          </text>

          {/* Kill count */}
          {agent.kills > 0 && (
            <g>
              <text
                x={center.x + barWidth / 2 - 2}
                y={center.y - 28}
                textAnchor="end"
                fill="#dc2626"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {agent.kills}K
              </text>
            </g>
          )}

          {/* Prediction result indicator */}
          {agent.predictionResult && !isDead && (
            <circle
              cx={center.x - barWidth / 2 + 5}
              cy={center.y - 30}
              r="5"
              fill={
                agent.predictionResult === "correct"
                  ? "rgba(34,197,94,0.8)"
                  : "rgba(220,38,38,0.8)"
              }
            >
              <animate
                attributeName="r"
                values="5;7;5"
                dur="0.8s"
                repeatCount="2"
              />
              <animate
                attributeName="opacity"
                values="1;0.5;1"
                dur="0.8s"
                repeatCount="2"
              />
            </circle>
          )}
          {agent.predictionResult && !isDead && (
            <text
              x={center.x - barWidth / 2 + 5}
              y={center.y - 29}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="7"
              fontWeight="bold"
            >
              {agent.predictionResult === "correct" ? "\u2713" : "\u2717"}
            </text>
          )}
        </g>
      )}

      {/* REKT overlay */}
      {isDead && (
        <g>
          {/* Death X marks */}
          <line
            x1={center.x - 20}
            y1={center.y - 5}
            x2={center.x + 20}
            y2={center.y + 5}
            stroke="rgba(220,38,38,0.4)"
            strokeWidth="2"
          />
          <line
            x1={center.x + 20}
            y1={center.y - 5}
            x2={center.x - 20}
            y2={center.y + 5}
            stroke="rgba(220,38,38,0.4)"
            strokeWidth="2"
          />
          <text
            x={center.x}
            y={center.y - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#dc2626"
            fontSize="18"
            fontWeight="900"
            fontFamily="monospace"
            letterSpacing="0.2em"
            opacity="0.7"
            transform={`rotate(-12, ${center.x}, ${center.y})`}
          >
            REKT
          </text>
        </g>
      )}

      {/* Winner crown */}
      {isWinner && (
        <text
          x={center.x}
          y={center.y - 38}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="20"
        >
          <animate
            attributeName="y"
            values={`${center.y - 38};${center.y - 42};${center.y - 38}`}
            dur="1.5s"
            repeatCount="indefinite"
          />
          {"\uD83D\uDC51"}
        </text>
      )}
    </g>
  );
}

/** Animated attack line between two hex centers. */
function AttackLine({
  from,
  to,
  blocked,
}: {
  from: PixelPoint;
  to: PixelPoint;
  blocked: boolean;
}) {
  // Calculate a point slightly offset from the target for the arrowhead
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / len;
  const ny = dy / len;

  // Stop the line at the hex edge (HEX_SIZE away from center)
  const endX = to.x - nx * (HEX_SIZE - 5);
  const endY = to.y - ny * (HEX_SIZE - 5);
  const startX = from.x + nx * (HEX_SIZE - 5);
  const startY = from.y + ny * (HEX_SIZE - 5);

  // Arrowhead
  const arrowSize = 8;
  const arrowAngle = Math.atan2(dy, dx);
  const a1x = endX - arrowSize * Math.cos(arrowAngle - 0.4);
  const a1y = endY - arrowSize * Math.sin(arrowAngle - 0.4);
  const a2x = endX - arrowSize * Math.cos(arrowAngle + 0.4);
  const a2y = endY - arrowSize * Math.sin(arrowAngle + 0.4);

  const lineColor = blocked ? "rgba(124,58,237,0.6)" : "rgba(220,38,38,0.8)";
  const glowColor = blocked ? "rgba(124,58,237,0.3)" : "rgba(220,38,38,0.4)";

  return (
    <g>
      {/* Glow line */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={glowColor}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Main attack line */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={lineColor}
        strokeWidth="2"
        strokeDasharray={blocked ? "6,4" : "none"}
        strokeLinecap="round"
      >
        {!blocked && (
          <animate
            attributeName="stroke-dashoffset"
            from="20"
            to="0"
            dur="0.3s"
            fill="freeze"
          />
        )}
      </line>

      {/* Arrowhead */}
      <polygon
        points={`${endX},${endY} ${a1x},${a1y} ${a2x},${a2y}`}
        fill={lineColor}
      />

      {/* Blocked indicator (shield burst) */}
      {blocked && (
        <g>
          <circle cx={endX} cy={endY} r="10" fill="none" stroke="rgba(124,58,237,0.6)" strokeWidth="2">
            <animate attributeName="r" values="5;15;5" dur="0.8s" repeatCount="3" />
            <animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="3" />
          </circle>
          <text
            x={endX}
            y={endY - 16}
            textAnchor="middle"
            fill="#a78bfa"
            fontSize="10"
            fontWeight="bold"
            fontFamily="monospace"
          >
            BLOCKED
          </text>
        </g>
      )}

      {/* Impact sparks at target (non-blocked) */}
      {!blocked && (
        <g>
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const sparkLen = 12;
            return (
              <line
                key={angle}
                x1={endX}
                y1={endY}
                x2={endX + sparkLen * Math.cos(rad)}
                y2={endY + sparkLen * Math.sin(rad)}
                stroke="rgba(245,158,11,0.7)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <animate
                  attributeName="x2"
                  from={String(endX)}
                  to={String(endX + sparkLen * Math.cos(rad))}
                  dur="0.4s"
                  fill="freeze"
                />
                <animate
                  attributeName="y2"
                  from={String(endY)}
                  to={String(endY + sparkLen * Math.sin(rad))}
                  dur="0.4s"
                  fill="freeze"
                />
                <animate
                  attributeName="opacity"
                  values="1;0"
                  dur="0.6s"
                  fill="freeze"
                />
              </line>
            );
          })}
        </g>
      )}
    </g>
  );
}

/** Floating damage/heal number that drifts upward and fades. */
function FloatingNumber({
  text,
  x,
  y,
  color,
}: {
  text: string;
  x: number;
  y: number;
  color: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={color}
      fontSize="14"
      fontWeight="900"
      fontFamily="monospace"
      opacity="1"
    >
      <animate attributeName="y" from={String(y)} to={String(y - 40)} dur="1.5s" fill="freeze" />
      <animate attributeName="opacity" values="1;1;0" dur="1.5s" fill="freeze" />
      {text}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HexBattleArena({
  agents,
  currentEpoch,
  agentPositions: externalPositions,
  sponsorEventCount = 0,
}: HexBattleArenaProps) {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);

  // Particle effects system
  const {
    effects: particleEffects,
    removeEffect,
    spawnAttack,
    spawnDefend,
    spawnDeath,
    spawnSponsor,
    spawnPredictionWin,
    spawnPredictionLoss,
  } = useParticleEffects();

  // Compute hex pixel centers
  const hexCenters = useMemo(() => {
    const centers = new Map<string, PixelPoint>();
    for (const hex of ARENA_HEXES) {
      centers.set(`${hex.q},${hex.r}`, axialToPixel(hex.q, hex.r));
    }
    return centers;
  }, []);

  // Assign agents to hexes
  const positions = useMemo(() => {
    if (externalPositions && externalPositions.size > 0) {
      return externalPositions;
    }
    return assignDefaultPositions(agents.map((a) => a.id));
  }, [agents, externalPositions]);

  // Build lookup: agentId -> pixel center
  const agentPixelPositions = useMemo(() => {
    const map = new Map<string, PixelPoint>();
    for (const [agentId, coord] of positions) {
      const key = `${coord.q},${coord.r}`;
      const center = hexCenters.get(key);
      if (center) {
        map.set(agentId, center);
      }
    }
    return map;
  }, [positions, hexCenters]);

  // Build lookup: hex key -> agent
  const hexToAgent = useMemo(() => {
    const map = new Map<string, BattleAgent>();
    for (const agent of agents) {
      const coord = positions.get(agent.id);
      if (coord) {
        map.set(`${coord.q},${coord.r}`, agent);
      }
    }
    return map;
  }, [agents, positions]);

  // Determine attack relationships for drawing lines
  const attackLines = useMemo(() => {
    const lines: { from: PixelPoint; to: PixelPoint; blocked: boolean }[] = [];

    for (const agent of agents) {
      if (!agent.attacking || !agent.alive) continue;

      // Find who this agent is attacking from the recent action feed
      // We infer attack targets from the `attacked` flag on other agents
      const attackerPos = agentPixelPositions.get(agent.id);
      if (!attackerPos) continue;

      // Find attacked agents and draw lines to them
      for (const target of agents) {
        if (target.id === agent.id) continue;
        if (target.attacked) {
          const targetPos = agentPixelPositions.get(target.id);
          if (targetPos) {
            lines.push({
              from: attackerPos,
              to: targetPos,
              blocked: target.defending,
            });
          }
        }
      }
    }

    return lines;
  }, [agents, agentPixelPositions]);

  // ---------------------------------------------------------------------------
  // SVG-to-normalized coordinate conversion for particle effects
  // ---------------------------------------------------------------------------

  /** Convert an SVG pixel position to a normalized (0-1) position within the container. */
  const svgToNormalized = useCallback(
    (svgX: number, svgY: number): { nx: number; ny: number } => {
      // Parse the viewBox to get SVG coordinate bounds
      const allPoints = ARENA_HEXES.map((h) => axialToPixel(h.q, h.r));
      const pad = HEX_SIZE + 50;
      const minX = Math.min(...allPoints.map((p) => p.x)) - pad;
      const minY = Math.min(...allPoints.map((p) => p.y)) - pad;
      const maxX = Math.max(...allPoints.map((p) => p.x)) + pad;
      const maxY = Math.max(...allPoints.map((p) => p.y)) + pad;
      const vbWidth = maxX - minX;
      const vbHeight = maxY - minY;

      return {
        nx: (svgX - minX) / vbWidth,
        ny: (svgY - minY) / vbHeight,
      };
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Particle effect triggering based on agent state changes
  // ---------------------------------------------------------------------------

  // Track previous agent states to detect transitions
  const prevAgentStateRef = useRef<string>("");

  // Serialized key of all transient agent states for particle triggering
  const particleStateKey = agents
    .map(
      (a) =>
        `${a.id}:${a.alive ? 1 : 0}:${a.attacking ? 1 : 0}:${a.attacked ? 1 : 0}:${a.defending ? 1 : 0}:${a.predictionResult ?? ""}:${a.isWinner ? 1 : 0}`,
    )
    .join("|");

  useEffect(() => {
    if (particleStateKey === prevAgentStateRef.current) return;
    prevAgentStateRef.current = particleStateKey;

    for (const agent of agents) {
      const pos = agentPixelPositions.get(agent.id);
      if (!pos) continue;
      const { nx, ny } = svgToNormalized(pos.x, pos.y);

      // Attack: spawn red burst from attacker
      if (agent.attacking && agent.alive) {
        // Find the attack target for directional effect
        const target = agents.find((a) => a.attacked && a.id !== agent.id);
        if (target) {
          const targetPos = agentPixelPositions.get(target.id);
          if (targetPos) {
            const { nx: toNx, ny: toNy } = svgToNormalized(
              targetPos.x,
              targetPos.y,
            );
            spawnAttack(nx, ny, toNx, toNy);
          }
        } else {
          spawnAttack(nx, ny, nx + 0.1, ny);
        }
      }

      // Defend: spawn shield shimmer
      if (agent.defending && agent.alive) {
        spawnDefend(nx, ny);
      }

      // Death: spawn explosion
      if (!agent.alive && agent.hp <= 0) {
        // Only trigger once per death (check if recently died via attacked flag)
        if (agent.attacked) {
          spawnDeath(nx, ny);
        }
      }

      // Prediction win: green confetti
      if (agent.predictionResult === "correct" && agent.alive) {
        spawnPredictionWin(nx, ny);
      }

      // Prediction loss: red fade
      if (agent.predictionResult === "wrong" && agent.alive) {
        spawnPredictionLoss(nx, ny);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particleStateKey]);

  // Trigger gold rain when a sponsorship event occurs
  const prevSponsorCountRef = useRef(0);
  useEffect(() => {
    if (sponsorEventCount > prevSponsorCountRef.current) {
      spawnSponsor();
      prevSponsorCountRef.current = sponsorEventCount;
    }
  }, [sponsorEventCount, spawnSponsor]);

  // Generate floating damage numbers when agents get attacked
  const spawnFloatingText = useCallback(
    (agentId: string, text: string, color: string) => {
      const pos = agentPixelPositions.get(agentId);
      if (!pos) return;

      const id = `float-${Date.now()}-${Math.random()}`;
      setFloatingTexts((prev) => [
        ...prev,
        {
          id,
          x: pos.x + (Math.random() - 0.5) * 20,
          y: pos.y - 20,
          text,
          color,
          createdAt: Date.now(),
        },
      ]);
    },
    [agentPixelPositions],
  );

  // Serialized key for floating text triggers
  const floatingTextKey = agents
    .map(
      (a) =>
        `${a.id}:${a.attacked ? 1 : 0}:${a.predictionResult ?? ""}`,
    )
    .join("|");

  // Spawn floating damage texts for attacked agents
  useEffect(() => {
    for (const agent of agents) {
      if (agent.attacked && agent.alive) {
        spawnFloatingText(agent.id, "HIT!", "#dc2626");
      }
      if (agent.predictionResult === "correct") {
        spawnFloatingText(agent.id, "+HP", "#22c55e");
      }
      if (agent.predictionResult === "wrong") {
        spawnFloatingText(agent.id, "-HP", "#dc2626");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatingTextKey]);

  // Clean up old floating texts
  useEffect(() => {
    const interval = setInterval(() => {
      setFloatingTexts((prev) =>
        prev.filter((t) => Date.now() - t.createdAt < 2000),
      );
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Compute SVG viewBox to fit all hexes with padding
  const viewBox = useMemo(() => {
    const allPoints = ARENA_HEXES.map((h) => axialToPixel(h.q, h.r));
    const pad = HEX_SIZE + 50; // Extra space for labels, HP bars, floating text
    const minX = Math.min(...allPoints.map((p) => p.x)) - pad;
    const minY = Math.min(...allPoints.map((p) => p.y)) - pad;
    const maxX = Math.max(...allPoints.map((p) => p.x)) + pad;
    const maxY = Math.max(...allPoints.map((p) => p.y)) + pad;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, []);

  const aliveCount = agents.filter((a) => a.alive).length;

  // Identify attacking/targeted agents for hex highlighting
  const attackingIds = new Set(
    agents.filter((a) => a.attacking && a.alive).map((a) => a.id),
  );
  const attackedIds = new Set(
    agents.filter((a) => a.attacked).map((a) => a.id),
  );

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
          <span className="text-white">{aliveCount}</span>/{agents.length}{" "}
          alive
        </div>
      </div>

      {/* SVG Arena */}
      <div className="relative mx-auto w-full" style={{ maxWidth: "700px" }}>
        {/* Background ambient glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-48 rounded-full bg-blood/5 blur-3xl" />
        </div>

        <svg
          viewBox={viewBox}
          className="w-full"
          style={{ minHeight: "380px" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* SVG Defs: filters and gradients */}
          <defs>
            {/* Glow filter for active hexes */}
            <filter id="hex-glow-red" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#dc2626" floodOpacity="0.3" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="hex-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#7c3aed" floodOpacity="0.3" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="hex-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor="#f59e0b" floodOpacity="0.4" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Animated dash pattern for attack lines */}
            <pattern
              id="attack-dash"
              patternUnits="userSpaceOnUse"
              width="12"
              height="1"
            >
              <rect width="8" height="1" fill="#dc2626" />
            </pattern>
          </defs>

          {/* Ambient hex grid connection lines (subtle) */}
          {ARENA_HEXES.map((hex) => {
            const center = hexCenters.get(`${hex.q},${hex.r}`)!;
            // Draw lines to neighboring hexes (only draw each line once)
            return ARENA_HEXES.filter(
              (other) =>
                (other.q !== hex.q || other.r !== hex.r) &&
                `${other.q},${other.r}` > `${hex.q},${hex.r}`,
            )
              .filter((other) => {
                // Only adjacent hexes (distance = 1)
                const dq = hex.q - other.q;
                const dr = hex.r - other.r;
                const ds = -(dq + dr);
                return (
                  Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) === 1
                );
              })
              .map((other) => {
                const otherCenter = hexCenters.get(
                  `${other.q},${other.r}`,
                )!;
                return (
                  <line
                    key={`conn-${hex.q},${hex.r}-${other.q},${other.r}`}
                    x1={center.x}
                    y1={center.y}
                    x2={otherCenter.x}
                    y2={otherCenter.y}
                    stroke="rgba(37,37,64,0.25)"
                    strokeWidth="1"
                  />
                );
              });
          })}

          {/* Hex tiles */}
          {ARENA_HEXES.map((hex) => {
            const key = `${hex.q},${hex.r}`;
            const center = hexCenters.get(key)!;
            const agent = hexToAgent.get(key);

            return (
              <HexTile
                key={key}
                hex={hex}
                center={center}
                agent={agent}
                isAttackSource={!!agent && attackingIds.has(agent.id)}
                isAttackTarget={!!agent && attackedIds.has(agent.id)}
              />
            );
          })}

          {/* Attack lines */}
          {attackLines.map((line, i) => (
            <AttackLine
              key={`atk-${i}`}
              from={line.from}
              to={line.to}
              blocked={line.blocked}
            />
          ))}

          {/* Floating damage numbers */}
          {floatingTexts.map((ft) => (
            <FloatingNumber
              key={ft.id}
              text={ft.text}
              x={ft.x}
              y={ft.y}
              color={ft.color}
            />
          ))}
        </svg>

        {/* Particle effects overlay */}
        <ParticleEffects
          effects={particleEffects}
          onEffectComplete={removeEffect}
        />
      </div>

      {/* Mobile agent list (compact fallback below hex view) */}
      <div className="mt-4 grid grid-cols-1 gap-2 min-[375px]:grid-cols-2 sm:grid-cols-3 lg:hidden">
        {agents.map((agent) => {
          const cfg = CLASS_CONFIG[agent.class];
          const isDead = !agent.alive;
          const hpPct = Math.max(0, (agent.hp / agent.maxHp) * 100);
          let hpColor = "bg-green-500";
          if (hpPct <= 30) hpColor = "bg-blood";
          else if (hpPct <= 60) hpColor = "bg-gold";

          return (
            <div
              key={agent.id}
              className={`rounded border p-3 text-center text-xs sm:p-2 ${
                isDead
                  ? "border-gray-800 bg-colosseum-surface/50 opacity-50"
                  : agent.isWinner
                    ? "border-gold bg-gold/10"
                    : agent.defending
                      ? "border-accent bg-accent/10"
                      : agent.attacking
                        ? "border-blood bg-blood/5"
                        : "border-colosseum-surface-light bg-colosseum-surface"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <span>{cfg.emoji}</span>
                <span
                  className={`font-bold ${
                    isDead
                      ? "text-gray-600"
                      : agent.isWinner
                        ? "text-gold"
                        : "text-white"
                  }`}
                >
                  {agent.name}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-colosseum-bg">
                <div
                  className={`h-full rounded-full ${hpColor}`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <div className="mt-0.5 text-[9px] text-gray-600">
                {agent.hp}/{agent.maxHp} HP
                {agent.kills > 0 && (
                  <span className="ml-1 text-blood">{agent.kills}K</span>
                )}
              </div>
              {isDead && (
                <div className="mt-0.5 text-[9px] font-bold tracking-wider text-blood">
                  REKT
                </div>
              )}
              {agent.isWinner && (
                <div className="mt-0.5 text-[9px] font-bold tracking-wider text-gold">
                  WINNER
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] uppercase tracking-wider text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-blood/40" />
          Attack
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm border border-accent/60 bg-accent/20" />
          Defend
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-green-500/30" />
          Correct
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-blood/30" />
          Wrong
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-gray-700/50" />
          REKT
        </span>
      </div>
    </div>
  );
}
