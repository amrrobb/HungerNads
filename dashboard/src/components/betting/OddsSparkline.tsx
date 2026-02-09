"use client";

/**
 * OddsSparkline - Mini SVG sparkline showing odds history for an agent.
 * No external charting library needed -- pure SVG path.
 */

interface OddsSparklineProps {
  /** Ordered odds values over time (oldest first). */
  history: number[];
  /** Stroke color class (tailwind text-* class used as SVG stroke). */
  color?: string;
  /** Width of the sparkline in px. */
  width?: number;
  /** Height of the sparkline in px. */
  height?: number;
}

export default function OddsSparkline({
  history,
  color = "#f59e0b",
  width = 64,
  height = 20,
}: OddsSparklineProps) {
  if (history.length < 2) return null;

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const padding = 1;

  const points = history.map((val, i) => {
    const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
    const y =
      padding + (1 - (val - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const polyline = points.join(" ");

  // Determine color from trend: green if latest > first, red if down, gold if flat
  const trend = history[history.length - 1] - history[0];
  const strokeColor =
    Math.abs(trend) < 0.05
      ? "#f59e0b"
      : trend > 0
        ? "#22c55e"
        : "#dc2626";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke={color !== "#f59e0b" ? color : strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
