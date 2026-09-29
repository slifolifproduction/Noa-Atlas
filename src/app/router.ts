import { useSyncExternalStore } from 'react';
import { GROUPS, groupOf, VIEWS, type GroupKey, type ViewKey } from '../domain/constants';

export type RouteKey = ViewKey;

export interface Route {
  key: RouteKey;
  param?: string;
}

const KEYS = new Set<string>(Object.keys(VIEWS));

/** Pages that were renamed or folded into a lens: old links keep working. */
const RENAMED: Record<string, Route> = {
  mind: { key: 'network' },
  journal: { key: 'timeline', param: 'notes' },
  decisions: { key: 'timeline', param: 'decisions' },
  questions: { key: 'orbit' },
};

export function parseHash(hash: string): Route {
  const [raw, param] = hash.replace(/^#\/?/, '').split('/');
  if (RENAMED[raw]) return RENAMED[raw];
  return KEYS.has(raw) ? { key: raw as RouteKey, param: param ? decodeURIComponent(param) : undefined } : { key: 'orbit' };
}

function subscribe(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  return parseHash(hash);
}

export function navigate(key: RouteKey, param?: string) {
  const next = `#/${key}${param ? `/${encodeURIComponent(param)}` : ''}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export const hrefFor = (key: RouteKey, param?: string) => `#/${key}${param ? `/${encodeURIComponent(param)}` : ''}`;

/** The page each place was last showing, so going back to it returns you there. */
const lastView = new Map<GroupKey, RouteKey>();
export function rememberView(key: RouteKey) {
  const g = groupOf(key);
  if (g) lastView.set(g.key, key);
}

/** Where a place in the top bar leads: the page you were on there, else its first page. */
export function groupTarget(key: GroupKey): RouteKey {
  return lastView.get(key) ?? GROUPS.find((g) => g.key === key)!.views[0];
}
