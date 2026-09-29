/**
 * Motion for the living graphs (Orbit and Mind).
 *
 * Everything here runs outside React's render loop: CSS animations, WAAPI
 * transform keyframes along real edge curves, a parallax space field on
 * requestAnimationFrame, and a tiny event bus for occasional activity waves.
 * No component re-renders per frame.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ID } from '../domain/types';

export interface MotionSettings {
  /** The graph animates. Off, it stays still. */
  living: boolean;
  /** The user asked the OS for reduced motion. */
  reduced: boolean;
  /** Share of eligible edges that carry an idle pulse, so large graphs stay calm and cheap. */
  idleShare: number;
  /** Share of engaged (selected / hovered) edges that carry fast pulses. */
  activeShare: number;
}

/** At most this many edges pulse while nothing is selected. */
export const MAX_IDLE_PULSES = 60;
/** At most this many edges carry fast pulses around a selection. */
export const MAX_ACTIVE_PULSES = 24;

export const MotionContext = createContext<MotionSettings>({ living: false, reduced: false, idleShare: 1, activeShare: 1 });
export const useMotion = () => useContext(MotionContext);

/** Stable pseudo-random number in [0, 1) from a string, for per-element phase. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/* ------------------------------------------------------------ activity waves */

export interface Wave {
  /** Node the wave starts from: a hub in Orbit, a well-connected node in Mind. */
  origin: ID;
  /** Nodes the wave reaches on its second step. */
  reached: ID[];
  at: number;
  /** 1 for the origin, lower for nodes reached by propagation. */
  strength: number;
}

type Listener = (w: Wave) => void;
const listeners = new Set<Listener>();

export const waveBus = {
  emit(w: Wave) {
    for (const l of listeners) l(w);
  },
  on(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/**
 * Latest wave touching `ids` (as origin or reached), or null. Only
 * subscribed components re-render, and only when a wave concerns them.
 */
export function useWave(active: boolean, match: (w: Wave) => boolean): Wave | null {
  const [wave, setWave] = useState<Wave | null>(null);
  useEffect(() => {
    if (!active) return;
    return waveBus.on((w) => match(w) && setWave(w));
    // match is recreated each render; subscription only depends on `active`.
  }, [active]);
  return wave;
}

/** Pulses move at a constant, slow speed (graph units per second), whatever the edge length. */
export const PULSE_SPEED = 120;
export const pulseTravel = (length: number) => Math.min(6, Math.max(1.4, length / PULSE_SPEED));
