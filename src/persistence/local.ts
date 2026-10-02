/**
 * The browser's own storage, kept apart from the data module so the language
 * and time-zone settings can read it at start-up without importing the store.
 */
import type { StateStorage } from 'zustand/middleware';
import { useStorageHealth } from './health';

export const STORAGE_KEYS = {
  data: 'cognitive-atlas:data',
  ui: 'cognitive-atlas:ui',
  lang: 'cognitive-atlas:lang',
  zone: 'cognitive-atlas:zone',
} as const;

const memory = new Map<string, string>();
/** What could not be written: until a write goes through again, the copy in memory is the newer one. */
const unsaved = new Set<string>();

/**
 * localStorage with an in-memory fallback (private mode, quota errors). A write that does not go through is kept in
 * memory and reported (see health.ts), so the person is told, and can download a copy, rather than lose it on reload.
 */
export const safeLocalStorage: StateStorage = {
  getItem(name) {
    if (unsaved.has(name)) return memory.get(name) ?? null;
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
      unsaved.delete(name);
      if (!unsaved.size) useStorageHealth.getState().setFailing(false);
    } catch (error) {
      unsaved.add(name);
      useStorageHealth.getState().setFailing(true);
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
