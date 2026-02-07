"use client";

import type { AgentClass } from "@/types";
import { CLASS_CONFIG } from "@/components/battle/mock-data";

// ---------------------------------------------------------------------------
// Mock sponsor entries
// ---------------------------------------------------------------------------
interface SponsorEntry {
  id: string;
  sponsor: string;       // Wallet address
  agentName: string;
  agentClass: AgentClass;
  amount: number;
  message?: string;
  timestamp: number;
}

const now = Date.now();

const MOCK_SPONSORS: SponsorEntry[] = [
  {
    id: "s-1",
    sponsor: "0xdead...beef",
    agentName: "MADLAD",
    agentClass: "GAMBLER",
    amount: 50,
    message: "Let the chaos reign!",
    timestamp: now - 230_000,
  },
  {
    id: "s-2",
    sponsor: "0x1234...abcd",
    agentName: "BLOODFANG",
    agentClass: "WARRIOR",
    amount: 120,
    message: "Destroy them all.",
    timestamp: now - 480_000,
  },
  {
    id: "s-3",
    sponsor: "0xfade...7777",
    agentName: "IRONSHELL",
    agentClass: "SURVIVOR",
    amount: 30,
    timestamp: now - 720_000,
  },
  {
    id: "s-4",
    sponsor: "0xc0de...0000",
    agentName: "ORACLE",
    agentClass: "TRADER",
    amount: 75,
    message: "Trust the data.",
    timestamp: now - 900_000,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SponsorFeed() {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
        Sponsors
      </h2>
      <div className="max-h-48 space-y-2 overflow-y-auto scrollbar-thin">
        {MOCK_SPONSORS.map((entry) => {
          const cfg = CLASS_CONFIG[entry.agentClass];
          return (
            <div
              key={entry.id}
              className="rounded border border-colosseum-surface-light bg-colosseum-bg/50 px-3 py-2"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gold font-bold">
                    {entry.amount} $HNADS
                  </span>
                  <span className="text-gray-600">to</span>
                  <span className={`font-bold ${cfg.color}`}>
                    {entry.agentName}
                  </span>
                </div>
                <span className="text-[10px] text-gray-700">
                  {timeAgo(entry.timestamp)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-gray-600">
                  from {entry.sponsor}
                </span>
              </div>
              {entry.message && (
                <p className="mt-1 text-[11px] italic text-gray-500">
                  &quot;{entry.message}&quot;
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
