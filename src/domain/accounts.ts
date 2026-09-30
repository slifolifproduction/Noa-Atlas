/**
 * Other ways to read an outcome: the competing accounts of why it moves.
 *
 * An explanation is never a single answer. For an outcome, the accounts are
 * the claims into it, and, for its strongest explanations, the structural
 * alternatives that would produce the same record:
 *
 *   reverse    it runs the other way: the outcome changes the cause
 *   common     a factor on the map moves both
 *   unnamed    something not on the map moves both (only a deliberate change
 *              rules this out)
 *   through    it works only through a step between them
 *   outside    things that happened to the person from outside
 *   drift      a drift back toward usual after an extreme
 *   artefact   how things were written down (only when notable, afterwards)
 *   remainder  something else, or chance: always open
 *
 * Each has a standing, read from the record, never from anyone's say-so:
 * open, weakened, or set aside by a named observation (a time that fits one
 * and not the other). Absence of a record never sets anything aside. Each
 * also says what would tell it apart: the observation, comparison or small
 * change whose answer differs between the accounts (see `inquiry.ts`).
 *
 * Nothing here is stored: accounts are derived, and a structural alternative
 * becomes a claim only if the person writes it down as one.
 */
import { claimsInto, claimSentence, claimStatus, evidenceProfile, historySource, byStrength } from './claims';
import { backFromExtreme, caseRows, commonCauses, lagWindow, liveClaims } from './compare';
import { EFFECT_META } from './constants';
import { explainOutcome } from './explain';
import { cached, coverage, stateBefore, sourceDate } from './factors';
import { displayNode } from './selectors';
import { scrutinize } from './scrutiny';
import type { HistoryItem } from './history';
import type { AtlasData, Claim, ID, SourceRef } from './types';
import { t, tn } from '../i18n';

export type AccountKind = 'claim' | 'reverse' | 'common' | 'unnamed' | 'through' | 'outside' | 'drift' | 'artefact' | 'remainder';

/** What would tell an account apart from the explanation it competes with. */
export interface Discriminator {
  key: string;
  /** reread what is already written, ask one precise question, track a factor for a while, watch for a natural contrast, or make a small change. */
  kind: 'reread' | 'ask' | 'track' | 'compare' | 'test';
  question: string;
  /** What each answer would mean. */
  ifSo: string;
  ifNot: string;
  /** The answer splits the two readings (decisive), or only narrows them. */
  decisive: boolean;
  claimId?: ID;
  factor?: ID;
  /** Records already in the atlas that may answer it. */
  records?: SourceRef[];
}

export interface Account {
  key: string;
  kind: AccountKind;
  /** The claim it is, or is an alternative to. */
  claimId?: ID;
  /** The other factor it involves: a common cause, a step between. */
  factor?: ID;
  outside?: HistoryItem[];
  standing: 'open' | 'weakened' | 'set_aside';
  /** Why it stands as it does. */
  because: string;
  tell?: Discriminator;
}

export interface AccountSet {
  outcome: ID;
  /** The strongest explanation on the map, whose alternatives are laid out. */
  leading?: Claim;
  accounts: Account[];
  /** Every structural alternative to the leading explanation is set aside by something recorded. */
  distinguished: boolean;
}

const name = (data: AtlasData, id?: ID) => (id ? (displayNode(data, id)?.label ?? t('(deleted)')) : '');

/** The same claim run backwards, to read the record for the other direction. Never stored. */
function reversed(c: Claim): Claim {
  return {
    ...c,
    id: `rev:${c.id}`,
    from: c.to,
    to: c.from,
    with: [],
    effect: EFFECT_META[c.effect].polarity > 0 ? 'raises' : 'lowers',
    condition: undefined,
    scope: undefined,
    rivalIds: [],
    evidence: [],
  };
}

/** The structural alternatives to one explanation: what else would leave the same record. */
export const alternativesOf = (data: AtlasData, c: Claim): Account[] => cached(data, `alternatives:${c.id}`, () => alternatives(data, c));

function alternatives(data: AtlasData, c: Claim): Account[] {
  const a = name(data, c.from);
  const b = name(data, c.to);
  const out: Account[] = [];
  const rows = caseRows(data, c).filter((r) => r.verdict !== 'outside' && !r.hindsight);
  const fits = rows.filter((r) => r.verdict === 'fits');
  const p = evidenceProfile(data, c);
  const ordered = p.episodes;

  // The other way round, unless it is already on the map as a claim of its own.
  if (!liveClaims(data).some((x) => x.from === c.to && x.to === c.from)) {
    const back = caseRows(data, reversed(c)).filter((r) => r.verdict !== 'outside' && !r.hindsight);
    const backFits = back.filter((r) => r.verdict === 'fits').length;
    const backFails = back.filter((r) => r.verdict === 'exception').length;
    // A deliberate change of the cause settles which way it runs (it may still run both ways).
    const tested = p.testsFor > 0;
    const standing = tested ? 'set_aside' : backFits >= 2 ? 'open' : ordered >= 2 && backFails >= 2 ? 'set_aside' : 'open';
    out.push({
      key: `reverse:${c.id}`,
      kind: 'reverse',
      claimId: c.id,
      standing,
      because: tested
        ? t('Changing {a} on purpose moved {b}: it runs from {a} to {b}, whatever else it does.', { a, b })
        : backFits >= 2
          ? tn(backFits, '{b} moved first and {a} followed, once.', '{b} moved first and {a} followed, {n} times.', { a, b })
          : standing === 'set_aside'
            ? tn(backFails, 'When {b} moved first, {a} did not follow ({n} time).', 'When {b} moved first, {a} did not follow ({n} times).', { a, b })
            : t('Nothing recorded yet shows which comes first when they move on their own.'),
      tell: {
        key: `tell:reverse:${c.id}`,
        kind: 'compare',
        question: t('The next time {b} changes on its own, does {a} follow?', { a, b }),
        ifSo: t('It may run the other way too.'),
        ifNot: t('It runs from {a} to {b}.', { a, b }),
        decisive: true,
        claimId: c.id,
        factor: c.to,
      },
    });
  }

  // A factor on the map that moves both.
  for (const cc of commonCauses(data, c)) {
    const told = p.toldApart ?? 0;
    const cn = name(data, cc.factor);
    out.push({
      key: `common:${c.id}:${cc.factor}`,
      kind: 'common',
      claimId: c.id,
      factor: cc.factor,
      standing: told >= 1 ? 'set_aside' : 'open',
      because:
        told >= 1
          ? tn(told, 'Once, {b} followed {a} while {c} was not pushing it.', '{n} times, {b} followed {a} while {c} was not pushing it.', { a, b, c: cn })
          : t('Every time so far, {c} was also pushing {b} that way, or nothing says what it did.', { b, c: cn }),
      tell: {
        key: `tell:common:${c.id}:${cc.factor}`,
        kind: 'compare',
        question: t('A time when {a} moved while {c} stayed as usual: did {b} still follow?', { a, b, c: cn }),
        ifSo: t('{a} does something of its own, apart from {c}.', { a, c: cn }),
        ifNot: t('{c} may be what moves both.', { c: cn }),
        decisive: true,
        claimId: c.id,
        factor: cc.factor,
      },
    });
  }

  // Something not on the map that moves both: only a deliberate change of the cause rules it out.
  const tested = p.testsFor > 0;
  const doable = data.nodes[c.from]?.kind === 'behaviour';
  out.push({
    key: `unnamed:${c.id}`,
    kind: 'unnamed',
    claimId: c.id,
    standing: tested ? 'set_aside' : 'open',
    because: tested
      ? t('A deliberate change of {a} moved {b}: something unrecorded moving both would not do that.', { a, b })
      : t('Everything so far was seen, not changed on purpose: something unrecorded could move both.'),
    tell: {
      key: `tell:unnamed:${c.id}`,
      kind: doable ? 'test' : 'compare',
      question: doable
        ? t('Change {a} on purpose for a while, write down first what should happen to {b}, and compare.', { a, b })
        : t('A time when {a} changed for a reason that has nothing to do with {b}: did {b} follow?', { a, b }),
      ifSo: t('{a} itself moves {b}.', { a, b }),
      ifNot: t('Something else may have been moving both.'),
      decisive: doable,
      claimId: c.id,
      factor: c.from,
    },
  });

  // Only through a step between them.
  const live = liveClaims(data);
  for (const m of live.filter((x) => x.from === c.from && x.to !== c.to && live.some((y) => y.from === x.to && y.to === c.to))) {
    const mid = m.to;
    const mids = fits.map((r) => stateBefore(data, mid, r.outcome.date, lagWindow(c), undefined, true));
    const direct = mids.filter((s) => s && s.lean === 'usual').length;
    const known = mids.filter(Boolean).length;
    const mn = name(data, mid);
    out.push({
      key: `through:${c.id}:${mid}`,
      kind: 'through',
      claimId: c.id,
      factor: mid,
      standing: direct >= 1 ? 'set_aside' : 'open',
      because:
        direct >= 1
          ? tn(
              direct,
              'Once, {b} followed {a} while {m} stayed as usual: not only through it.',
              '{n} times, {b} followed {a} while {m} stayed as usual: not only through it.',
              {
                a,
                b,
                m: mn,
              },
            )
          : known
            ? t('Every time {m} was recorded, it moved too: it may all go through {m}.', { m: mn })
            : t('Nothing recorded says what {m} did at those times.', { m: mn }),
      tell: {
        key: `tell:through:${c.id}:${mid}`,
        kind: 'compare',
        question: t('A time when {a} moved but {m} did not: did {b} still follow?', { a, b, m: mn }),
        ifSo: t('{a} acts on {b} directly as well.', { a, b }),
        ifNot: t('It may work only through {m}.', { m: mn }),
        decisive: true,
        claimId: c.id,
        factor: mid,
      },
    });
  }

  // A drift back toward usual after an extreme.
  const back = backFromExtreme(data, c);
  if (back > 0) {
    const fromUsual = fits.length - back;
    out.push({
      key: `drift:${c.id}`,
      kind: 'drift',
      claimId: c.id,
      standing: fromUsual >= 2 ? 'set_aside' : 'open',
      because:
        fromUsual >= 2
          ? tn(
              fromUsual,
              'Once it moved away from its usual level, not back from an extreme.',
              '{n} times it moved away from its usual level, not back from an extreme.',
            )
          : tn(back, 'Once, {b} moved right after being at its other extreme.', '{n} times, {b} moved right after being at its other extreme.', { b }),
      tell: {
        key: `tell:drift:${c.id}`,
        kind: 'compare',
        question: t('A time when {b} was at its usual level and {a} moved: did {b} follow?', { a, b }),
        ifSo: t('It is more than a drift back toward usual.'),
        ifNot: t('Some of it may be a drift back toward usual.'),
        decisive: false,
        claimId: c.id,
        factor: c.to,
      },
    });
  }

  // How things were written down.
  const s = scrutinize(data, c);
  const untracked = coverage(data, c.to) !== 'tracked';
  if ((p.hindsight ?? 0) > 0 || s.writtenLater > 0 || (untracked && fits.length >= 2)) {
    const late = (p.hindsight ?? 0) + s.writtenLater;
    out.push({
      key: `artefact:${c.id}`,
      kind: 'artefact',
      claimId: c.id,
      standing: 'open',
      because: late
        ? tn(late, 'One supporting time was written down after the outcome was known.', '{n} supporting times were written down after the outcome was known.')
        : t('{b} is written down mostly when it stands out, so quiet times are missing from the record.', { b }),
      tell: {
        key: `tell:artefact:${c.id}`,
        kind: 'track',
        question: t('Note {b} with every note for a few weeks, whether or not it stands out.', { b }),
        ifSo: t('If the pattern still shows, it is not only how things were written down.'),
        ifNot: t('Part of it may have been what got written down.'),
        decisive: false,
        factor: c.to,
      },
    });
  }
  return out;
}

export function accountsFor(data: AtlasData, outcome: ID): AccountSet {
  return cached(data, `accounts:${outcome}`, () => {
    const claims = claimsInto(data, outcome).filter((c) => !c.retired);
    const accounts: Account[] = claims.map((c) => {
      const status = claimStatus(data, c);
      return {
        key: `claim:${c.id}`,
        kind: 'claim' as const,
        claimId: c.id,
        standing: status === 'weakened' ? ('weakened' as const) : ('open' as const),
        because: claimSentence(data, c, status),
      };
    });
    const ranked = [...claims].sort(byStrength(data)).filter((c) => ['plausible', 'supported', 'tested'].includes(claimStatus(data, c)));
    const leading = ranked[0];
    const structural = ranked.slice(0, 2).flatMap((c) => alternativesOf(data, c));
    const ex = explainOutcome(data, outcome);
    if (ex.outside.length)
      structural.push({
        key: `outside:${outcome}`,
        kind: 'outside',
        outside: ex.outside,
        standing: 'open',
        because: tn(ex.outside.length, 'Something happened to you from outside before it moved.', '{n} things happened to you from outside before it moved.'),
        tell: {
          key: `tell:outside:${outcome}`,
          kind: 'compare',
          question: t('A time it moved with nothing like that happening to you first.'),
          ifSo: t('What happened from outside is not the whole of it.'),
          ifNot: t('What happens to you from outside may be much of it.'),
          decisive: false,
          factor: outcome,
          records: ex.outside.map((h) => historySource(h)).filter((r): r is SourceRef => Boolean(r)),
        },
      });
    const remainder = ex.unexplained + ex.unaccounted;
    if (ex.moments > 0)
      structural.push({
        key: `remainder:${outcome}`,
        kind: 'remainder',
        standing: 'open',
        because: remainder
          ? tn(
              remainder,
              'Once, it moved with nothing on the list known to be pushing it first.',
              '{n} times, it moved with nothing on the list known to be pushing it first.',
            )
          : t('Part of anything can be chance, or something not yet on the map.'),
        tell:
          remainder > 0
            ? {
                key: `tell:remainder:${outcome}`,
                kind: 'ask',
                question: t('What else was going on the last time it moved without a known reason?'),
                ifSo: t('Something new to put on the map, and to look for next time.'),
                ifNot: t('It may be chance, or something not noticed yet.'),
                decisive: false,
                factor: outcome,
              }
            : undefined,
      });
    const alternativesOfLeading = leading ? structural.filter((x) => x.claimId === leading.id) : [];
    return {
      outcome,
      leading,
      accounts: [...accounts, ...structural],
      distinguished: alternativesOfLeading.length > 0 && alternativesOfLeading.every((x) => x.standing === 'set_aside'),
    };
  });
}

/** A short name for an account. */
export function accountLabel(data: AtlasData, a: Account): string {
  const c = a.claimId ? data.claims[a.claimId] : undefined;
  const from = name(data, c?.from);
  const to = name(data, c?.to);
  switch (a.kind) {
    case 'claim':
      return c ? claimSentence(data, c) : a.because;
    case 'reverse':
      return t('It runs the other way: {b} changes {a}', { a: from, b: to });
    case 'common':
      return t('{c} moves both {a} and {b}', { a: from, b: to, c: name(data, a.factor) });
    case 'unnamed':
      return t('Something not on the map moves both {a} and {b}', { a: from, b: to });
    case 'through':
      return t('{a} acts only through {m}', { a: from, m: name(data, a.factor) });
    case 'outside':
      return t('What happened to you from outside');
    case 'drift':
      return t('A drift back toward usual');
    case 'artefact':
      return t('How it was written down');
    case 'remainder':
      return t('Something else, or chance');
  }
}

/** The date of a record, for listing. */
export const recordDate = (data: AtlasData, ref: SourceRef) => sourceDate(data, ref);
