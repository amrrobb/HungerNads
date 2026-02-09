"use client";

import { useState } from "react";

interface AgentPortraitProps {
  /** Path to the pixel art portrait image. */
  image: string;
  /** Emoji fallback shown if the image fails to load. */
  emoji: string;
  /** Alt text for the image. */
  alt?: string;
  /** Size class string, e.g. "w-8 h-8" or "text-2xl" for emoji fallback. */
  size?: string;
  /** Additional CSS classes for the wrapper. */
  className?: string;
}

/**
 * Renders an agent pixel art portrait with emoji fallback.
 * Used across all HTML (non-SVG) contexts where agent class icons appear.
 */
export default function AgentPortrait({
  image,
  emoji,
  alt = "Agent portrait",
  size = "w-8 h-8",
  className = "",
}: AgentPortraitProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className={className}>{emoji}</span>;
  }

  return (
    <img
      src={image}
      alt={alt}
      className={`${size} rounded object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
