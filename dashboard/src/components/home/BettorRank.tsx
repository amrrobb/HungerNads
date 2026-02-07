interface RankedBettor {
  rank: number;
  address: string;
  profit: number;
  totalBets: number;
}

interface BettorRankProps {
  bettors: RankedBettor[];
}

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function BettorRank({ bettors }: BettorRankProps) {
  return (
    <div className="card">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
        Top Bettors
      </h2>
      <div className="space-y-2">
        {bettors.map((bettor) => (
          <div
            key={bettor.rank}
            className="flex items-center gap-3 rounded border border-colosseum-surface-light bg-colosseum-bg/50 px-3 py-2"
          >
            <span
              className={`w-5 text-center text-sm font-bold ${
                bettor.rank === 1
                  ? "text-gold"
                  : bettor.rank === 2
                    ? "text-gray-300"
                    : bettor.rank === 3
                      ? "text-amber-700"
                      : "text-gray-600"
              }`}
            >
              {bettor.rank}
            </span>
            <span className="flex-1 text-sm font-mono text-gray-400">
              {truncateAddress(bettor.address)}
            </span>
            <div className="text-right">
              <span
                className={`text-sm font-bold ${
                  bettor.profit >= 0 ? "text-green-400" : "text-blood"
                }`}
              >
                {bettor.profit >= 0 ? "+" : ""}
                {bettor.profit.toLocaleString()}
              </span>
              <span className="ml-1 text-[10px] text-gray-600">
                ({bettor.totalBets} bets)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { RankedBettor };
