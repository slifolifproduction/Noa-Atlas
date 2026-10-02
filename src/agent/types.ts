/**
 * The atlas agent: a conversation in a side panel where the person types, and the agent builds the six lenses from
 * it or talks it through with them (see README, "The atlas agent").
 *
 * It never writes on its own: what it would add is a change set, shown as a preview, lens by lens, that the person
 * applies (or not), and that can be taken back as a whole. Records are named the way the person sees them (element
 * names, "N12" for a note), never by internal ids.
 */
import type { RouteKey } from '../app/router';
import type { AreaKey, Effect, ElementKind, ID, ISODate, LinkType } from '../domain/types';

/** Who answers: the agent on this device, Claude on the person's claude.ai account, or the best one available. */
export type AgentMode = 'auto' | 'local' | 'claude';

export type Lens = 'map' | 'time' | 'causes' | 'repeats' | 'ahead' | 'quests';

/** One thing the agent would add, in the person's words. Elements are named, never referred to by id. */
export type Change =
  | { kind: 'element'; label: string; element: ElementKind; area: AreaKey; summary?: string }
  | { kind: 'link'; from: string; to: string; link: LinkType }
  | { kind: 'note'; title?: string; content: string; date: ISODate }
  | { kind: 'reason'; from: string; to: string; effect: Effect; how?: string }
  | { kind: 'repeat'; steps: string[]; observation: string; area?: AreaKey }
  | { kind: 'option'; title: string; objective: string; summary?: string }
  | { kind: 'quest'; title: string; due: ISODate; steps: string[] };

export interface DraftChange {
  key: string;
  change: Change;
  /** The person can leave any part out before applying. */
  include: boolean;
  /** Why it cannot be applied as it stands. */
  problem?: string;
  /** Already in the atlas: nothing new is made (an element of that name is used as it is). */
  exists?: boolean;
}

/** What applying made, to take it back exactly. */
export type Made = { kind: 'node' | 'link' | 'claim' | 'pattern' | 'path' | 'target' | 'entry'; id: ID };

export interface ChangeSet {
  id: string;
  items: DraftChange[];
  state: 'draft' | 'applied' | 'discarded' | 'undone';
  made?: Made[];
  appliedAt?: string;
}

/** A record an answer refers to, shown as a chip that opens it. */
export interface Citation {
  kind: 'entry' | 'decision' | 'claim' | 'pattern' | 'node' | 'path';
  id: ID;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: string;
  by?: 'local' | 'claude';
  cites?: Citation[];
  changes?: ChangeSet;
  /** Outside what the agent is for. */
  refused?: boolean;
  error?: boolean;
  /** Places in the app the answer points to. */
  open?: { label: string; route: RouteKey; param?: string }[];
  /** Still being written (Claude, as it streams). */
  streaming?: boolean;
}
