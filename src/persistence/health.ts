/**
 * What the browser's storage did that the person must know about, kept apart so the storage adapter can report it
 * without importing the interface.
 */
import { create } from 'zustand';

export interface Unreadable {
  /** Where it was found, and when it was put aside. */
  key: string;
  at: string;
  /** Exactly what was stored, untouched. */
  raw: string;
}

interface StorageHealth {
  /** The last write did not go through (the storage is full, or blocked): what changes now lives only in this tab. */
  failing: boolean;
  /** An atlas found unreadable on load and put aside, before anything could write over it. */
  unreadable?: Unreadable;
  setFailing(failing: boolean): void;
  setUnreadable(u?: Unreadable): void;
}

export const useStorageHealth = create<StorageHealth>()((set, get) => ({
  failing: false,
  setFailing: (failing) => get().failing !== failing && set({ failing }),
  setUnreadable: (unreadable) => set({ unreadable }),
}));
