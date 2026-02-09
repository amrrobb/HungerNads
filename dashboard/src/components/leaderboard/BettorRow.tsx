'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BettorLeaderboardEntry {
  user_address: string;
  total_bets: number;
  total_wagered: number;
  total_payout: number;
  profit: number;
  wins: number;
  win_rate: number;
}

interface BettorRowProps {
  entry: BettorLeaderboardEntry;
  rank: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rankClass(rank: number): string {
  if (rank === 1) return 'text-gold';
  if (rank === 2) return 'text-gray-300';
  if (rank === 3) return 'text-amber-700';
  return 'text-gray-600';
}

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatAmount(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BettorRow({ entry, rank }: BettorRowProps) {
  const winPct = Math.round(entry.win_rate * 100);

  return (
    <div className="group flex items-center gap-3 rounded border border-colosseum-surface-light bg-colosseum-bg/50 px-3 py-3 transition-colors hover:border-gold/20 hover:bg-colosseum-surface/80 sm:py-2.5">
      {/* Rank */}
      <span className={`w-7 text-center text-sm font-bold ${rankClass(rank)}`}>
        {rank}
      </span>

      {/* Address */}
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-gray-400">
        {truncateAddress(entry.user_address)}
      </span>

      {/* Win rate */}
      <div className="hidden w-20 items-center gap-2 sm:flex">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-colosseum-surface-light">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${winPct}%`,
              backgroundColor:
                winPct >= 60
                  ? '#22c55e'
                  : winPct >= 40
                    ? '#f59e0b'
                    : '#dc2626',
            }}
          />
        </div>
        <span className="w-9 text-right text-[10px] text-gray-500">
          {winPct}%
        </span>
      </div>

      {/* Stats */}
      <div className="hidden gap-4 text-right md:flex">
        <div className="w-16">
          <div className="text-xs font-bold text-gray-300">
            {formatAmount(entry.total_wagered)}
          </div>
          <div className="text-[10px] text-gray-600">wagered</div>
        </div>
        <div className="w-12">
          <div className="text-xs font-bold text-gray-300">
            {entry.total_bets}
          </div>
          <div className="text-[10px] text-gray-600">bets</div>
        </div>
        <div className="w-12">
          <div className="text-xs font-bold text-gray-300">{entry.wins}</div>
          <div className="text-[10px] text-gray-600">wins</div>
        </div>
      </div>

      {/* Profit */}
      <div className="w-20 text-right">
        <span
          className={`text-sm font-bold ${
            entry.profit >= 0 ? 'text-green-400' : 'text-blood'
          }`}
        >
          {entry.profit >= 0 ? '+' : ''}
          {formatAmount(entry.profit)}
        </span>
      </div>
    </div>
  );
}
