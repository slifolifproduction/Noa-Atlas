import { describe, expect, it } from 'vitest';
import { backupDue } from './backup';

const at = (iso: string) => new Date(iso);

describe('when to bring up a copy of the atlas', () => {
  it('never for an example, or an atlas of the person’s own with only a note or two', () => {
    expect(backupDue({ since: '2026-01-01T00:00:00Z' }, false, 40, at('2026-06-01'))).toBe(false);
    expect(backupDue({ since: '2026-01-01T00:00:00Z' }, true, 2, at('2026-06-01'))).toBe(false);
  });

  it('a week after it first holds a few notes, when no copy was ever made', () => {
    const r = { since: '2026-10-01T09:00:00Z' };
    expect(backupDue(r, true, 3, at('2026-10-07T09:00:00Z'))).toBe(false);
    expect(backupDue(r, true, 3, at('2026-10-08T09:00:00Z'))).toBe(true);
  });

  it('two weeks after the last copy', () => {
    const r = { since: '2026-01-01T00:00:00Z', at: '2026-10-01T09:00:00Z' };
    expect(backupDue(r, true, 30, at('2026-10-14T09:00:00Z'))).toBe(false);
    expect(backupDue(r, true, 30, at('2026-10-15T09:00:00Z'))).toBe(true);
  });

  it('not while put off', () => {
    const r = { since: '2026-01-01T00:00:00Z', later: '2026-10-10T00:00:00Z' };
    expect(backupDue(r, true, 30, at('2026-10-09T00:00:00Z'))).toBe(false);
    expect(backupDue(r, true, 30, at('2026-10-10T00:00:01Z'))).toBe(true);
  });

  it('not before it has started watching (nothing stamped yet)', () => {
    expect(backupDue({}, true, 30, at('2026-10-10'))).toBe(false);
  });
});
