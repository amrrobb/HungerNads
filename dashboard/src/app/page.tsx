import type { AgentState } from "@/types";
import HeroSection from "@/components/home/HeroSection";
import BattleCard from "@/components/home/BattleCard";
import RecentResults from "@/components/home/RecentResults";
import type { RecentResult } from "@/components/home/RecentResults";
import AgentRank from "@/components/home/AgentRank";
import type { RankedAgent } from "@/components/home/AgentRank";
import BettorRank from "@/components/home/BettorRank";
import type { RankedBettor } from "@/components/home/BettorRank";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const LIVE_BATTLES: {
  battleId: string;
  agents: AgentState[];
  currentEpoch: number;
  totalPool: number;
}[] = [
  {
    battleId: "042",
    currentEpoch: 7,
    totalPool: 18_400,
    agents: [
      { id: "a1", name: "BLOODFANG", class: "WARRIOR", hp: 680, maxHp: 1000, alive: true, kills: 1 },
      { id: "a2", name: "CHARTIST", class: "TRADER", hp: 820, maxHp: 1000, alive: true, kills: 0 },
      { id: "a3", name: "IRONSHELL", class: "SURVIVOR", hp: 510, maxHp: 1000, alive: true, kills: 0 },
      { id: "a4", name: "LEECH", class: "PARASITE", hp: 0, maxHp: 1000, alive: false, kills: 0 },
      { id: "a5", name: "COINFLIP", class: "GAMBLER", hp: 340, maxHp: 1000, alive: true, kills: 1 },
    ],
  },
  {
    battleId: "043",
    currentEpoch: 3,
    totalPool: 9_200,
    agents: [
      { id: "b1", name: "REAPER", class: "WARRIOR", hp: 900, maxHp: 1000, alive: true, kills: 0 },
      { id: "b2", name: "SIGNALS", class: "TRADER", hp: 760, maxHp: 1000, alive: true, kills: 0 },
      { id: "b3", name: "BUNKER", class: "SURVIVOR", hp: 940, maxHp: 1000, alive: true, kills: 0 },
      { id: "b4", name: "MIMIC", class: "PARASITE", hp: 850, maxHp: 1000, alive: true, kills: 0 },
      { id: "b5", name: "DICE", class: "GAMBLER", hp: 720, maxHp: 1000, alive: true, kills: 0 },
    ],
  },
  {
    battleId: "044",
    currentEpoch: 12,
    totalPool: 31_600,
    agents: [
      { id: "c1", name: "WARBLADE", class: "WARRIOR", hp: 0, maxHp: 1000, alive: false, kills: 2 },
      { id: "c2", name: "QUANT", class: "TRADER", hp: 390, maxHp: 1000, alive: true, kills: 1 },
      { id: "c3", name: "FORTRESS", class: "SURVIVOR", hp: 220, maxHp: 1000, alive: true, kills: 0 },
      { id: "c4", name: "SHADOW", class: "PARASITE", hp: 0, maxHp: 1000, alive: false, kills: 0 },
      { id: "c5", name: "WILDCARD", class: "GAMBLER", hp: 0, maxHp: 1000, alive: false, kills: 1 },
    ],
  },
];

const RECENT_RESULTS: RecentResult[] = [
  { battleId: "041", winnerName: "BLOODFANG", winnerClass: "WARRIOR", killCount: 3, durationEpochs: 14, endedAt: Date.now() - 25 * 60_000 },
  { battleId: "040", winnerName: "CHARTIST", winnerClass: "TRADER", killCount: 1, durationEpochs: 18, endedAt: Date.now() - 2 * 3600_000 },
  { battleId: "039", winnerName: "IRONSHELL", winnerClass: "SURVIVOR", killCount: 0, durationEpochs: 22, endedAt: Date.now() - 5 * 3600_000 },
  { battleId: "038", winnerName: "COINFLIP", winnerClass: "GAMBLER", killCount: 2, durationEpochs: 9, endedAt: Date.now() - 8 * 3600_000 },
  { battleId: "037", winnerName: "LEECH", winnerClass: "PARASITE", killCount: 1, durationEpochs: 16, endedAt: Date.now() - 18 * 3600_000 },
];

const TOP_AGENTS: RankedAgent[] = [
  { rank: 1, name: "BLOODFANG", class: "WARRIOR", winRate: 68, totalBattles: 25 },
  { rank: 2, name: "CHARTIST", class: "TRADER", winRate: 56, totalBattles: 32 },
  { rank: 3, name: "IRONSHELL", class: "SURVIVOR", winRate: 52, totalBattles: 29 },
  { rank: 4, name: "COINFLIP", class: "GAMBLER", winRate: 44, totalBattles: 18 },
  { rank: 5, name: "LEECH", class: "PARASITE", winRate: 38, totalBattles: 21 },
];

const TOP_BETTORS: RankedBettor[] = [
  { rank: 1, address: "0x7a3B1f9c4E2dF08a6b5C3D9e1A7f4B2c8E6d0a1F", profit: 42_300, totalBets: 87 },
  { rank: 2, address: "0x1F8e3A6b9C4d2E7f0a5B8c1D3e6F9a2B4c7D0e1A", profit: 28_150, totalBets: 63 },
  { rank: 3, address: "0x9C2d4E6f8A0b1C3d5E7f9A1b3C5d7E9f0A2b4C6d", profit: 15_800, totalBets: 41 },
  { rank: 4, address: "0x4B6d8E0a2C4e6F8a0B2c4D6e8F0a2B4c6D8e0A2b", profit: 8_900, totalBets: 55 },
  { rank: 5, address: "0x3A5c7E9f1B3d5F7a9C1d3E5f7A9b1C3d5E7f9A1b", profit: -2_400, totalBets: 29 },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <div>
      <HeroSection activeBattleCount={LIVE_BATTLES.length} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Left column: live battles + recent results */}
        <div className="space-y-6 lg:col-span-3">
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-blood" />
              Live Battles
            </h2>
            <div className="space-y-4">
              {LIVE_BATTLES.map((battle) => (
                <BattleCard
                  key={battle.battleId}
                  battleId={battle.battleId}
                  agents={battle.agents}
                  currentEpoch={battle.currentEpoch}
                  totalPool={battle.totalPool}
                />
              ))}
            </div>
          </div>

          <RecentResults results={RECENT_RESULTS} />
        </div>

        {/* Right column: leaderboards */}
        <div className="space-y-6 lg:col-span-2">
          <AgentRank agents={TOP_AGENTS} />
          <BettorRank bettors={TOP_BETTORS} />
        </div>
      </div>

      <div className="mt-12 text-center text-xs text-gray-700">
        <p>$HNADS on nad.fun // Monad Hackathon - Moltiverse</p>
      </div>
    </div>
  );
}
