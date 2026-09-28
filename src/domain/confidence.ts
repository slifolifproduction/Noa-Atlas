import type { Evidence, ISODate } from './types';

/**
 * Pattern confidence is derived from evidence, never typed in.
 *
 *   confidence = (supporting weight + 2) / (total weight + 4)
 *
 * A Beta(2, 2) prior: an unobserved pattern sits at 50%, and it takes several
 * consistent observations to move far from it. Entries and decisions weigh 1;
 * completed experiments weigh 2 because they were designed to test the claim.
 * This is a measure of how consistently the data points one way — not the
 * probability that a psychological claim is true.
 */
export const PRIOR = 2;

export function computeConfidence(evidence: Pick<Evidence, 'stance' | 'weight'>[]): number {
  let support = 0;
  let total = 0;
  for (const e of evidence) {
    total += e.weight;
    if (e.stance === 'supports') support += e.weight;
  }
  return (support + PRIOR) / (total + PRIOR * 2);
}

export type ConfidenceBand = 'weak' | 'tentative' | 'moderate' | 'strong';

export function confidenceBand(value: number): ConfidenceBand {
  if (value < 0.5) return 'weak';
  if (value < 0.62) return 'tentative';
  if (value < 0.76) return 'moderate';
  return 'strong';
}

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  weak: 'Weak signal',
  tentative: 'Tentative',
  moderate: 'Moderate',
  strong: 'Consistent',
};

export const CONFIDENCE_EXPLAINER =
  'Confidence = (supporting + 2) ÷ (all evidence + 4). It starts at 50% and moves only as evidence accumulates; experiment results count double. It measures how consistently your data points one way — not whether a claim about you is true.';

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Confidence after each piece of evidence, in date order. */
export function confidenceHistory(
  evidence: Evidence[],
  dateOf: (e: Evidence) => ISODate | undefined,
): { date: ISODate; value: number; evidenceId: string }[] {
  const dated = evidence
    .map((e) => ({ e, date: dateOf(e) }))
    .filter((x): x is { e: Evidence; date: ISODate } => Boolean(x.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const seen: Evidence[] = [];
  return dated.map(({ e, date }) => {
    seen.push(e);
    return { date, value: computeConfidence(seen), evidenceId: e.id };
  });
}
