/**
 * Answers to the questions a person asks about one thing in their atlas:
 * what has been happening, why it might be happening, what usually comes
 * before or after, whether it has happened before, and what might change if
 * it did. The analytical work (claims, evidence, history windows, patterns)
 * happens here; the interface only shows the answers, in plain words.
 */
import { addDays, formatMonth, todayISO } from '../lib/dates';
import { t, tn } from '../i18n';
import { byStrength, claimsInto, claimsOutOf, claimStatus, evidenceEpisode, evidenceProfile } from './claims';
import { commonCauses, rivalsOf } from './compare';
import { AREA_META, areaHubId, isAreaHubId, areaHubKey, YOU_ID } from './constants';
import { historyItems } from './history';
import { mapElements, patternsForNode, patternStats, patternTitle, thinSpots } from './selectors';
import type { AreaKey, AtlasData, AtlasNode, Claim, ElementKind, EntityRef, ID, ISODate, Pattern } from './types';

/* ---------------- the focus ---------------- */

/** The id a graph uses for the focus: the element itself, an area's marker, or you at the centre. */
export function focusGraphId(ref: EntityRef | null | undefined): ID | undefined {
  if (!ref) return undefined;
  if (ref.kind === 'area') return ref.id === 'self' ? YOU_ID : areaHubId(ref.id as AreaKey);
  if (ref.kind === 'node') return ref.id;
  return undefined;
}

/** The focus back from a graph id. */
export function focusFromGraphId(id: ID): EntityRef {
  if (id === YOU_ID) return { kind: 'area', id: 'self' };
  if (isAreaHubId(id)) return { kind: 'area', id: areaHubKey(id) };
  return { kind: 'node', id };
}

export function focusLabel(data: AtlasData, ref: EntityRef): string {
  if (ref.kind === 'area') return AREA_META[ref.id as AreaKey]?.label ?? '';
  return data.nodes[ref.id]?.label ?? '';
}

/** The elements a focus stands for: the element itself, or everything in an area. */
export function focusElements(data: AtlasData, ref: EntityRef): ID[] {
  if (ref.kind === 'node') return data.nodes[ref.id] ? [ref.id] : [];
  if (ref.kind === 'area')
    return mapElements(data)
      .filter((n) => n.area === ref.id)
      .map((n) => n.id);
  return [];
}

/* ---------------- what the map shows at rest ---------------- */

/** How often each element came up in notes and happenings in the last `days` days. */
function recentMentions(data: AtlasData, today: ISODate, days: number): Map<ID, number> {
  const from = addDays(today, -days);
  const counts = new Map<ID, number>();
  const add = (id: ID) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const e of Object.values(data.entries)) if (e.date >= from && e.date <= today) e.nodeIds.forEach(add);
  for (const o of Object.values(data.occurrences))
    if (o.mode === 'actual' && o.date >= from && o.date <= today) [...o.about, ...(o.instanceOf ? [o.instanceOf] : [])].forEach(add);
  return counts;
}

/** The few things worth naming on the map without being asked: what you care about, and what moved lately. */
export function salientIds(data: AtlasData, today: ISODate = todayISO()): Set<ID> {
  const elements = mapElements(data);
  const out = new Set<ID>(elements.filter((n) => n.concern).map((n) => n.id));
  const recent = [...recentMentions(data, today, 21).entries()]
    .filter(([id]) => data.nodes[id]?.adopted)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  for (const [id] of recent) out.add(id);
  return out;
}

export interface Noticed {
  key: string;
  ref: EntityRef;
  title: string;
  line: string;
}

const since = (d?: ISODate) => (d ? formatMonth(d) : '');

/**
 * Something to look at: what you care about and what is moving, then where
 * the map is quiet. The first one is the gentle suggestion on the map.
 */
export function noticeables(data: AtlasData, today: ISODate = todayISO()): Noticed[] {
  const out: Noticed[] = [];
  const recent = recentMentions(data, today, 30);
  const concerns = mapElements(data)
    .filter((n) => n.concern)
    .sort((a, b) => (recent.get(b.id) ?? 0) - (recent.get(a.id) ?? 0));
  for (const n of concerns) {
    const repeat = strongestPattern(data, n.id);
    const count = recent.get(n.id) ?? 0;
    const line = !claimsInto(data, n.id).length
      ? t('You care about this, and nothing explains it yet.')
      : repeat && repeat.stats.instances >= 3
        ? t('Something like this has happened {n} times since {month}.', { n: repeat.stats.instances, month: since(repeat.stats.firstObserved) })
        : count
          ? tn(count, 'It came up in {n} note this month.', 'It came up in {n} notes this month.')
          : t('Something you want explained or changed.');
    out.push({ key: `c:${n.id}`, ref: { kind: 'node', id: n.id }, title: n.label, line });
  }
  const thin = thinSpots(data, today);
  for (const k of thin.quietAreas)
    out.push({ key: `q:${k}`, ref: { kind: 'area', id: k }, title: AREA_META[k].label, line: t('Nothing written about it for two months.') });
  for (const n of thin.untestedBeliefs.slice(0, 2))
    out.push({ key: `b:${n.id}`, ref: { kind: 'node', id: n.id }, title: n.label, line: t('Something you believe that your notes have never checked.') });
  return out;
}

/* ---------------- 1 · what's been happening ---------------- */

/** Happenings, decisions, notes and tests about the focus, newest first. */
export function momentsOf(data: AtlasData, ref: EntityRef) {
  const ids = new Set(focusElements(data, ref));
  const area = ref.kind === 'area' ? (ref.id as AreaKey) : undefined;
  return historyItems(data, { records: true }).filter((h) => {
    if (h.about.some((a) => ids.has(a)) || (h.instanceOf && ids.has(h.instanceOf))) return true;
    if (!area) return false;
    if (h.ref.kind === 'entry') return data.entries[h.ref.id]?.areas.includes(area) ?? false;
    if (h.ref.kind === 'decision') return data.decisions[h.ref.id]?.areas.includes(area) ?? false;
    return false;
  });
}

/* ---------------- 2 · why might this be happening ---------------- */

/** Possible reasons for something, strongest first, including the analysis's proposals (marked). */
export function reasonsFor(data: AtlasData, id: ID): Claim[] {
  const suggested = Object.values(data.claims).filter((c) => c.state === 'suggested' && c.to === id && data.nodes[c.from]?.adopted);
  return [...claimsInto(data, id), ...suggested.sort(byStrength(data))];
}

/**
 * The weeks behind a claim that are also part of a repeat (a pattern whose
 * steps include both ends): the same episodes read two ways, never two
 * independent confirmations.
 */
export function sharedWithRepeats(data: AtlasData, claim: Claim): { pattern: Pattern; weeks: number }[] {
  const claimEpisodes = new Set(
    claim.evidence.filter((e) => e.stance === 'supports' && (e.kind === 'instance' || e.kind === 'contrast' || !e.kind)).map((e) => evidenceEpisode(data, e)),
  );
  if (!claimEpisodes.size) return [];
  const ends = [claim.from, ...claim.with, claim.to];
  return Object.values(data.patterns)
    .filter((p) => !p.setAside && ends.every((id) => id === claim.to || p.nodeIds.includes(id) || p.steps.some((s) => s.elementId === id)))
    .filter((p) => p.nodeIds.includes(claim.to) || p.steps.some((s) => s.elementId === claim.to))
    .map((pattern) => {
      const theirs = new Set(pattern.evidence.filter((e) => e.stance === 'supports').map((e) => evidenceEpisode(data, e)));
      return { pattern, weeks: [...claimEpisodes].filter((w) => theirs.has(w)).length };
    })
    .filter((x) => x.weeks > 0);
}

/**
 * "Why do you think that?", answered in plain sentences from the evidence
 * behind a claim. What does not count is said too: the outcome happening
 * without it, and a "how" that is only described.
 */
export function whyWeThink(data: AtlasData, claim: Claim): string[] {
  const p = evidenceProfile(data, claim);
  const out: string[] = [];
  const name = (id: ID) => data.nodes[id]?.label ?? '';
  if (p.testsFor) out.push(t('You tested it, and what you predicted happened.'));
  if (p.testsAgainst) out.push(tn(p.testsAgainst, 'A test did not go as predicted.', '{n} tests did not go as predicted.'));
  if (p.predictionsHeld) out.push(tn(p.predictionsHeld, 'A prediction you wrote down from it held.', '{n} predictions you wrote down from it held.'));
  if (p.predictionsFailed)
    out.push(tn(p.predictionsFailed, 'A prediction you wrote down from it did not hold.', '{n} predictions you wrote down from it did not hold.'));
  if (p.episodes) out.push(tn(p.episodes, 'Seen in {n} separate episode, in that order.', 'Seen in {n} separate episodes, in that order.'));
  const recorded = (p.fromRecord?.fits ?? 0) + (p.fromRecord?.contrast ?? 0);
  if (recorded)
    out.push(
      tn(
        recorded,
        'One of them comes from what was recorded changing, not only from your reading.',
        '{n} of them come from what was recorded changing, not only from your reading.',
      ),
    );
  if (p.contrast) out.push(tn(p.contrast, 'Once, without it, this did not happen either.', '{n} times, without it, this did not happen either.'));
  if (p.mechanism) out.push(t('The “how” shows in what you wrote.'));
  if (p.counter) out.push(tn(p.counter, 'Once it was there and this did not follow.', '{n} times it was there and this did not follow.'));
  if (p.elsewhere)
    out.push(
      tn(
        p.elsewhere,
        'Once this happened without it: something else can bring it about too.',
        '{n} times this happened without it: something else can bring it about too.',
      ),
    );
  if (p.outOfOrder)
    out.push(
      tn(p.outOfOrder, '{n} sequence does not count: the order or the delay does not fit.', '{n} sequences do not count: the order or the delay does not fit.'),
    );
  if (p.happensAnyway && p.baseRate)
    out.push(
      t('{outcome} went this way in {same} of {known} recorded episodes anyway, so a time it followed says little on its own.', {
        outcome: name(claim.to),
        same: p.baseRate.same,
        known: p.baseRate.known,
      }),
    );
  if (p.needsTellingApart) {
    const others = [...new Set([...commonCauses(data, claim).map((c) => c.factor), ...rivalsOf(data, claim).map((r) => r.from)])].map(name).join(', ');
    out.push(
      p.toldApart
        ? tn(
            p.toldApart,
            'Once, it happened with nothing recorded showing {others} doing the same.',
            '{n} times, it happened with nothing recorded showing {others} doing the same.',
            { others },
          )
        : t('Nothing yet tells it apart from {others}.', { others }),
    );
  }
  if (p.conflicts)
    out.push(
      tn(
        p.conflicts,
        'In {n} episode, your reading and what was recorded point different ways.',
        'In {n} episodes, your reading and what was recorded point different ways.',
      ),
    );
  for (const { pattern, weeks } of sharedWithRepeats(data, claim))
    out.push(
      tn(weeks, 'One of these episodes is also part of the repeat “{title}”.', '{n} of these episodes are also part of the repeat “{title}”.', {
        title: patternTitle(pattern),
      }),
    );
  if (!p.episodes && !p.testsFor && !p.mechanism && !p.contrast && !p.predictionsHeld)
    out.unshift(t('Nothing in your notes shows it yet: for now it is a hunch.'));
  return out;
}

/* ---------------- 3 · what usually comes before or after ---------------- */

export interface Neighbour {
  id: ID;
  /** How many of the moments it was near. */
  count: number;
  /** Already a possible reason (before) or a possible effect (after). */
  linked: boolean;
}

const NEIGHBOUR_KINDS = new Set(['event', 'action', 'experience', 'decision', 'test']);

/**
 * What tends to happen in the weeks before and after the moments about
 * something. Counted, not concluded: coming before is not causing.
 */
export function aroundInTime(data: AtlasData, id: ID, days = 21): { moments: number; before: Neighbour[]; after: Neighbour[] } {
  const items = historyItems(data).filter((h) => h.mode === 'actual');
  const concerns = (h: (typeof items)[number]) => h.about.includes(id) || h.instanceOf === id;
  const dates = [...new Set(items.filter(concerns).map((h) => h.date))];
  const count = (dir: -1 | 1) => {
    const counts = new Map<ID, number>();
    for (const d of dates) {
      const lo = dir < 0 ? addDays(d, -days) : d;
      const hi = dir < 0 ? d : addDays(d, days);
      const seen = new Set<ID>();
      for (const h of items) {
        if (!NEIGHBOUR_KINDS.has(h.kind) || concerns(h)) continue;
        if (dir < 0 ? !(h.date >= lo && h.date < hi) : !(h.date > lo && h.date <= hi)) continue;
        for (const x of [...h.about, ...(h.instanceOf ? [h.instanceOf] : [])]) if (x !== id && data.nodes[x]?.adopted) seen.add(x);
      }
      for (const x of seen) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    const into = new Set(claimsInto(data, id).flatMap((c) => [c.from, ...c.with]));
    const out = new Set(claimsOutOf(data, id).map((c) => c.to));
    return [...counts.entries()]
      .filter(([, n]) => n >= Math.min(2, dates.length))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([x, n]) => ({ id: x, count: n, linked: dir < 0 ? into.has(x) : out.has(x) }));
  };
  return { moments: dates.length, before: count(-1), after: count(1) };
}

/* ---------------- 4 · has this happened before ---------------- */

export function strongestPattern(data: AtlasData, id: ID): { pattern: Pattern; stats: ReturnType<typeof patternStats> } | undefined {
  return patternsForNode(data, id)
    .map((pattern) => ({ pattern, stats: patternStats(data, pattern) }))
    .sort((a, b) => b.stats.instances - a.stats.instances)[0];
}

/* ---------------- 5 · what if I change it ---------------- */

/** What changing something might change: first what it affects directly, then one step further. */
export function followOn(data: AtlasData, id: ID): { direct: Claim[]; further: Claim[] } {
  const direct = claimsOutOf(data, id).filter((c) => claimStatus(data, c) !== 'retired');
  const seen = new Set<ID>([id, ...direct.map((c) => c.to)]);
  const further: Claim[] = [];
  for (const c of direct)
    for (const d of claimsOutOf(data, c.to)) {
      if (seen.has(d.to) || claimStatus(data, d) === 'retired') continue;
      seen.add(d.to);
      further.push(d);
    }
  return { direct, further: further.sort(byStrength(data)).slice(0, 4) };
}

/** Options (possible directions) that rely on a claim touching any of these elements. */
export function optionsTouching(data: AtlasData, ids: ID[]) {
  const set = new Set(ids);
  return Object.values(data.paths).filter((p) =>
    p.assumptionIds.some((cid) => {
      const c = data.claims[cid];
      return c && (set.has(c.from) || set.has(c.to) || c.with.some((w) => set.has(w)));
    }),
  );
}

/* ---------------- the kind of a new thing ---------------- */

/**
 * A first guess at what kind of thing a name describes, so adding something
 * only needs a name and an area. Always shown, always correctable.
 */
export function inferKind(label: string, fallback: ElementKind = 'state'): ElementKind {
  const s = label.trim().toLowerCase();
  if (!s) return fallback;
  if (s.endsWith('?')) return 'question';
  if (/^(fear|afraid|worry|worried|takut|khawatir|cemas)\b/.test(s)) return 'fear';
  if (/^(i believe|belief|keyakinan|aku yakin)\b/.test(s) || /\b(always|never|should)\b/.test(s)) return 'belief';
  if (/^(learn|become|finish|ship|reach|get to|build|launch|save up|menyelesaikan|belajar|menjadi|mencapai)\b/.test(s)) return 'goal';
  if (/\b(energy|stress|sleep|mood|load|progress|runway|focus|health|energi|tidur|beban|kemajuan|fokus)\b/.test(s)) return 'state';
  if (
    /^(my |the )?(mom|mother|dad|father|sister|brother|partner|wife|husband|friend|boss|client|mentor)\b/.test(s) ||
    /^(ibu|ayah|kakak|adik|pasangan|teman|atasan|klien)\b/.test(s)
  )
    return 'person';
  if (/^[a-z]+ing\b/.test(s) || /^(me|ber|meng|mem|men)[a-z]{3,}/.test(s)) return 'behaviour';
  if (/\b(project|film|book|album|podcast|course|proyek|buku)\b/.test(s)) return 'commitment';
  if (/\b(savings|money|budget|network|tools|tabungan|uang|jaringan)\b/.test(s)) return 'resource';
  if (/\b(studio|office|home|room|city|kantor|rumah|kota)\b/.test(s)) return 'place';
  return fallback;
}

export const elementsOf = (data: AtlasData, ids: ID[]): AtlasNode[] => ids.map((id) => data.nodes[id]).filter((n): n is AtlasNode => Boolean(n));
