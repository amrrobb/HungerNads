"use client";

import type { MarketPrice } from "./mock-data";

interface MarketTickerProps {
  prices: MarketPrice[];
}

const ASSET_ICONS: Record<string, string> = {
  ETH: "\u039E",
  BTC: "\u20BF",
  SOL: "S",
  MON: "M",
};

function formatPrice(price: number): string {
  if (price >= 10_000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function MarketTicker({ prices }: MarketTickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
        Markets
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {prices.map((p) => {
          const isPositive = p.change24h >= 0;
          return (
            <div
              key={p.asset}
              className="flex items-center justify-between rounded-md border border-colosseum-surface-light bg-colosseum-bg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-colosseum-surface text-[10px] font-bold text-gray-400">
                  {ASSET_ICONS[p.asset] ?? p.asset[0]}
                </span>
                <div>
                  <div className="text-xs font-bold text-white">{p.asset}</div>
                  <div className="text-[10px] text-gray-500">
                    ${formatPrice(p.price)}
                  </div>
                </div>
              </div>
              <span
                className={`text-xs font-medium ${
                  isPositive ? "text-green-400" : "text-blood"
                }`}
              >
                {isPositive ? "+" : ""}
                {p.change24h.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
