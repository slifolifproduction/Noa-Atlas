/**
 * The example atlases a person can learn from: seven kinds of work and one student, each an invented person with
 * about five months of records, written in Indonesian and in English. Which one is open, and in which language, is
 * kept on the atlas itself (profile.example, profile.exampleLang).
 *
 * Only the first example (the designer, in both languages) comes with the app: the store opens on it before anything
 * else can be fetched. The other fourteen are fetched when one is opened (`loadExample`), so a visitor downloads one
 * example, not sixteen.
 */
import type { AtlasData } from '../../domain/types';
import { getLang, type Lang } from '../../i18n';
import { addDays, daysBetween } from '../../lib/dates';
import { ANCHOR_WEEK, buildExample, type ExampleKey, type ExampleSpec } from './build';
import { designer } from './designer';
import { designer as designerEn } from './en/designer';

export type { ExampleKey } from './build';

export interface ExampleInfo {
  key: ExampleKey;
  /** The kind of work, as a short label (English source, translated by t()). */
  identity: string;
  /** The invented person (the same in both languages; examples.test.ts checks it against the example itself). */
  name: string;
  /** One line about their life, for the chooser (English source, translated by t()). */
  blurb: string;
}

/** In the order they are offered. */
export const EXAMPLES: ExampleInfo[] = [
  { key: 'designer', identity: 'Designer', name: 'Emma Collins', blurb: 'UI/UX designer at a fintech startup, freelancing on weekends.' },
  { key: 'accountant', identity: 'Accountant', name: 'Daniel Reed', blurb: 'Senior accountant at a distributor, studying for the CPA exam.' },
  { key: 'manager', identity: 'Manager', name: 'Ryan Mitchell', blurb: 'Warehouse operations manager, leading 40 people.' },
  { key: 'director', identity: 'Director', name: 'Maya Bennett', blurb: 'Managing director of a family furniture exporter.' },
  { key: 'producer', identity: 'Producer', name: 'Leo Carter', blurb: 'Concert and event producer at an event organiser.' },
  { key: 'data', identity: 'Data scientist', name: 'Kevin Moore', blurb: 'Data scientist at an e-commerce company, building a churn model.' },
  { key: 'programmer', identity: 'Programmer', name: 'Adam Foster', blurb: 'Backend developer at a logistics startup.' },
  { key: 'student', identity: 'Student', name: 'Sofia Martin', blurb: 'Informatics student, working part-time as a barista.' },
];

/** The example a new visitor sees first. */
export const DEFAULT_EXAMPLE: ExampleKey = 'designer';

/** Each example's words, fetched once when first needed (each is its own small file in the build). */
const LOAD: Record<Lang, Record<ExampleKey, () => Promise<ExampleSpec>>> = {
  id: {
    designer: async () => designer,
    accountant: () => import('./accountant').then((m) => m.accountant),
    manager: () => import('./manager').then((m) => m.manager),
    director: () => import('./director').then((m) => m.director),
    producer: () => import('./producer').then((m) => m.producer),
    data: () => import('./data').then((m) => m.data),
    programmer: () => import('./programmer').then((m) => m.programmer),
    student: () => import('./student').then((m) => m.student),
  },
  en: {
    designer: async () => designerEn,
    accountant: () => import('./en/accountant').then((m) => m.accountant),
    manager: () => import('./en/manager').then((m) => m.manager),
    director: () => import('./en/director').then((m) => m.director),
    producer: () => import('./en/producer').then((m) => m.producer),
    data: () => import('./en/data').then((m) => m.data),
    programmer: () => import('./en/programmer').then((m) => m.programmer),
    student: () => import('./en/student').then((m) => m.student),
  },
};

const loaded = new Map<string, ExampleSpec>([
  [`id:${DEFAULT_EXAMPLE}`, designer],
  [`en:${DEFAULT_EXAMPLE}`, designerEn],
]);

export const isExampleKey = (key: unknown): key is ExampleKey => typeof key === 'string' && Object.hasOwn(LOAD.id, key);

/** Whether an example's words in a language are here already (so it can be built at once). */
export const exampleLoaded = (key: ExampleKey, lang: Lang) => loaded.has(`${lang}:${key}`);

/** Fetch an example's words in a language, once. */
export async function loadExample(key: ExampleKey, lang: Lang): Promise<ExampleSpec> {
  const have = loaded.get(`${lang}:${key}`);
  if (have) return have;
  const spec = await LOAD[lang][key]();
  loaded.set(`${lang}:${key}`, spec);
  return spec;
}

/** An example's words in a language; it must have been fetched (`loadExample`). */
export function exampleSpec(key: ExampleKey, lang: Lang): ExampleSpec {
  const spec = loaded.get(`${lang}:${key}`);
  if (!spec) throw new Error(`The ${key} example in ${lang} has not been fetched yet (loadExample first).`);
  return spec;
}

export const exampleInfo = (key: string | undefined): ExampleInfo | undefined => EXAMPLES.find((e) => e.key === key);

/**
 * An example built into a full atlas whose dates end in the week of `today`, in the interface language unless told.
 * Its words must have been fetched (`loadExample`); the first example's always are.
 */
export const createExample = (key: ExampleKey = DEFAULT_EXAMPLE, today?: string, lang: Lang = getLang()): AtlasData =>
  buildExample(exampleSpec(key, lang), today, lang);

/** The language an example atlas is written in (the first examples, before English, were Indonesian only). */
export const exampleLangOf = (data: Pick<AtlasData, 'profile'>): Lang => data.profile?.exampleLang ?? 'id';

/** What the person can add, change or take back in an atlas, without what is generated or recomputed. */
const PARTS = [
  'areas',
  'nodes',
  'edges',
  'claims',
  'occurrences',
  'decisions',
  'patterns',
  'paths',
  'experiments',
  'currentState',
  'navigation',
  'quests',
  'loopNames',
] as const;
const written = (d: AtlasData) =>
  JSON.stringify([
    PARTS.map((k) => d[k] ?? null),
    // A note's reading is generated (with fresh ids); only what was decided about its suggestions is the person's.
    Object.values(d.entries).map(({ analysis, ...e }) => ({ ...e, suggestions: analysis?.suggestions.map((s) => s.state) })),
  ]);

/**
 * Whether an example atlas is still exactly as it was opened: nothing added, changed, ticked off or taken back.
 * Such an atlas can be reopened in another language without losing anything.
 */
export function exampleUntouched(d: AtlasData): boolean {
  const key = d.profile?.example;
  if (!isExampleKey(key)) return false;
  const lang = exampleLangOf(d);
  // Not fetched, it cannot be compared: read as changed, so nothing is reopened over it.
  if (!exampleLoaded(key, lang)) return false;
  const spec = exampleSpec(key, lang);
  const first = d.entries?.ent_01?.date;
  const written1 = spec.notes.find((n) => n.n === 1)?.date;
  if (!first || !written1) return false;
  // Built in the same week it was opened in, the same example must read the same.
  const fresh = buildExample(spec, addDays(ANCHOR_WEEK, daysBetween(written1, first)), lang);
  return written(fresh) === written(d);
}
