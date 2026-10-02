/**
 * The example atlases a person can learn from: seven kinds of work and one student, each an invented person with
 * about five months of records. Which one is open is kept on the atlas itself (profile.example).
 */
import type { AtlasData } from '../../domain/types';
import { accountant } from './accountant';
import { buildExample, type ExampleKey, type ExampleSpec } from './build';
import { data } from './data';
import { designer } from './designer';
import { director } from './director';
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

const SPECS: Record<ExampleKey, ExampleSpec> = { designer, accountant, manager, director, producer, data, programmer, student };

/** In the order they are offered. */
export const EXAMPLES: ExampleInfo[] = [
  { key: 'designer', identity: 'Designer', name: designer.name, blurb: 'UI/UX designer at a fintech in Jakarta, freelancing on weekends.' },
  { key: 'accountant', identity: 'Accountant', name: accountant.name, blurb: 'Senior accountant in Surabaya, studying for the CPA exam.' },
  { key: 'manager', identity: 'Manager', name: manager.name, blurb: 'Warehouse operations manager in Cikarang, leading 40 people.' },
  { key: 'director', identity: 'Director', name: director.name, blurb: 'Managing director of a family furniture exporter in Jepara.' },
  { key: 'producer', identity: 'Producer', name: producer.name, blurb: 'Concert and event producer at an event organiser in Jakarta.' },
  { key: 'data', identity: 'Data scientist', name: data.name, blurb: 'Data scientist at an e-commerce company, building a churn model.' },
  { key: 'programmer', identity: 'Programmer', name: programmer.name, blurb: 'Backend developer at a logistics startup in Bandung.' },
  { key: 'student', identity: 'Student', name: student.name, blurb: 'Informatics student in Yogyakarta, working part-time as a barista.' },
];

/** The example a new visitor sees first. */
export const DEFAULT_EXAMPLE: ExampleKey = 'designer';

export const isExampleKey = (key: unknown): key is ExampleKey => typeof key === 'string' && key in SPECS;

export const exampleInfo = (key: string | undefined): ExampleInfo | undefined => EXAMPLES.find((e) => e.key === key);

/** An example built into a full atlas whose dates end in the week of `today`. */
export const createExample = (key: ExampleKey = DEFAULT_EXAMPLE, today?: string): AtlasData => buildExample(SPECS[key], today);
