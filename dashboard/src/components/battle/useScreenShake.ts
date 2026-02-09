"use client";

import {
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
  createElement,
} from "react";
import { motion, useAnimation } from "motion/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShakeIntensity = "light" | "medium" | "heavy";

interface ShakeConfig {
  /** Max pixel displacement per axis */
  displacement: number;
  /** Duration in seconds */
  duration: number;
  /** Number of oscillation keyframes */
  keyframes: number;
}

const SHAKE_CONFIGS: Record<ShakeIntensity, ShakeConfig> = {
  light: { displacement: 2, duration: 0.3, keyframes: 4 },
  medium: { displacement: 5, duration: 0.4, keyframes: 6 },
  heavy: { displacement: 10, duration: 0.6, keyframes: 8 },
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Screen shake hook for combat events.
 *
 * Returns:
 * - `ShakeWrapper` — a `motion.div` component that wraps children with
 *   `overflow: hidden` and responds to `triggerShake` calls.
 * - `triggerShake` — fires a shake animation at the given intensity.
 *
 * Usage:
 * ```tsx
 * const { ShakeWrapper, triggerShake } = useScreenShake();
 * // ...
 * triggerShake("heavy");
 * return <ShakeWrapper>{children}</ShakeWrapper>;
 * ```
 */
export function useScreenShake() {
  const controls = useAnimation();
  const shakingRef = useRef(false);

  const triggerShake = useCallback(
    async (intensity: ShakeIntensity = "medium") => {
      // Prevent overlapping shakes — let the strongest one win
      if (shakingRef.current) return;
      shakingRef.current = true;

      const cfg = SHAKE_CONFIGS[intensity];
      const { displacement, duration, keyframes: count } = cfg;

      // Build random x/y keyframe arrays that settle back to 0
      const xFrames: number[] = [0];
      const yFrames: number[] = [0];

      for (let i = 1; i < count; i++) {
        // Decay factor — displacement decreases toward the end
        const decay = 1 - i / count;
        xFrames.push(
          (Math.random() * 2 - 1) * displacement * decay,
        );
        yFrames.push(
          (Math.random() * 2 - 1) * displacement * decay,
        );
      }

      // Always end at origin
      xFrames.push(0);
      yFrames.push(0);

      try {
        await controls.start({
          x: xFrames,
          y: yFrames,
          transition: {
            duration,
            ease: "easeOut",
          },
        });
      } finally {
        shakingRef.current = false;
      }
    },
    [controls],
  );

  /**
   * Wrapper component that should surround the content you want to shake.
   * Renders a `motion.div` with `overflow: hidden`.
   */
  const ShakeWrapper = useMemo(() => {
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        motion.div,
        {
          animate: controls,
          style: { overflow: "hidden" },
        },
        children,
      );
    }
    Wrapper.displayName = "ShakeWrapper";
    return Wrapper;
  }, [controls]);

  return { ShakeWrapper, triggerShake } as const;
}
