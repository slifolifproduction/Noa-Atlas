/**
 * The browser's own storage, kept apart from the data module so the language
 * and time-zone settings can read it at start-up without importing the store.
 */
import type { StateStorage } from 'zustand/middleware';

export const STORAGE_KEYS = {
  data: 'cognitive-atlas:data',
  ui: 'cognitive-atlas:ui',
  lang: 'cognitive-atlas:lang',
  zone: 'cognitive-atlas:zone',
} as const;

const memory = new Map<string, string>();

/** localStorage with an in-memory fallback (private mode, quota errors). */
export const safeLocalStorage: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name) ?? memory.get(name) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    memory.set(name, value);
    try {
      window.localStorage.setItem(name, value);
    } catch (error) {
      console.warn('[atlas] could not write to localStorage; keeping data in memory for this session', error);
    }
  },
  removeItem(name) {
    memory.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
