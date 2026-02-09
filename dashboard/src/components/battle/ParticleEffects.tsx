"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import type { AgentClass } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParticleEffectType =
  | "attack"
  | "defend"
  | "death"
  | "sponsor"
  | "prediction_win"
  | "prediction_loss";

export interface ParticleEffect {
  id: string;
  type: ParticleEffectType;
  /** Normalized position (0-1) within the arena container */
  x: number;
  y: number;
  /** Optional end position for directional effects (attack) */
  toX?: number;
  toY?: number;
  /** Optional agent class for class-specific color palettes */
  agentClass?: AgentClass;
  createdAt: number;
}

export interface ParticleEffectsProps {
  /** Active effects to render */
  effects: ParticleEffect[];
  /** Called when an effect finishes its animation */
  onEffectComplete?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// tsParticles engine initialization (singleton)
// ---------------------------------------------------------------------------

let engineReady = false;
let enginePromise: Promise<void> | null = null;

function ensureEngine(): Promise<void> {
  if (engineReady) return Promise.resolve();
  if (!enginePromise) {
    enginePromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      engineReady = true;
    });
  }
  return enginePromise;
}

// ---------------------------------------------------------------------------
// Effect durations (ms)
// ---------------------------------------------------------------------------

const EFFECT_DURATIONS: Record<ParticleEffectType, number> = {
  attack: 1200,
  defend: 1800,
  death: 2500,
  sponsor: 3000,
  prediction_win: 1500,
  prediction_loss: 1200,
};

// ---------------------------------------------------------------------------
// Class-specific particle color palettes
// ---------------------------------------------------------------------------

const CLASS_PARTICLE_PALETTES: Record<AgentClass, {
  attack: string[];
  defend: string[];
  death: string[];
}> = {
  WARRIOR: {
    attack: ["#dc2626", "#ef4444", "#f87171", "#ff6b35", "#ea580c"],
    defend: ["#dc2626", "#f87171", "#fca5a5", "#b91c1c"],
    death: ["#dc2626", "#ef4444", "#b91c1c", "#991b1b", "#f97316", "#fbbf24"],
  },
  TRADER: {
    attack: ["#3b82f6", "#60a5fa", "#06b6d4", "#22d3ee", "#0ea5e9"],
    defend: ["#3b82f6", "#60a5fa", "#93c5fd", "#0284c7"],
    death: ["#3b82f6", "#60a5fa", "#0ea5e9", "#06b6d4", "#22d3ee", "#67e8f9"],
  },
  SURVIVOR: {
    attack: ["#22c55e", "#4ade80", "#10b981", "#34d399", "#059669"],
    defend: ["#22c55e", "#4ade80", "#86efac", "#16a34a"],
    death: ["#22c55e", "#4ade80", "#16a34a", "#15803d", "#10b981", "#fbbf24"],
  },
  PARASITE: {
    attack: ["#7c3aed", "#a78bfa", "#8b5cf6", "#c084fc", "#9333ea"],
    defend: ["#7c3aed", "#a78bfa", "#c4b5fd", "#6d28d9"],
    death: ["#7c3aed", "#a78bfa", "#8b5cf6", "#6d28d9", "#c084fc", "#e879f9"],
  },
  GAMBLER: {
    attack: ["#dc2626", "#f59e0b", "#22c55e", "#3b82f6", "#7c3aed"],
    defend: ["#f59e0b", "#fbbf24", "#fde68a", "#d97706", "#ec4899", "#a78bfa"],
    death: ["#dc2626", "#f59e0b", "#22c55e", "#3b82f6", "#7c3aed", "#ec4899"],
  },
};

/** Default palettes used when no agentClass is specified (backward compat). */
const DEFAULT_ATTACK_COLORS = ["#dc2626", "#ef4444", "#f87171", "#ff6b35"];
const DEFAULT_DEFEND_COLORS = ["#7c3aed", "#818cf8", "#a78bfa", "#60a5fa"];
const DEFAULT_DEATH_COLORS = ["#dc2626", "#ef4444", "#b91c1c", "#991b1b", "#f97316", "#fbbf24"];

// ---------------------------------------------------------------------------
// tsParticles config builders
// ---------------------------------------------------------------------------

function buildTsParticlesConfig(effect: ParticleEffect): ISourceOptions {
  switch (effect.type) {
    case "attack":
      return attackConfig(effect);
    case "defend":
      return defendConfig(effect.agentClass);
    case "death":
      return deathConfig(effect.agentClass);
    case "sponsor":
      return sponsorConfig();
    case "prediction_win":
      return predictionWinConfig();
    case "prediction_loss":
      return predictionLossConfig();
  }
}

function attackConfig(effect: ParticleEffect): ISourceOptions {
  // Directional burst from attacker toward target
  const angle = effect.toX !== undefined && effect.toY !== undefined
    ? Math.atan2(effect.toY - effect.y, effect.toX - effect.x) * (180 / Math.PI)
    : 0;

  const colors = effect.agentClass
    ? CLASS_PARTICLE_PALETTES[effect.agentClass].attack
    : DEFAULT_ATTACK_COLORS;

  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: { value: 20 },
      color: { value: colors },
      shape: { type: "circle" },
      opacity: {
        value: { min: 0.5, max: 1 },
        animation: { enable: true, speed: 1.5, startValue: "max", destroy: "min" },
      },
      size: {
        value: { min: 2, max: 5 },
        animation: { enable: true, speed: 3, startValue: "max", destroy: "min" },
      },
      move: {
        enable: true,
        speed: { min: 8, max: 20 },
        direction: "none",
        outModes: { default: "destroy" },
        angle: { offset: angle, value: 45 },
      },
      life: {
        count: 1,
        duration: { value: 0.8 },
      },
    },
    emitters: {
      direction: "none",
      life: { count: 1, duration: 0.2 },
      rate: { quantity: 20, delay: 0 },
      position: { x: 50, y: 50 },
    },
    detectRetina: true,
  };
}

function defendConfig(agentClass?: AgentClass): ISourceOptions {
  const colors = agentClass
    ? CLASS_PARTICLE_PALETTES[agentClass].defend
    : DEFAULT_DEFEND_COLORS;

  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: { value: 30 },
      color: { value: colors },
      shape: { type: "circle" },
      opacity: {
        value: { min: 0.3, max: 0.9 },
        animation: {
          enable: true,
          speed: 0.8,
          startValue: "max",
          destroy: "min",
        },
      },
      size: {
        value: { min: 1, max: 3 },
      },
      move: {
        enable: true,
        speed: { min: 1, max: 3 },
        direction: "none",
        outModes: { default: "destroy" },
      },
      life: {
        count: 1,
        duration: { value: 1.5 },
      },
    },
    emitters: {
      direction: "none",
      life: { count: 1, duration: 0.5 },
      rate: { quantity: 30, delay: 0 },
      position: { x: 50, y: 50 },
      size: { width: 60, height: 60 },
    },
    detectRetina: true,
  };
}

function deathConfig(agentClass?: AgentClass): ISourceOptions {
  const colors = agentClass
    ? CLASS_PARTICLE_PALETTES[agentClass].death
    : DEFAULT_DEATH_COLORS;

  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: { value: 50 },
      color: {
        value: colors,
      },
      shape: { type: ["circle", "square"] },
      opacity: {
        value: { min: 0.4, max: 1 },
        animation: {
          enable: true,
          speed: 0.5,
          startValue: "max",
          destroy: "min",
        },
      },
      size: {
        value: { min: 2, max: 8 },
        animation: {
          enable: true,
          speed: 4,
          startValue: "max",
          destroy: "min",
        },
      },
      move: {
        enable: true,
        speed: { min: 5, max: 25 },
        direction: "none",
        outModes: { default: "destroy" },
        gravity: { enable: true, acceleration: 5 },
      },
      life: {
        count: 1,
        duration: { value: 2 },
      },
    },
    emitters: {
      direction: "none",
      life: { count: 1, duration: 0.15 },
      rate: { quantity: 50, delay: 0 },
      position: { x: 50, y: 50 },
    },
    detectRetina: true,
  };
}

function sponsorConfig(): ISourceOptions {
  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: { value: 40 },
      color: { value: ["#fbbf24", "#f59e0b", "#d97706", "#fde68a", "#fef3c7"] },
      shape: { type: "star" },
      opacity: {
        value: { min: 0.4, max: 1 },
        animation: {
          enable: true,
          speed: 0.6,
          startValue: "random",
          destroy: "min",
        },
      },
      size: {
        value: { min: 2, max: 6 },
        animation: {
          enable: true,
          speed: 2,
          startValue: "random",
        },
      },
      move: {
        enable: true,
        speed: { min: 1, max: 4 },
        direction: "bottom",
        outModes: { default: "destroy" },
      },
      tilt: {
        enable: true,
        direction: "random",
        value: { min: 0, max: 360 },
        animation: { enable: true, speed: 30 },
      },
      wobble: {
        enable: true,
        distance: 15,
        speed: 10,
      },
      life: {
        count: 1,
        duration: { value: 2.5 },
      },
    },
    emitters: {
      direction: "bottom",
      life: { count: 1, duration: 0.8 },
      rate: { quantity: 8, delay: 0.1 },
      position: { x: 50, y: 0 },
      size: { width: 100, height: 0 },
    },
    detectRetina: true,
  };
}

function predictionWinConfig(): ISourceOptions {
  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: { value: 25 },
      color: { value: ["#22c55e", "#4ade80", "#86efac", "#16a34a"] },
      shape: { type: ["circle", "square"] },
      opacity: {
        value: { min: 0.5, max: 1 },
        animation: {
          enable: true,
          speed: 0.8,
          startValue: "max",
          destroy: "min",
        },
      },
      size: {
        value: { min: 2, max: 5 },
      },
      move: {
        enable: true,
        speed: { min: 3, max: 10 },
        direction: "top",
        outModes: { default: "destroy" },
      },
      tilt: {
        enable: true,
        direction: "random",
        value: { min: 0, max: 360 },
        animation: { enable: true, speed: 20 },
      },
      wobble: {
        enable: true,
        distance: 10,
        speed: 8,
      },
      life: {
        count: 1,
        duration: { value: 1.2 },
      },
    },
    emitters: {
      direction: "top",
      life: { count: 1, duration: 0.3 },
      rate: { quantity: 25, delay: 0 },
      position: { x: 50, y: 50 },
    },
    detectRetina: true,
  };
}

function predictionLossConfig(): ISourceOptions {
  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      number: { value: 15 },
      color: { value: ["#dc2626", "#991b1b", "#7f1d1d"] },
      shape: { type: "circle" },
      opacity: {
        value: { min: 0.3, max: 0.8 },
        animation: {
          enable: true,
          speed: 1.2,
          startValue: "max",
          destroy: "min",
        },
      },
      size: {
        value: { min: 3, max: 8 },
        animation: {
          enable: true,
          speed: 2,
          startValue: "max",
          destroy: "min",
        },
      },
      move: {
        enable: true,
        speed: { min: 0.5, max: 2 },
        direction: "bottom",
        outModes: { default: "destroy" },
      },
      life: {
        count: 1,
        duration: { value: 1 },
      },
    },
    emitters: {
      direction: "bottom",
      life: { count: 1, duration: 0.2 },
      rate: { quantity: 15, delay: 0 },
      position: { x: 50, y: 50 },
      size: { width: 40, height: 40 },
    },
    detectRetina: true,
  };
}

// ---------------------------------------------------------------------------
// Single effect renderer
// ---------------------------------------------------------------------------

interface EffectRendererProps {
  effect: ParticleEffect;
  containerWidth: number;
  containerHeight: number;
  onComplete: (id: string) => void;
}

const EffectRenderer = memo(function EffectRenderer({
  effect,
  containerWidth,
  containerHeight,
  onComplete,
}: EffectRendererProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureEngine().then(() => setReady(true));
  }, []);

  // Auto-remove after duration
  useEffect(() => {
    const duration = EFFECT_DURATIONS[effect.type];
    const timer = setTimeout(() => {
      onComplete(effect.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [effect.id, effect.type, onComplete]);

  const config = useMemo(() => buildTsParticlesConfig(effect), [effect]);

  if (!ready) return null;

  // Position the particle container at the effect location
  // Size it relative to the effect type
  const effectSize = effect.type === "sponsor" ? 1 : effect.type === "death" ? 0.5 : 0.35;
  const width = containerWidth * effectSize;
  const height = containerHeight * effectSize;
  const left = effect.x * containerWidth - width / 2;
  const top = effect.y * containerHeight - height / 2;

  // For sponsor effect, cover the full width at the top
  const style: React.CSSProperties =
    effect.type === "sponsor"
      ? {
          position: "absolute",
          left: 0,
          top: 0,
          width: containerWidth,
          height: containerHeight,
          pointerEvents: "none",
          zIndex: 20,
        }
      : {
          position: "absolute",
          left: Math.max(0, left),
          top: Math.max(0, top),
          width,
          height,
          pointerEvents: "none",
          zIndex: 20,
        };

  return (
    <div style={style}>
      <Particles
        id={`effect-${effect.id}`}
        options={config}
        style={{ width: "100%", height: "100%", position: "absolute" }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main ParticleEffects overlay
// ---------------------------------------------------------------------------

function ParticleEffects({ effects, onEffectComplete }: ParticleEffectsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(el);
    // Initial measurement
    const rect = el.getBoundingClientRect();
    setDimensions({ width: rect.width, height: rect.height });

    return () => observer.disconnect();
  }, []);

  const handleComplete = useCallback(
    (id: string) => {
      onEffectComplete?.(id);
    },
    [onEffectComplete],
  );

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 10 }}
    >
      {effects.map((effect) => (
        <EffectRenderer
          key={effect.id}
          effect={effect}
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
          onComplete={handleComplete}
        />
      ))}
    </div>
  );
}

export default memo(ParticleEffects);

// ---------------------------------------------------------------------------
// useParticleEffects hook — manages effect lifecycle
// ---------------------------------------------------------------------------

export function useParticleEffects() {
  const [effects, setEffects] = useState<ParticleEffect[]>([]);
  const idCounter = useRef(0);

  const spawnEffect = useCallback(
    (
      type: ParticleEffectType,
      x: number,
      y: number,
      toX?: number,
      toY?: number,
      agentClass?: AgentClass,
    ) => {
      const id = `particle-${idCounter.current++}-${Date.now()}`;
      const effect: ParticleEffect = {
        id,
        type,
        x,
        y,
        toX,
        toY,
        agentClass,
        createdAt: Date.now(),
      };
      setEffects((prev) => [...prev, effect]);
      return id;
    },
    [],
  );

  const removeEffect = useCallback((id: string) => {
    setEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Convenience methods
  const spawnAttack = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number, agentClass?: AgentClass) =>
      spawnEffect("attack", fromX, fromY, toX, toY, agentClass),
    [spawnEffect],
  );

  const spawnDefend = useCallback(
    (x: number, y: number, agentClass?: AgentClass) =>
      spawnEffect("defend", x, y, undefined, undefined, agentClass),
    [spawnEffect],
  );

  const spawnDeath = useCallback(
    (x: number, y: number, agentClass?: AgentClass) =>
      spawnEffect("death", x, y, undefined, undefined, agentClass),
    [spawnEffect],
  );

  const spawnSponsor = useCallback(
    () => spawnEffect("sponsor", 0.5, 0),
    [spawnEffect],
  );

  const spawnPredictionWin = useCallback(
    (x: number, y: number) => spawnEffect("prediction_win", x, y),
    [spawnEffect],
  );

  const spawnPredictionLoss = useCallback(
    (x: number, y: number) => spawnEffect("prediction_loss", x, y),
    [spawnEffect],
  );

  return {
    effects,
    removeEffect,
    spawnAttack,
    spawnDefend,
    spawnDeath,
    spawnSponsor,
    spawnPredictionWin,
    spawnPredictionLoss,
  };
}
