/**
 * Where this atlas is kept, as the interface shows it: on this device only,
 * or in the viewer's claude.ai account (the same on every device where they
 * sign in), and how the last save went. Set by `sync/connect.ts`; not
 * persisted.
 */
import { create } from 'zustand';
import type { SyncStatus } from '../sync/accountSync';

/** Why the atlas stays on this device. */
export type DeviceReason =
  /** Not opened inside claude.ai. */
  | 'outside'
  /** Inside claude.ai, but no account (signed out) or no store for this view. */
  | 'signed-out'
  /** Served by claude.ai as a page of its own (opened in a tab by itself), where it lends the page nothing. */
  | 'full-page'
  /** Signed in, but this link does not let the viewer save to their account. */
  | 'read-only'
  /** The account could not be reached just now. */
  | 'unreachable';

export interface AccountState {
  mode: 'checking' | 'device' | 'account';
  reason?: DeviceReason;
  /** The account can hold an atlas and has none yet: moving this one in is offered. */
  offer: boolean;
  sync?: SyncStatus;
  /** Whether Claude can be asked from here, on the viewer's own account (inside claude.ai, signed in). */
  claude: 'checking' | 'available' | 'unavailable';
}

export const useAccount = create<AccountState>()(() => ({ mode: 'checking', offer: false, claude: 'checking' }));
