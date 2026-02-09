"use client";

/**
 * OddsIndicator - Shows odds change direction with colored arrows.
 *
 * Green arrow up = odds increased (better payout for bettors).
 * Red arrow down = odds decreased (worse payout).
 * Neutral dash = no change.
 */

interface OddsIndicatorProps {
  currentOdds: number;
  previousOdds: number | null;
}

export default function OddsIndicator({
  currentOdds,
  previousOdds,
}: OddsIndicatorProps) {
  if (previousOdds === null) return null;

  const delta = currentOdds - previousOdds;
  const threshold = 0.05; // ignore tiny fluctuations

  if (Math.abs(delta) < threshold) {
    return (
      <span className="inline-flex items-center text-[10px] text-gray-600">
        --
      </span>
    );
  }

  const isUp = delta > 0;
  const pct = ((delta / previousOdds) * 100).toFixed(0);

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${
        isUp ? "text-green-400" : "text-blood"
      }`}
      title={`${isUp ? "+" : ""}${delta.toFixed(2)} (${isUp ? "+" : ""}${pct}%)`}
    >
      {isUp ? (
        <svg
          className="h-3 w-3"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 10V2M6 2L2 6M6 2L10 6" />
        </svg>
      ) : (
        <svg
          className="h-3 w-3"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 2V10M6 10L2 6M6 10L10 6" />
        </svg>
      )}
      {isUp ? "+" : ""}
      {pct}%
    </span>
  );
}
