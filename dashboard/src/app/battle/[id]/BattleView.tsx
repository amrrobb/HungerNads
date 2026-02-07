"use client";

import { useState } from "react";
import {
  ArenaLayout,
  ActionFeed,
  EpochTimer,
  MarketTicker,
  MOCK_AGENTS,
  MOCK_FEED,
  MOCK_PRICES,
} from "@/components/battle";
import { BettingPanel, SponsorModal, SponsorFeed } from "@/components/betting";

interface BattleViewProps {
  battleId: string;
}

export default function BattleView({ battleId }: BattleViewProps) {
  const currentEpoch = 3;
  const agents = MOCK_AGENTS;
  const feed = MOCK_FEED;
  const prices = MOCK_PRICES;

  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);

  const aliveCount = agents.filter((a) => a.alive).length;

  return (
    <div className="space-y-6">
      {/* Battle header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-blood">
            BATTLE #{battleId}
          </h1>
          <span className="rounded bg-blood/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blood animate-pulse">
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            Epoch <span className="text-white">{currentEpoch}</span>/20
          </span>
          <span>
            <span className="text-white">{aliveCount}</span> gladiators remain
          </span>
          <span className="hidden sm:inline text-gray-700">
            Pool: <span className="text-gold">2,450 $HNADS</span>
          </span>
        </div>
      </div>

      {/* Cinematic top bar: epoch timer + pool + sponsor button */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <EpochTimer currentEpoch={currentEpoch} />
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
              Pool
            </h2>
            <span className="text-lg font-bold text-gold">2,450 $HNADS</span>
          </div>
          <div className="mt-2 h-px w-full bg-colosseum-surface-light" />
          <div className="mt-2 flex justify-between text-[10px] text-gray-600">
            <span>Bettors: 42</span>
            <span>Sponsors: 7</span>
          </div>
          <button
            onClick={() => setSponsorModalOpen(true)}
            className="mt-3 w-full rounded border border-gold/30 bg-gold/10 py-1.5 text-xs font-bold uppercase tracking-wider text-gold transition-all hover:bg-gold/20 active:scale-[0.98]"
          >
            Sponsor a Gladiator
          </button>
        </div>
      </div>

      {/* Main layout: arena + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Arena */}
        <div className="card lg:col-span-2">
          <ArenaLayout agents={agents} currentEpoch={currentEpoch} />
        </div>

        {/* Sidebar: betting panel + sponsors + market + feed */}
        <div className="flex flex-col gap-4">
          {/* Betting panel */}
          <div className="card">
            <BettingPanel agents={agents} battleId={battleId} />
          </div>

          {/* Sponsor feed */}
          <div className="card">
            <SponsorFeed />
          </div>

          {/* Market ticker */}
          <div className="card">
            <MarketTicker prices={prices} />
          </div>

          {/* Action feed */}
          <div className="card flex-1">
            <ActionFeed entries={feed} />
          </div>
        </div>
      </div>

      {/* Bottom dramatic footer */}
      <div className="text-center text-[10px] uppercase tracking-[0.3em] text-gray-700">
        May the nads be ever in your favor
      </div>

      {/* Sponsor modal */}
      <SponsorModal
        open={sponsorModalOpen}
        onClose={() => setSponsorModalOpen(false)}
        agents={agents}
      />
    </div>
  );
}
