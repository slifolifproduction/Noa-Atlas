import { describe, expect, it } from 'vitest';
import { forecastRepeat } from './forecast';

describe('when a repeat may come next', () => {
  it('reads the usual gap from the middle half of the gaps so far', () => {
    // Gaps of 7, 7, 8, 6, 30: the one long gap barely moves it.
    const f = forecastRepeat(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-23', '2026-08-29', '2026-09-28'], '2026-10-01')!;
    expect(f.gaps).toBe(5);
    expect(f.usual).toEqual([7, 8]);
    expect(f.median).toBe(7);
    expect(f.last).toBe('2026-09-28');
    expect([f.from, f.to]).toEqual(['2026-10-05', '2026-10-06']);
    expect(f.state).toBe('ahead');
  });

  it('says whether today is inside that window, or past it', () => {
    const dates = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'];
    expect(forecastRepeat(dates, '2026-09-29')?.state).toBe('due');
    expect(forecastRepeat(dates, '2026-10-20')?.state).toBe('late');
  });

  it('says when the gaps vary too much to tell', () => {
    // Gaps of 5, 10, 60, 70: the middle half runs from 9 to 63 days.
    const f = forecastRepeat(['2026-05-01', '2026-05-06', '2026-05-16', '2026-07-15', '2026-09-23'], '2026-10-01')!;
    expect(f.state).toBe('irregular');
  });

  it('says nothing with fewer than three gaps, and counts a day once', () => {
    expect(forecastRepeat(['2026-09-01', '2026-09-08', '2026-09-15'], '2026-10-01')).toBeUndefined();
    expect(forecastRepeat(['2026-09-01', '2026-09-01', '2026-09-08', '2026-09-08', '2026-09-15'], '2026-10-01')).toBeUndefined();
    // Nothing after today counts.
    expect(forecastRepeat(['2026-09-01', '2026-09-08', '2026-09-15', '2026-11-01'], '2026-10-01')).toBeUndefined();
  });
});
