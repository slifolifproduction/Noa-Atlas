/**
 * A copy of the atlas, kept somewhere else. The atlas lives only in this browser: a browser cleared, a phone lost or
 * a Safari that clears what a site kept after a week unused, and it is gone. So every copy downloaded is noted, and
 * an atlas of the person's own that has gone a while without one is quietly brought up (see BackupReminder): a week
 * after it first holds a few notes, then two weeks after each copy. "Later" puts it off a week.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AtlasData } from '../domain/types';
import { todayISO } from '../lib/dates';
import { downloadText } from '../lib/download';
import { safeLocalStorage } from './local';
import { exportPayload } from './storage';

const DAY = 86_400_000;
/** Notes of the person's own before an atlas is worth a reminder. */
export const WORTH_KEEPING = 3;

export interface BackupRecord {
  /** When a copy was last downloaded. */
  at?: string;
  /** Since when this browser has held an atlas worth keeping (stamped the first time it does). */
  since?: string;
  /** Not to be reminded before. */
  later?: string;
}

interface BackupState extends BackupRecord {
  stamp(now?: Date): void;
  record(now?: Date): void;
  putOff(now?: Date): void;
}

export const useBackup = create<BackupState>()(
  persist(
    (set, get) => ({
      stamp: (now = new Date()) => void (get().since || set({ since: now.toISOString() })),
      record: (now = new Date()) => set({ at: now.toISOString(), later: undefined }),
      putOff: (now = new Date()) => set({ later: new Date(now.getTime() + 7 * DAY).toISOString() }),
    }),
    {
      name: 'cognitive-atlas:backup',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: ({ at, since, later }) => ({ at, since, later }),
    },
  ),
);

/** Whether to bring a copy up now: an atlas of the person's own, worth keeping, a week (or two since the last copy) on. */
export function backupDue(r: BackupRecord, own: boolean, notes: number, now: Date): boolean {
  if (!own || notes < WORTH_KEEPING) return false;
  if (r.later && Date.parse(r.later) > now.getTime()) return false;
  const from = r.at ?? r.since;
  if (!from) return false;
  return now.getTime() - Date.parse(from) >= (r.at ? 14 : 7) * DAY;
}

/** Download the atlas as a file (the same as Settings → Export JSON), and note that a copy now exists. */
export function downloadAtlasCopy(data: AtlasData) {
  downloadText(`noa-atlas-${todayISO()}.json`, exportPayload(data));
  useBackup.getState().record();
}
