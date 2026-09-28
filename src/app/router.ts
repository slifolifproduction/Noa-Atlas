import { useSyncExternalStore } from 'react';
import { SECTIONS, type SectionKey } from '../domain/constants';

export type UtilityKey = 'journal' | 'decisions' | 'questions' | 'settings';
export type RouteKey = SectionKey | UtilityKey;

export interface Route {
  key: RouteKey;
  param?: string;
}

const KEYS = new Set<string>([...SECTIONS.map((s) => s.key), 'journal', 'decisions', 'questions', 'settings']);

export function parseHash(hash: string): Route {
  const [key, param] = hash.replace(/^#\/?/, '').split('/');
  return KEYS.has(key) ? { key: key as RouteKey, param: param ? decodeURIComponent(param) : undefined } : { key: 'orbit' };
}

function subscribe(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return parseHash(hash);
}

export function navigate(key: RouteKey, param?: string) {
  const next = `#/${key}${param ? `/${encodeURIComponent(param)}` : ''}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export const hrefFor = (key: RouteKey, param?: string) => `#/${key}${param ? `/${encodeURIComponent(param)}` : ''}`;
