/**
 * HUNGERNADS - useSoundEffects Hook
 *
 * Web Audio API-based sound effects for the battle experience.
 * All sounds are generated programmatically via oscillators and noise buffers.
 * No external audio files or npm dependencies required.
 *
 * Sounds:
 *   - Combat hit:  short percussive white noise burst (~100ms)
 *   - Death/REKT:  dramatic descending oscillator tone (~500ms)
 *   - Epoch tick:  subtle high-frequency click (~50ms)
 *
 * Default state is muted to respect browser autoplay policies.
 * Mute preference is persisted to localStorage.
 *
 * Usage:
 *   const { playCombatHit, playDeath, playEpochTick, isMuted, toggleMute } =
 *     useSoundEffects();
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Constants ────────────────────────────────────────────────────────

const STORAGE_KEY = 'hungernads:sound-muted';
const SAMPLE_RATE = 44100;

// ─── Types ────────────────────────────────────────────────────────────

export interface UseSoundEffectsResult {
  /** Play a short percussive combat hit sound. */
  playCombatHit: () => void;
  /** Play a dramatic descending death/REKT sound. */
  playDeath: () => void;
  /** Play a subtle epoch tick/click sound. */
  playEpochTick: () => void;
  /** Whether sound is currently muted. */
  isMuted: boolean;
  /** Toggle mute on/off (persists to localStorage). */
  toggleMute: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getStoredMutePreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Default to muted if no preference stored
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function setStoredMutePreference(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(muted));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

// ─── Sound Generators ─────────────────────────────────────────────────

/**
 * Combat hit: white noise burst with sharp attack and fast decay.
 * ~100ms, percussive impact feel.
 */
function playCombatHitSound(ctx: AudioContext): void {
  const duration = 0.1; // 100ms
  const bufferSize = Math.floor(SAMPLE_RATE * duration);
  const buffer = ctx.createBuffer(1, bufferSize, SAMPLE_RATE);
  const data = buffer.getChannelData(0);

  // Fill with white noise
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1);
  }

  // Apply exponential decay envelope
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    // Sharp attack (first 5%), then exponential decay
    const envelope = t < 0.05 ? t / 0.05 : Math.exp(-8 * (t - 0.05));
    data[i] *= envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Bandpass filter for a punchy mid-range hit
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 1.5;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0.3;

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + duration);
}

/**
 * Death/REKT: dramatic descending oscillator sweep with distortion.
 * ~500ms, ominous falling tone.
 */
function playDeathSound(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const duration = 0.5;

  // Primary descending oscillator (sawtooth for harshness)
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(440, now);
  osc1.frequency.exponentialRampToValueAtTime(80, now + duration);

  // Sub-bass layer for weight
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(220, now);
  osc2.frequency.exponentialRampToValueAtTime(40, now + duration);

  // Gain envelope: sharp attack, sustained, then fade
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.25, now + 0.02); // 20ms attack
  gainNode.gain.setValueAtTime(0.25, now + 0.3);
  gainNode.gain.linearRampToValueAtTime(0, now + duration);

  // Low-pass filter sweep (opens then closes)
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + duration);
  filter.Q.value = 2;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration);
  osc2.stop(now + duration);
}

/**
 * Epoch tick: subtle high-frequency click.
 * ~50ms, gentle UI feedback.
 */
function playEpochTickSound(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const duration = 0.05; // 50ms

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 1200;

  // Very short envelope: instant attack, fast decay
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.15, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

// ─── Hook ─────────────────────────────────────────────────────────────

export function useSoundEffects(): UseSoundEffectsResult {
  const [isMuted, setIsMuted] = useState(true); // SSR-safe default
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Hydrate mute state from localStorage on mount
  useEffect(() => {
    setIsMuted(getStoredMutePreference());
  }, []);

  /**
   * Lazily create AudioContext on first user interaction.
   * This avoids browser autoplay policy warnings.
   */
  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;

    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new AudioContext();
      } catch {
        // Web Audio API not supported
        return null;
      }
    }

    // Resume if suspended (browsers suspend until user gesture)
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    return audioCtxRef.current;
  }, []);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setStoredMutePreference(next);

      // If unmuting, create AudioContext on this user gesture
      if (!next) {
        getAudioContext();
      }

      return next;
    });
  }, [getAudioContext]);

  const playCombatHit = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx) playCombatHitSound(ctx);
  }, [isMuted, getAudioContext]);

  const playDeath = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx) playDeathSound(ctx);
  }, [isMuted, getAudioContext]);

  const playEpochTick = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx) playEpochTickSound(ctx);
  }, [isMuted, getAudioContext]);

  return {
    playCombatHit,
    playDeath,
    playEpochTick,
    isMuted,
    toggleMute,
  };
}

export default useSoundEffects;
