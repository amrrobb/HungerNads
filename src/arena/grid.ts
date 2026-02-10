/**
 * HUNGERNADS - Hex Grid Positioning System
 *
 * 7-hex honeycomb arena using axial coordinates (q, r).
 * Center hex + 6 surrounding hexes form the arena.
 *
 * Layout (flat-top hexagons):
 *
 *        (0,-1)  (1,-1)
 *      NW         NE
 *   (-1,0)  (0,0)  (1,0)
 *     W    CENTER    E
 *      (-1,1)  (0,1)
 *        SW      SE
 *
 * Adjacency = distance of 1 in axial coordinates.
 * Agents occupy hexes; at most one agent per hex.
 * Movement is an optional epoch action -- move to an adjacent unoccupied hex.
 *
 * NOTE: We use raw axial coordinate math instead of honeycomb-grid.
 * For a 7-hex arena the math is trivially simple, zero dependencies,
 * and fully compatible with Cloudflare Workers. honeycomb-grid can be
 * installed in dashboard/ later for rendering the hex viewer (tk-0bt.5).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HexCoord {
  q: number;
  r: number;
}

export interface ArenaHex extends HexCoord {
  label: string;
}

export interface MoveResult {
  agentId: string;
  from: HexCoord;
  to: HexCoord;
  success: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The 7-hex arena. Center + 6 surrounding hexes.
 * Labels are compass directions for readability in logs and UI.
 */
export const ARENA_HEXES: readonly ArenaHex[] = [
  { q: 0, r: 0, label: 'CENTER' },
  { q: 1, r: 0, label: 'EAST' },
  { q: 0, r: 1, label: 'SE' },
  { q: -1, r: 1, label: 'SW' },
  { q: -1, r: 0, label: 'WEST' },
  { q: 0, r: -1, label: 'NW' },
  { q: 1, r: -1, label: 'NE' },
] as const;

/**
 * The 6 axial direction offsets for flat-top hexagons.
 * Adding any of these to a hex gives a neighbor.
 */
export const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },   // E
  { q: 0, r: 1 },   // SE
  { q: -1, r: 1 },  // SW
  { q: -1, r: 0 },  // W
  { q: 0, r: -1 },  // NW
  { q: 1, r: -1 },  // NE
] as const;

// Pre-compute a Set of valid hex keys for O(1) lookup
const VALID_HEX_KEYS = new Set(ARENA_HEXES.map(h => hexKey(h)));

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/** Unique string key for a hex coordinate. Used for Map/Set operations. */
export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

/** Parse a hex key back into coordinates. */
export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

/** Check if two hex coordinates are the same. */
export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

// ---------------------------------------------------------------------------
// Distance and adjacency
// ---------------------------------------------------------------------------

/**
 * Compute the distance between two hexes in axial coordinates.
 * Uses the cube coordinate formula: max(|dq|, |dr|, |ds|) where s = -q-r.
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -(dq + dr); // s = -q - r in cube coordinates
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

/** Check if two hexes are adjacent (distance === 1). */
export function isAdjacent(a: HexCoord, b: HexCoord): boolean {
  return hexDistance(a, b) === 1;
}

// ---------------------------------------------------------------------------
// Arena validation
// ---------------------------------------------------------------------------

/** Check if a hex coordinate is within the 7-hex arena. */
export function isValidHex(hex: HexCoord): boolean {
  return VALID_HEX_KEYS.has(hexKey(hex));
}

/** Get the label for a hex coordinate, or null if not in arena. */
export function getHexLabel(hex: HexCoord): string | null {
  const found = ARENA_HEXES.find(h => h.q === hex.q && h.r === hex.r);
  return found?.label ?? null;
}

// ---------------------------------------------------------------------------
// Neighbors
// ---------------------------------------------------------------------------

/**
 * Get all valid arena neighbors of a hex.
 * Only returns hexes that are within the 7-hex arena.
 */
export function getNeighbors(hex: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS
    .map(d => ({ q: hex.q + d.q, r: hex.r + d.r }))
    .filter(isValidHex);
}

/**
 * Get the neighbor hex in a specific direction (0-5).
 * Returns null if the resulting hex is outside the arena.
 */
export function getNeighborInDirection(hex: HexCoord, direction: number): HexCoord | null {
  const d = HEX_DIRECTIONS[direction % 6];
  const neighbor = { q: hex.q + d.q, r: hex.r + d.r };
  return isValidHex(neighbor) ? neighbor : null;
}

// ---------------------------------------------------------------------------
// Position management
// ---------------------------------------------------------------------------

/**
 * Assign initial positions to agents, distributing them across the arena.
 *
 * Strategy:
 * - Shuffle the 7 arena hexes
 * - Assign agents to hexes in order
 * - Supports 2-7 agents (7 hexes total)
 *
 * Returns a Map<agentId, HexCoord>.
 */
export function assignInitialPositions(agentIds: string[]): Map<string, HexCoord> {
  if (agentIds.length > ARENA_HEXES.length) {
    throw new Error(
      `Cannot place ${agentIds.length} agents in a ${ARENA_HEXES.length}-hex arena`,
    );
  }

  // Fisher-Yates shuffle of hex indices
  const indices = Array.from({ length: ARENA_HEXES.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const positions = new Map<string, HexCoord>();
  for (let i = 0; i < agentIds.length; i++) {
    const hex = ARENA_HEXES[indices[i]];
    positions.set(agentIds[i], { q: hex.q, r: hex.r });
  }

  return positions;
}

/**
 * Get which agent occupies a given hex, if any.
 */
export function getOccupant(
  hex: HexCoord,
  positions: Map<string, HexCoord>,
): string | null {
  for (const [agentId, pos] of positions) {
    if (hexEquals(pos, hex)) {
      return agentId;
    }
  }
  return null;
}

/**
 * Check if a hex is occupied by any agent.
 */
export function isHexOccupied(
  hex: HexCoord,
  positions: Map<string, HexCoord>,
): boolean {
  return getOccupant(hex, positions) !== null;
}

/**
 * Get all agents adjacent to a given agent.
 * Returns agent IDs of those on neighboring hexes.
 */
export function getAdjacentAgents(
  agentId: string,
  positions: Map<string, HexCoord>,
): string[] {
  const agentPos = positions.get(agentId);
  if (!agentPos) return [];

  const neighbors = getNeighbors(agentPos);
  const adjacent: string[] = [];

  for (const neighbor of neighbors) {
    const occupant = getOccupant(neighbor, positions);
    if (occupant && occupant !== agentId) {
      adjacent.push(occupant);
    }
  }

  return adjacent;
}

// ---------------------------------------------------------------------------
// Movement validation and execution
// ---------------------------------------------------------------------------

/**
 * Validate whether an agent can move to a target hex.
 *
 * Rules:
 * - Target must be a valid arena hex
 * - Target must be adjacent to agent's current position
 * - Target must be unoccupied
 * - Agent must have a current position
 */
export function validateMove(
  agentId: string,
  to: HexCoord,
  positions: Map<string, HexCoord>,
): { valid: boolean; reason?: string } {
  const from = positions.get(agentId);
  if (!from) {
    return { valid: false, reason: 'Agent has no position' };
  }

  if (!isValidHex(to)) {
    return { valid: false, reason: `Target hex (${to.q},${to.r}) is outside the arena` };
  }

  if (hexEquals(from, to)) {
    return { valid: false, reason: 'Already at target hex' };
  }

  if (!isAdjacent(from, to)) {
    return { valid: false, reason: `Target hex (${to.q},${to.r}) is not adjacent` };
  }

  const occupant = getOccupant(to, positions);
  if (occupant && occupant !== agentId) {
    return { valid: false, reason: `Target hex is occupied by agent ${occupant}` };
  }

  return { valid: true };
}

/**
 * Execute a validated move. Updates the positions map in place.
 * Returns the MoveResult for logging/broadcasting.
 *
 * IMPORTANT: Call validateMove first. This function trusts the caller
 * and does minimal re-validation for safety.
 */
export function executeMove(
  agentId: string,
  to: HexCoord,
  positions: Map<string, HexCoord>,
): MoveResult {
  const from = positions.get(agentId);
  if (!from) {
    return { agentId, from: { q: 0, r: 0 }, to, success: false, reason: 'No position' };
  }

  const validation = validateMove(agentId, to, positions);
  if (!validation.valid) {
    return { agentId, from, to, success: false, reason: validation.reason };
  }

  // Execute the move
  positions.set(agentId, { q: to.q, r: to.r });

  return { agentId, from, to, success: true };
}

// ---------------------------------------------------------------------------
// Spatial context for LLM prompts
// ---------------------------------------------------------------------------

/**
 * Build a spatial context string for an agent's LLM prompt.
 * Tells the agent where it is, who is adjacent, and what hexes are available.
 */
export function buildSpatialContext(
  agentId: string,
  positions: Map<string, HexCoord>,
  agentNames: Map<string, string>,
): string {
  const pos = positions.get(agentId);
  if (!pos) return 'POSITION: Unknown';

  const label = getHexLabel(pos) ?? `(${pos.q},${pos.r})`;
  const neighbors = getNeighbors(pos);

  const adjacentAgents: string[] = [];
  const emptyNeighbors: string[] = [];

  for (const n of neighbors) {
    const occupant = getOccupant(n, positions);
    if (occupant && occupant !== agentId) {
      const name = agentNames.get(occupant) ?? occupant;
      const nLabel = getHexLabel(n) ?? `(${n.q},${n.r})`;
      adjacentAgents.push(`${name} at ${nLabel}`);
    } else if (!occupant) {
      const nLabel = getHexLabel(n) ?? `(${n.q},${n.r})`;
      emptyNeighbors.push(nLabel);
    }
  }

  const lines: string[] = [
    `YOUR POSITION: ${label} (hex ${pos.q},${pos.r})`,
  ];

  if (adjacentAgents.length > 0) {
    lines.push(`ADJACENT AGENTS (can attack): ${adjacentAgents.join(', ')}`);
  } else {
    lines.push('ADJACENT AGENTS: None (must move closer to attack)');
  }

  if (emptyNeighbors.length > 0) {
    lines.push(`EMPTY ADJACENT HEXES (can move to): ${emptyNeighbors.join(', ')}`);
  } else {
    lines.push('EMPTY ADJACENT HEXES: None (surrounded)');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Enriched spatial context for LLM prompts (phase + storm + items + agents)
// ---------------------------------------------------------------------------

import {
  getDistance as hexGridDistance,
  getTileLevel,
  getTilesInRange,
  getSafeTiles,
  isStormTile,
} from './hex-grid';
import type { HexGridState, HexTile } from './hex-grid';
import type { BattlePhase } from './types/status';
import type { PhaseConfig, PhaseEntry } from './phases';
import { getCurrentPhase, getEpochsRemainingInPhase } from './phases';

/** Info about a nearby agent for the spatial context. */
interface NearbyAgentInfo {
  name: string;
  class: string;
  hp: number;
  maxHp: number;
  position: HexCoord;
  distance: number;
}

/** Info about a nearby item for the spatial context. */
interface NearbyItemInfo {
  type: string;
  position: HexCoord;
  distance: number;
}

/**
 * Build an enriched spatial context string for an agent's LLM prompt.
 *
 * Includes:
 * - Current position, tile level, distance to center
 * - Current phase, epochs remaining in phase, combat enabled
 * - Storm info: safe tile count, storm tile count, whether the agent is in storm
 * - Nearby items within 2 tiles (type and position)
 * - Nearby agents within 2 tiles (name, class, HP, position, distance)
 * - Empty adjacent hexes for movement
 *
 * Returns a formatted multi-line string for injection into the LLM system prompt.
 */
export function buildEnrichedSpatialContext(
  agentId: string,
  agentPosition: HexCoord | null,
  grid: HexGridState,
  allAgents: { id: string; name: string; class: string; hp: number; maxHp: number; position?: HexCoord | null }[],
  epochNumber: number,
  phaseConfig: PhaseConfig | null,
): string {
  if (!agentPosition) return 'POSITION: Unknown (not on grid)';

  const center: HexCoord = { q: 0, r: 0 };
  const distToCenter = hexGridDistance(agentPosition, center);
  const tileLevel = getTileLevel(agentPosition);

  // Phase info
  let phaseBlock = '';
  let currentPhaseName: BattlePhase | null = null;
  let stormBlock = '';

  if (phaseConfig) {
    const currentPhase = getCurrentPhase(epochNumber, phaseConfig);
    const epochsRemaining = getEpochsRemainingInPhase(epochNumber, phaseConfig);
    currentPhaseName = currentPhase.name;

    phaseBlock = [
      `CURRENT PHASE: ${currentPhase.name} (epoch ${epochNumber}, ${epochsRemaining} epoch(s) left in phase)`,
      `Combat: ${currentPhase.combatEnabled ? 'ENABLED' : 'DISABLED (no attacks this phase)'}`,
    ].join('\n');

    // Storm info
    if (currentPhase.name !== 'LOOT') {
      const safeTiles = getSafeTiles(currentPhase.name, grid);
      const totalTiles = grid.tiles.size;
      const stormTileCount = totalTiles - safeTiles.length;
      const agentInStorm = isStormTile(agentPosition, currentPhase.name);

      const stormLines: string[] = [
        `STORM: ${stormTileCount} tiles dangerous, ${safeTiles.length} tiles safe.`,
      ];
      if (agentInStorm) {
        stormLines.push('WARNING: YOU ARE IN THE STORM! Move to a safe tile or take damage!');
      } else {
        stormLines.push('You are on a safe tile.');
      }

      // Upcoming storm intensification
      if (epochsRemaining <= 1 && currentPhase.name !== 'FINAL_STAND') {
        const phaseOrder: BattlePhase[] = ['LOOT', 'HUNT', 'BLOOD', 'FINAL_STAND'];
        const nextIdx = phaseOrder.indexOf(currentPhase.name) + 1;
        if (nextIdx < phaseOrder.length) {
          const nextPhase = phaseOrder[nextIdx];
          const nextSafe = getSafeTiles(nextPhase, grid);
          stormLines.push(
            `STORM WARNING: Next phase (${nextPhase}) reduces safe tiles to ${nextSafe.length}! Move toward center!`,
          );
        }
      }

      stormBlock = stormLines.join('\n');
    } else {
      stormBlock = 'STORM: No storm during LOOT phase. All tiles are safe.';
    }
  }

  // Nearby agents within 2 tiles
  const nearbyAgents: NearbyAgentInfo[] = [];
  for (const other of allAgents) {
    if (other.id === agentId || !other.position) continue;
    const dist = hexGridDistance(agentPosition, other.position);
    if (dist <= 2) {
      nearbyAgents.push({
        name: other.name,
        class: other.class,
        hp: other.hp,
        maxHp: other.maxHp,
        position: other.position,
        distance: dist,
      });
    }
  }
  nearbyAgents.sort((a, b) => a.distance - b.distance);

  // Nearby items within 2 tiles
  const nearbyItems: NearbyItemInfo[] = [];
  const tilesInRange = getTilesInRange(agentPosition, 2, grid);
  for (const tile of tilesInRange) {
    if (tile.items && tile.items.length > 0) {
      for (const item of tile.items) {
        const dist = hexGridDistance(agentPosition, tile.coord);
        nearbyItems.push({
          type: item.type,
          position: tile.coord,
          distance: dist,
        });
      }
    }
  }
  nearbyItems.sort((a, b) => a.distance - b.distance);

  // Empty adjacent hexes
  const adjTiles = getTilesInRange(agentPosition, 1, grid).filter(
    t => !hexEquals(t.coord, agentPosition) && t.occupantId === null,
  );
  const emptyAdj = adjTiles.map(t => {
    const isSafe = currentPhaseName ? !isStormTile(t.coord, currentPhaseName) : true;
    return `(${t.coord.q},${t.coord.r}) Lv${t.level}${isSafe ? '' : ' [STORM]'}`;
  });

  // Build final output
  const lines: string[] = [
    `YOUR POSITION: (${agentPosition.q},${agentPosition.r}) tile level Lv${tileLevel}, distance to center: ${distToCenter}`,
  ];

  if (phaseBlock) lines.push(phaseBlock);
  if (stormBlock) lines.push(stormBlock);

  if (nearbyAgents.length > 0) {
    const agentStrings = nearbyAgents.map(a => {
      const adjTag = a.distance === 1 ? ' [ADJACENT - can attack]' : '';
      const hpPct = Math.round((a.hp / a.maxHp) * 100);
      return `  ${a.name} (${a.class}, ${a.hp} HP / ${hpPct}%) at (${a.position.q},${a.position.r}) dist=${a.distance}${adjTag}`;
    });
    lines.push(`NEARBY AGENTS (within 2 tiles):\n${agentStrings.join('\n')}`);
  } else {
    lines.push('NEARBY AGENTS: None within 2 tiles.');
  }

  if (nearbyItems.length > 0) {
    const itemStrings = nearbyItems.map(i =>
      `  ${i.type} at (${i.position.q},${i.position.r}) dist=${i.distance}`,
    );
    lines.push(`NEARBY ITEMS (within 2 tiles):\n${itemStrings.join('\n')}`);
  } else {
    lines.push('NEARBY ITEMS: None within 2 tiles.');
  }

  if (emptyAdj.length > 0) {
    lines.push(`EMPTY ADJACENT HEXES (can move to): ${emptyAdj.join(', ')}`);
  } else {
    lines.push('EMPTY ADJACENT HEXES: None (surrounded).');
  }

  return lines.join('\n');
}
