/**
 * Interface language.
 *
 * Every piece of interface text is written in English in the code and passed
 * through `t()`, which returns the translation for the chosen language (the
 * English text itself is the key, so the code stays readable and a missing
 * translation falls back to English instead of breaking). `{name}` placeholders
 * are filled from `vars`. A unit test checks that every key used in the code
 * has an Indonesian translation.
 *
 * What people write (notes, decisions) is content, not interface, and is
 * never translated. The example atlases are written in both languages and
 * open in the chosen one (data/examples). Text the local analysis generates
 * is written in the language chosen at the moment it is generated.
 */
import { useSyncExternalStore } from 'react';
import { safeLocalStorage, STORAGE_KEYS } from '../persistence/local';

export type Lang = 'en' | 'id';

export const LANGUAGES: { key: Lang; name: string }[] = [
  { key: 'en', name: 'English' },
  { key: 'id', name: 'Bahasa Indonesia' },
];

function initial(): Lang {
  const saved = safeLocalStorage.getItem(STORAGE_KEYS.lang) as string | null;
  if (saved === 'en' || saved === 'id') return saved;
  try {
    return navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = initial();
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = () => lang;

// The Indonesian text is loaded only when it is needed, so English visitors never download it.
let ID: Record<string, string> | null = null;

/** Load the dictionary for a language (resolves at once for English or when already loaded). */
export async function loadLanguage(l: Lang = lang): Promise<void> {
  if (l === 'id' && !ID) ID = (await import('./id')).ID;
}

export async function setLang(next: Lang) {
  if (next === lang) return;
  await loadLanguage(next);
  lang = next;
  safeLocalStorage.setItem(STORAGE_KEYS.lang, next);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The current language; components using it re-render when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Locale for dates and numbers in the current language. */
export const locale = () => (lang === 'id' ? 'id-ID' : 'en-US');

const reported = new Set<string>();

/** The interface text `en` in the current language, with `{placeholders}` filled in. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = en;
  if (lang === 'id' && ID) {
    const tr = ID[en];
    if (tr !== undefined) s = tr;
    else if (import.meta.env?.DEV && !reported.has(en)) {
      reported.add(en);
      console.info('[i18n] no Indonesian yet for:', en);
    }
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Count-aware text: English picks `one` or `other`; `{n}` is the count. */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : other, { n, ...vars });
}
