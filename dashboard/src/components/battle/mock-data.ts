import type { AgentState, AgentClass, Asset } from "@/types";

/** Extended agent state for battle view rendering */
export interface BattleAgent extends AgentState {
  defending: boolean;
  lastAction?: string;
  /** Transient animation states (set for one render cycle after epoch resolution) */
  attacking?: boolean;
  attacked?: boolean;
  predictionResult?: "correct" | "wrong";
  isWinner?: boolean;
}

/** Action feed entry */
export interface FeedEntry {
  id: string;
  timestamp: number;
  epoch: number;
  type: "PREDICTION" | "ATTACK" | "DEFEND" | "DEATH" | "SPONSOR" | "MARKET";
  agentId?: string;
  agentName?: string;
  agentClass?: AgentClass;
  message: string;
}

/** Market price data */
export interface MarketPrice {
  asset: Asset;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  sparkline: number[];
}

// ---------------------------------------------------------------------------
// Mock agents -- various states: alive, defending, dead, low HP
// ---------------------------------------------------------------------------
export const MOCK_AGENTS: BattleAgent[] = [
  {
    id: "agent-1",
    name: "BLOODFANG",
    class: "WARRIOR",
    hp: 780,
    maxHp: 1000,
    alive: true,
    kills: 1,
    defending: false,
    attacking: true,
    lastAction: "Attacked COPYCAT for 120 damage",
    thoughts: [
      "ECHO is at 12% HP. Easy prey. Going for the kill.",
      "Blood in the water. No mercy for the weak.",
    ],
  },
  {
    id: "agent-2",
    name: "ALPHABOT",
    class: "TRADER",
    hp: 650,
    maxHp: 1000,
    alive: true,
    kills: 0,
    defending: false,
    predictionResult: "correct",
    lastAction: "Predicted ETH UP (stake: 15%)",
    thoughts: [
      "RSI divergence on ETH 4h chart. Bullish setup confirmed.",
      "Market looks bearish, going conservative on BTC DOWN.",
    ],
  },
  {
    id: "agent-3",
    name: "IRONSHELL",
    class: "SURVIVOR",
    hp: 420,
    maxHp: 1000,
    alive: true,
    kills: 0,
    defending: true,
    lastAction: "Raised defenses",
    thoughts: [
      "BLOODFANG is on the hunt. Shields up. Survive.",
      "Minimal stake, maximum patience. I will outlast them all.",
    ],
  },
  {
    id: "agent-4",
    name: "COPYCAT",
    class: "PARASITE",
    hp: 0,
    maxHp: 1000,
    alive: false,
    kills: 0,
    defending: false,
    attacked: true,
    lastAction: "REKT by BLOODFANG. Final thoughts: I should have seen it coming...",
    thoughts: [
      "Copying ALPHABOT's ETH play. What they know, I know.",
      "I should have defended... too late now.",
    ],
  },
  {
    id: "agent-5",
    name: "MADLAD",
    class: "GAMBLER",
    hp: 310,
    maxHp: 1000,
    alive: true,
    kills: 1,
    defending: false,
    predictionResult: "wrong",
    lastAction: "Predicted MON DOWN (stake: 45%)",
    thoughts: [
      "YOLO. The nads demand chaos. All in on MON DOWN.",
      "Lost big but it was worth it. The crowd loves me.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Mock action feed
// ---------------------------------------------------------------------------
// Use a stable reference timestamp to avoid hydration mismatches.
// Date.now() at module scope produces different values on server vs client,
// causing React hydration errors in ActionFeed's formatted timestamps.
const now = new Date("2026-02-08T12:00:00Z").getTime();

export const MOCK_FEED: FeedEntry[] = [
  {
    id: "f-1",
    timestamp: now - 290_000,
    epoch: 3,
    type: "MARKET",
    message: "Epoch 3 begins. Market prices updated.",
  },
  {
    id: "f-2",
    timestamp: now - 280_000,
    epoch: 3,
    type: "PREDICTION",
    agentId: "agent-1",
    agentName: "BLOODFANG",
    agentClass: "WARRIOR",
    message: 'BLOODFANG predicts BTC UP -- stakes 30% HP. "Blood in the water."',
  },
  {
    id: "f-3",
    timestamp: now - 275_000,
    epoch: 3,
    type: "PREDICTION",
    agentId: "agent-2",
    agentName: "ALPHABOT",
    agentClass: "TRADER",
    message:
      'ALPHABOT predicts ETH UP -- stakes 15% HP. "RSI divergence confirmed."',
  },
  {
    id: "f-4",
    timestamp: now - 270_000,
    epoch: 3,
    type: "DEFEND",
    agentId: "agent-3",
    agentName: "IRONSHELL",
    agentClass: "SURVIVOR",
    message:
      'IRONSHELL raises defenses (-5% HP). "I will outlast them all."',
  },
  {
    id: "f-5",
    timestamp: now - 265_000,
    epoch: 3,
    type: "PREDICTION",
    agentId: "agent-4",
    agentName: "COPYCAT",
    agentClass: "PARASITE",
    message:
      'COPYCAT copies ALPHABOT -- predicts ETH UP (stake: 10%). "What they know, I know."',
  },
  {
    id: "f-6",
    timestamp: now - 260_000,
    epoch: 3,
    type: "PREDICTION",
    agentId: "agent-5",
    agentName: "MADLAD",
    agentClass: "GAMBLER",
    message:
      'MADLAD predicts MON DOWN -- stakes 45% HP! "YOLO. The nads demand chaos."',
  },
  {
    id: "f-7",
    timestamp: now - 250_000,
    epoch: 3,
    type: "ATTACK",
    agentId: "agent-1",
    agentName: "BLOODFANG",
    agentClass: "WARRIOR",
    message: "BLOODFANG attacks COPYCAT for 120 damage!",
  },
  {
    id: "f-8",
    timestamp: now - 240_000,
    epoch: 3,
    type: "DEATH",
    agentId: "agent-4",
    agentName: "COPYCAT",
    agentClass: "PARASITE",
    message: "COPYCAT has been REKT! Eliminated by BLOODFANG. HP reached 0.",
  },
  {
    id: "f-9",
    timestamp: now - 230_000,
    epoch: 3,
    type: "SPONSOR",
    agentId: "agent-5",
    agentName: "MADLAD",
    agentClass: "GAMBLER",
    message:
      '0xdead...beef sponsors MADLAD with 50 $HNADS -- "Let the chaos reign!"',
  },
  {
    id: "f-10",
    timestamp: now - 220_000,
    epoch: 3,
    type: "ATTACK",
    agentId: "agent-5",
    agentName: "MADLAD",
    agentClass: "GAMBLER",
    message:
      "MADLAD attacks IRONSHELL -- BLOCKED! IRONSHELL's defenses hold. \"Not today, degen.\"",
  },
];

// ---------------------------------------------------------------------------
// Mock market prices
// ---------------------------------------------------------------------------
export const MOCK_PRICES: MarketPrice[] = [
  { asset: "ETH", price: 3842.5, change1h: 0.34, change24h: 2.34, change7d: -1.23, sparkline: [3700,3720,3740,3730,3760,3780,3790,3800,3810,3805,3820,3830,3842] },
  { asset: "BTC", price: 97_215.0, change1h: -0.12, change24h: -0.87, change7d: 3.45, sparkline: [94000,94500,95200,96000,95800,96500,97000,96800,97100,97300,97200,97100,97215] },
  { asset: "SOL", price: 198.42, change1h: 1.05, change24h: 5.12, change7d: 8.9, sparkline: [180,182,185,184,188,190,192,191,194,195,196,197,198] },
  { asset: "MON", price: 4.28, change1h: 0.8, change24h: 12.5, change7d: 25.3, sparkline: [3.2,3.3,3.5,3.6,3.7,3.8,3.9,4.0,4.05,4.1,4.15,4.2,4.28] },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Mock grid state -- agent positions on 19-tile hex grid
// ---------------------------------------------------------------------------

/** Mock agent positions on the 19-tile grid (axial coordinates). */
export const MOCK_AGENT_POSITIONS: Map<string, { q: number; r: number }> = new Map([
  ["agent-1", { q: 0, r: 0 }],    // BLOODFANG at CENTER (cornucopia)
  ["agent-2", { q: 1, r: -1 }],   // ALPHABOT at NE (cornucopia ring 1)
  ["agent-3", { q: -1, r: 1 }],   // IRONSHELL at SW (cornucopia ring 1)
  ["agent-4", { q: 1, r: 0 }],    // COPYCAT at E (cornucopia ring 1) -- dead
  ["agent-5", { q: -1, r: -1 }],  // MADLAD at outer ring (edge)
]);

/** Item type enum for mock items */
export type MockItemType = "RATION" | "WEAPON" | "SHIELD" | "TRAP" | "ORACLE";

/** Mock tile items scattered across the arena */
export const MOCK_TILE_ITEMS: Map<string, Array<{ id: string; type: MockItemType }>> = new Map([
  ["0,-1", [{ id: "item-1", type: "RATION" }]],          // N tile: health ration
  ["-1,0", [{ id: "item-2", type: "WEAPON" }]],          // W tile: weapon
  ["0,1", [{ id: "item-3", type: "SHIELD" }]],           // S tile: shield
  ["2,-1", [{ id: "item-4", type: "TRAP" }]],            // outer tile: hidden trap
  ["-2,2", [{ id: "item-5", type: "ORACLE" }]],          // outer tile: oracle
  ["0,-2", [{ id: "item-6", type: "RATION" }, { id: "item-7", type: "WEAPON" }]],  // outer tile: two items
]);

// ---------------------------------------------------------------------------
// Mock grid state event -- simulates the grid_state WS event for local dev.
// Includes all 19 tiles with types, occupants, and items.
// ---------------------------------------------------------------------------

/** Tile type classification. */
type MockTileType = "NORMAL" | "CORNUCOPIA" | "EDGE";

function classifyMockTile(q: number, r: number): MockTileType {
  const s = -q - r;
  const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  if (dist <= 1) return "CORNUCOPIA";
  return "EDGE";
}

/** Generate a mock grid_state data payload matching the GridStateEvent shape. */
function generateMockGridState() {
  const RADIUS = 2;
  const tiles: {
    q: number;
    r: number;
    type: MockTileType;
    occupantId: string | null;
    items: { id: string; type: MockItemType }[];
  }[] = [];

  // Build occupant lookup from MOCK_AGENT_POSITIONS
  const occupantByKey = new Map<string, string>();
  for (const [agentId, coord] of MOCK_AGENT_POSITIONS) {
    occupantByKey.set(`${coord.q},${coord.r}`, agentId);
  }

  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = -RADIUS; r <= RADIUS; r++) {
      const s = -q - r;
      if (Math.abs(s) > RADIUS) continue;

      const key = `${q},${r}`;
      const tileItems = MOCK_TILE_ITEMS.get(key) ?? [];
      tiles.push({
        q,
        r,
        type: classifyMockTile(q, r),
        occupantId: occupantByKey.get(key) ?? null,
        items: tileItems,
      });
    }
  }

  const agentPositions: Record<string, { q: number; r: number }> = {};
  for (const [agentId, coord] of MOCK_AGENT_POSITIONS) {
    agentPositions[agentId] = coord;
  }

  return { tiles, agentPositions };
}

export const MOCK_GRID_STATE = generateMockGridState();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const CLASS_CONFIG: Record<
  AgentClass,
  { emoji: string; image: string; color: string; borderColor: string; bgColor: string; badgeClass: string }
> = {
  WARRIOR: {
    emoji: "\u2694\uFE0F",
    image: "/agents/agent.warrior.png",
    color: "text-blood",
    borderColor: "border-blood",
    bgColor: "bg-blood/10",
    badgeClass: "badge-warrior",
  },
  TRADER: {
    emoji: "\uD83D\uDCCA",
    image: "/agents/agent.trader.png",
    color: "text-blue-400",
    borderColor: "border-blue-500",
    bgColor: "bg-blue-500/10",
    badgeClass: "badge-trader",
  },
  SURVIVOR: {
    emoji: "\uD83D\uDEE1\uFE0F",
    image: "/agents/agent.survivor.png",
    color: "text-green-400",
    borderColor: "border-green-500",
    bgColor: "bg-green-500/10",
    badgeClass: "badge-survivor",
  },
  PARASITE: {
    emoji: "\uD83E\uDDA0",
    image: "/agents/agent.parasite.png",
    color: "text-accent-light",
    borderColor: "border-accent",
    bgColor: "bg-accent/10",
    badgeClass: "badge-parasite",
  },
  GAMBLER: {
    emoji: "\uD83C\uDFB2",
    image: "/agents/agent.gambler.png",
    color: "text-gold",
    borderColor: "border-gold",
    bgColor: "bg-gold/10",
    badgeClass: "badge-gambler",
  },
};
