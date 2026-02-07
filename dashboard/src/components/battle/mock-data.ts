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
  change24h: number;
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
    lastAction: "Attacked ECHO for 120 damage",
  },
  {
    id: "agent-2",
    name: "ORACLE",
    class: "TRADER",
    hp: 650,
    maxHp: 1000,
    alive: true,
    kills: 0,
    defending: false,
    predictionResult: "correct",
    lastAction: "Predicted ETH UP (stake: 15%)",
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
  },
  {
    id: "agent-4",
    name: "ECHO",
    class: "PARASITE",
    hp: 0,
    maxHp: 1000,
    alive: false,
    kills: 0,
    defending: false,
    attacked: true,
    lastAction: "REKT by BLOODFANG",
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
  },
];

// ---------------------------------------------------------------------------
// Mock action feed
// ---------------------------------------------------------------------------
const now = Date.now();

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
    agentName: "ORACLE",
    agentClass: "TRADER",
    message:
      'ORACLE predicts ETH UP -- stakes 15% HP. "RSI divergence confirmed."',
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
    agentName: "ECHO",
    agentClass: "PARASITE",
    message:
      'ECHO copies ORACLE -- predicts ETH UP (stake: 10%). "What they know, I know."',
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
    message: "BLOODFANG attacks ECHO for 120 damage!",
  },
  {
    id: "f-8",
    timestamp: now - 240_000,
    epoch: 3,
    type: "DEATH",
    agentId: "agent-4",
    agentName: "ECHO",
    agentClass: "PARASITE",
    message: "ECHO has been REKT! Eliminated by BLOODFANG. HP reached 0.",
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
      "MADLAD attacks IRONSHELL -- BLOCKED! IRONSHELL's defenses hold.",
  },
];

// ---------------------------------------------------------------------------
// Mock market prices
// ---------------------------------------------------------------------------
export const MOCK_PRICES: MarketPrice[] = [
  { asset: "ETH", price: 3842.5, change24h: 2.34 },
  { asset: "BTC", price: 97_215.0, change24h: -0.87 },
  { asset: "SOL", price: 198.42, change24h: 5.12 },
  { asset: "MON", price: 4.28, change24h: 12.5 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const CLASS_CONFIG: Record<
  AgentClass,
  { emoji: string; color: string; borderColor: string; bgColor: string; badgeClass: string }
> = {
  WARRIOR: {
    emoji: "\u2694\uFE0F",
    color: "text-blood",
    borderColor: "border-blood",
    bgColor: "bg-blood/10",
    badgeClass: "badge-warrior",
  },
  TRADER: {
    emoji: "\uD83D\uDCCA",
    color: "text-blue-400",
    borderColor: "border-blue-500",
    bgColor: "bg-blue-500/10",
    badgeClass: "badge-trader",
  },
  SURVIVOR: {
    emoji: "\uD83D\uDEE1\uFE0F",
    color: "text-green-400",
    borderColor: "border-green-500",
    bgColor: "bg-green-500/10",
    badgeClass: "badge-survivor",
  },
  PARASITE: {
    emoji: "\uD83E\uDDA0",
    color: "text-accent-light",
    borderColor: "border-accent",
    bgColor: "bg-accent/10",
    badgeClass: "badge-parasite",
  },
  GAMBLER: {
    emoji: "\uD83C\uDFB2",
    color: "text-gold",
    borderColor: "border-gold",
    bgColor: "bg-gold/10",
    badgeClass: "badge-gambler",
  },
};
