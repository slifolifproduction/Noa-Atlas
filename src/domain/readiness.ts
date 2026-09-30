/**
 * Readiness for a formal comparison.
 *
 * Personal records are small, uneven and written by the person they are
 * about. A formal method (a within-person comparison, an alternating test,
 * a before-and-after around a change) can say more than counting episodes,
 * but only when the record can bear it; run too early, it produces numbers
 * that look certain and are not. So a method may run on a claim only when
 * every one of these holds:
 *
 *   episodes   enough separate episodes compared (twelve)
 *   variation  the cause recorded both ways, several times each
 *   sampling   both ends recorded regularly, not only when notable
 *   timing     exact dates, and orders written down as they happened
 *   overlap    each known common cause seen apart from the cause
 *   window     the delay stated in advance, not chosen after looking
 *
 * Its result would enter as evidence of the kind "analysis", with its method
 * and assumptions, into the same ladder: it can make a claim surer, never
 * "tested", which only a deliberate change can. No method runs in this
 * version; the checks say how far the record is from one.
 */
import { caseRows, commonCauses } from './compare';
import { evidenceProfile } from './claims';
import { coverage } from './factors';
import { displayNode } from './selectors';
import type { AtlasData, Claim } from './types';
import { t } from '../i18n';

export type ReadinessKey = 'episodes' | 'variation' | 'sampling' | 'timing' | 'overlap' | 'window';

export interface ReadinessCheck {
  key: ReadinessKey;
  ok: boolean;
  says: string;
}

export interface Readiness {
  ready: boolean;
  checks: ReadinessCheck[];
}

const EPISODES = 12;
const EACH_WAY = 4;

export function readiness(data: AtlasData, claim: Claim): Readiness {
  const rows = caseRows(data, claim).filter((r) => r.verdict !== 'outside');
  const episodes = new Set(rows.map((r) => r.episode)).size;
  const more = rows.filter((r) => r.causeLean === 'more').length;
  const less = rows.filter((r) => r.causeLean === 'less').length;
  const tracked = coverage(data, claim.from) === 'tracked' && coverage(data, claim.to) === 'tracked';
  const approx = rows.filter((r) => r.outcome.item?.approx || r.cause.item?.approx).length;
  const hindsight = rows.filter((r) => r.hindsight).length;
  const commons = commonCauses(data, claim);
  const told = evidenceProfile(data, claim).toldApart ?? 0;
  const name = (id: string) => displayNode(data, id)?.label ?? '';
  const checks: ReadinessCheck[] = [
    {
      key: 'episodes',
      ok: episodes >= EPISODES,
      says: t('{n} of {m} separate episodes compared.', { n: episodes, m: EPISODES }),
    },
    {
      key: 'variation',
      ok: more >= EACH_WAY && less >= EACH_WAY,
      says: t('The cause recorded high {a} times and low {b} times (needs {n} each).', { a: more, b: less, n: EACH_WAY }),
    },
    {
      key: 'sampling',
      ok: tracked,
      says: tracked ? t('Both recorded regularly.') : t('{a} and {b} are not both recorded regularly.', { a: name(claim.from), b: name(claim.to) }),
    },
    {
      key: 'timing',
      ok: approx === 0 && hindsight * 10 <= rows.length,
      says:
        approx || hindsight
          ? t('{a} times with an approximate date, {b} written down after the outcome was known.', { a: approx, b: hindsight })
          : t('Exact dates, written down as they happened.'),
    },
    {
      key: 'overlap',
      ok: !commons.length || told >= 2,
      says: commons.length
        ? t('Seen apart from {c} {n} times (needs 2).', { c: commons.map((c) => name(c.factor)).join(', '), n: told })
        : t('No known common cause to separate it from.'),
    },
    {
      key: 'window',
      ok: Boolean(claim.lag?.trim()),
      says: claim.lag?.trim() ? t('The delay was stated: {lag}.', { lag: claim.lag }) : t('No delay stated in advance.'),
    },
  ];
  return { ready: checks.every((c) => c.ok), checks };
}
