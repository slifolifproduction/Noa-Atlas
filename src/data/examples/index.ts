/**
 * The example atlases a person can learn from: seven kinds of work and one student, each an invented person with
 * about five months of records, written in Indonesian and in English. Which one is open, and in which language, is
 * kept on the atlas itself (profile.example, profile.exampleLang).
 */
import type { AtlasData } from '../../domain/types';
import { getLang, type Lang } from '../../i18n';
import { addDays, daysBetween } from '../../lib/dates';
import { accountant } from './accountant';
import { ANCHOR_WEEK, buildExample, type ExampleKey, type ExampleSpec } from './build';
import { data } from './data';
import { designer } from './designer';
import { director } from './director';
import * as en from './en';
import { manager } from './manager';
import { producer } from './producer';
import { programmer } from './programmer';
import { student } from './student';

export type { ExampleKey } from './build';

export interface ExampleInfo {
  key: ExampleKey;
  /** The kind of work, as a short label (English source, translated by t()). */
  identity: string;
  /** The invented person. */
  name: string;
  /** One line about their life, for the chooser (English source, translated by t()). */
  blurb: string;
}

const SPECS: Record<Lang, Record<ExampleKey, ExampleSpec>> = {
  id: { designer, accountant, manager, director, producer, data, programmer, student },
  en: { ...en },
};

/** An example's words in each language, for checks. */
export const exampleSpec = (key: ExampleKey, lang: Lang): ExampleSpec => SPECS[lang][key];

/** In the order they are offered. */
export const EXAMPLES: ExampleInfo[] = [
  { key: 'designer', identity: 'Designer', name: designer.name, blurb: 'UI/UX designer at a fintech startup, freelancing on weekends.' },
  { key: 'accountant', identity: 'Accountant', name: accountant.name, blurb: 'Senior accountant at a distributor, studying for the CPA exam.' },
  { key: 'manager', identity: 'Manager', name: manager.name, blurb: 'Warehouse operations manager, leading 40 people.' },
  { key: 'director', identity: 'Director', name: director.name, blurb: 'Managing director of a family furniture exporter.' },
  { key: 'producer', identity: 'Producer', name: producer.name, blurb: 'Concert and event producer at an event organiser.' },
  { key: 'data', identity: 'Data scientist', name: data.name, blurb: 'Data scientist at an e-commerce company, building a churn model.' },
  { key: 'programmer', identity: 'Programmer', name: programmer.name, blurb: 'Backend developer at a logistics startup.' },
  { key: 'student', identity: 'Student', name: student.name, blurb: 'Informatics student, working part-time as a barista.' },
];

/** The example a new visitor sees first. */
export const DEFAULT_EXAMPLE: ExampleKey = 'designer';

export const isExampleKey = (key: unknown): key is ExampleKey => typeof key === 'string' && Object.hasOwn(SPECS.id, key);

export const exampleInfo = (key: string | undefined): ExampleInfo | undefined => EXAMPLES.find((e) => e.key === key);

/** An example built into a full atlas whose dates end in the week of `today`, in the interface language unless told. */
export const createExample = (key: ExampleKey = DEFAULT_EXAMPLE, today?: string, lang: Lang = getLang()): AtlasData =>
  buildExample(SPECS[lang][key], today, lang);

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
  const spec = SPECS[lang][key];
  const first = d.entries?.ent_01?.date;
  const written1 = spec.notes.find((n) => n.n === 1)?.date;
  if (!first || !written1) return false;
  // Built in the same week it was opened in, the same example must read the same.
  const fresh = buildExample(spec, addDays(ANCHOR_WEEK, daysBetween(written1, first)), lang);
  return written(fresh) === written(d);
}
