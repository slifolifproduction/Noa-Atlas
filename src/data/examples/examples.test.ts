import { describe, expect, it } from 'vitest';
import { searchKnowledge } from '../../agent/knowledge';
import { areaFor } from '../../agent/local';
import { check } from '../../agent/scope';
import { claimStatus } from '../../domain/claims';
import { contextStates, readingsOf } from '../../domain/history';
import { danglingReferences } from '../../domain/integrity';
import { weekStart } from '../../lib/dates';
import { replaceUntouchedNoa } from '../../persistence/migrate';
import { migrateData } from '../../persistence/storage';
import { createSeedData, isExampleAtlas, isNoaExample } from '../seed';
import { createExample, DEFAULT_EXAMPLE, EXAMPLES, exampleInfo, exampleSpec, exampleUntouched } from './index';
import { exampleShape } from './shape';

const TODAY = '2026-10-02';

describe('the example atlases', () => {
  it('offers seven kinds of work and one student, each a different invented person', () => {
    expect(EXAMPLES.map((e) => e.key)).toEqual(['designer', 'accountant', 'manager', 'director', 'producer', 'data', 'programmer', 'student']);
    expect(new Set(EXAMPLES.map((e) => e.name)).size).toBe(EXAMPLES.length);
    expect(exampleInfo(DEFAULT_EXAMPLE)?.key).toBe('designer');
  });

  for (const ex of EXAMPLES)
    for (const lang of ['id', 'en'] as const) {
      describe(`${ex.identity} (${ex.name}), ${lang}`, () => {
        const d = createExample(ex.key, TODAY, lang);

        it('is whole, and known as an example', () => {
          expect(danglingReferences(d)).toEqual([]);
          expect(d.profile).toMatchObject({ name: ex.name, example: ex.key, exampleLang: lang });
          expect(isExampleAtlas(d)).toBe(true);
          expect(isNoaExample(d)).toBe(false);
        });

        it('fills every lens', () => {
          expect(Object.keys(d.nodes).length).toBeGreaterThanOrEqual(20);
          expect(Object.keys(d.entries).length).toBeGreaterThanOrEqual(12);
          expect(Object.keys(d.occurrences).length).toBeGreaterThanOrEqual(8);
          expect(Object.keys(d.decisions).length).toBeGreaterThanOrEqual(2);
          expect(Object.keys(d.patterns).length).toBeGreaterThanOrEqual(2);
          expect(Object.keys(d.paths)).toHaveLength(3);
          expect(d.quests?.own?.targets.length).toBeGreaterThan(0);
          // Every note carries the reading a new note gets.
          expect(Object.values(d.entries).every((e) => e.analysis)).toBe(true);
        });

        it('holds its reasons at different degrees of sureness, derived from what was recorded', () => {
          const statuses = Object.values(d.claims).map((c) => claimStatus(d, c));
          expect(statuses).toContain('supported');
          expect(statuses).toContain('proposed');
          expect(new Set(statuses).size).toBeGreaterThanOrEqual(3);
        });

        it('is dated up to this week, with the next step of its plan in it', () => {
          const nav = d.navigation!;
          const current = nav.actions.find((a) => a.id === nav.currentActionId);
          expect(current?.status).toBe('todo');
          expect(current?.week).toBe(weekStart(TODAY));
          const last = Object.values(d.entries)
            .map((e) => e.date)
            .sort()
            .at(-1)!;
          expect(
            last <= TODAY &&
              last >=
                weekStart(TODAY)
                  .replace(/-\d\d$/, '-01')
                  .slice(0, 7),
          ).toBe(true);
        });
      });
    }

  it('moves with the calendar', () => {
    const later = createExample('student', '2027-03-10');
    expect(later.navigation?.actions.find((a) => a.id === later.navigation?.currentActionId)?.week).toBe(weekStart('2027-03-10'));
  });
});

describe('the examples in two languages', () => {
  const INDONESIAN = /\b(yang|dan|tidak|aku|untuk|dengan|minggu|karena)\b/i;
  for (const ex of EXAMPLES) {
    it(`${ex.identity}: the same story in English and Indonesian`, () => {
      const [id, en] = [exampleSpec(ex.key, 'id'), exampleSpec(ex.key, 'en')];
      expect(exampleShape(en)).toEqual(exampleShape(id));
      // The words really are English in the one, Indonesian in the other.
      expect(en.notes.filter((n) => INDONESIAN.test(`${n.title} ${n.text}`)).map((n) => n.n)).toEqual([]);
      expect(id.notes.filter((n) => INDONESIAN.test(n.text)).length).toBeGreaterThan(10);
      // So every reason reaches the same status, and every repeat the same regularity.
      const [a, b] = [createExample(ex.key, TODAY, 'id'), createExample(ex.key, TODAY, 'en')];
      for (const c of Object.values(a.claims)) expect(claimStatus(b, b.claims[c.id]), `${ex.key} ${c.id}`).toBe(claimStatus(a, c));
    });
  }

  it('knows an example as it was opened from one the person changed', () => {
    const d = createExample('accountant', TODAY, 'en');
    expect(exampleUntouched(d)).toBe(true);
    // Opened weeks ago and never touched: still untouched, its dates are those of the week it was opened.
    expect(exampleUntouched(createExample('student', '2026-08-12', 'id'))).toBe(true);
    // Read back from storage.
    expect(exampleUntouched(JSON.parse(JSON.stringify(d)))).toBe(true);

    const ticked = structuredClone(d);
    ticked.navigation!.actions.find((a) => a.id === 'a05')!.status = 'done';
    expect(exampleUntouched(ticked)).toBe(false);
    const wrote = structuredClone(d);
    wrote.entries.mine = { ...wrote.entries.ent_14, id: 'mine', seq: 15 };
    expect(exampleUntouched(wrote)).toBe(false);
    const dismissed = structuredClone(d);
    const pending = Object.values(dismissed.entries)
      .flatMap((e) => e.analysis?.suggestions ?? [])
      .find((x) => x.state === 'pending');
    if (pending) {
      pending.state = 'dismissed';
      expect(exampleUntouched(dismissed)).toBe(false);
    }
    expect(exampleUntouched(createSeedData(TODAY))).toBe(false);
  });
});

describe('Noa’s example, from before', () => {
  it('gives way to the first new example when nothing was written in it', () => {
    const replaced = replaceUntouchedNoa(createSeedData(TODAY));
    expect(replaced.profile.example).toBe(DEFAULT_EXAMPLE);
    const stored = migrateData({ data: createSeedData(TODAY) }, 5) as { data: { profile: { example?: string } } };
    expect(stored.data.profile.example).toBe(DEFAULT_EXAMPLE);
  });

  it('stays as it is once the person wrote in it, and is still an example', () => {
    const noa = createSeedData(TODAY);
    noa.entries.mine = { ...noa.entries.ent_01, id: 'mine', seq: 99 };
    expect(replaceUntouchedNoa(noa)).toBe(noa);
    expect(isExampleAtlas(noa)).toBe(true);
  });

  it('leaves an atlas of the person’s own alone', () => {
    const own = createExample('designer', TODAY);
    delete own.profile.example;
    own.profile.name = 'Sari';
    expect(isExampleAtlas(own)).toBe(false);
    expect(replaceUntouchedNoa(own)).toBe(own);
  });
});

describe('the agent knows the kinds of work', () => {
  it('finds how the Atlas serves each one', () => {
    const first = (q: string) => searchKnowledge(q)[0]?.key;
    expect(first('Bagaimana atlas membantu akuntan saat closing?')).toBe('identity:accountant');
    expect(first('Aku mahasiswa, gimana atlas bisa bantu kuliah dan ujian?')).toBe('identity:student');
    expect(first('programmer yang sering deploy dan bug')).toBe('identity:programmer');
    expect(first('Saya desainer UI, revisi terus dari klien')).toBe('identity:designer');
    expect(first('atlas untuk manajer tim')).toBe('identity:manager');
    expect(first('pemilik usaha dan direktur perusahaan')).toBe('identity:director');
    expect(first('produser event dan vendor')).toBe('identity:producer');
    expect(first('data scientist model churn')).toBe('identity:data');
    expect(first('contoh atlas ada apa saja?')).toBe('examples');
    // Where the atlas is kept is still its own answer.
    expect(first('Data saya disimpan di mana?')).toBe('data');
  });

  it('answers about them, and still turns away work it is not for', () => {
    expect(check('Bagaimana atlas membantu seorang desainer?').ok).toBe(true);
    expect(check('Aku programmer, gimana atlas bisa bantu?').ok).toBe(true);
    expect(check('Tolong buatkan kode python untuk sorting')).toEqual({ ok: false, why: 'offtopic' });
  });

  it('places what people in these kinds of work write in the right area', () => {
    expect(areaFor('behaviour', 'Rekonsiliasi harian')).toBe('work');
    expect(areaFor('state', 'Nilai kuis')).toBe('growth');
    expect(areaFor('commitment', 'Festival musik Oktober')).toBe('projects');
    expect(areaFor('state', 'Arus kas')).toBe('money');
    expect(areaFor('behaviour', 'Rilis di hari Jumat')).toBe('work');
  });
});

describe('what the notes record', () => {
  it('reads the energy written with each note as a state on the Map, so Time can draw it', () => {
    for (const ex of EXAMPLES) {
      const d = createExample(ex.key, TODAY);
      const id = contextStates(d).energy;
      expect(id, ex.key).toBeTruthy();
      expect(readingsOf(d, id!).length, ex.key).toBeGreaterThanOrEqual(12);
    }
  });
});
