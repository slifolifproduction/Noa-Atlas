/**
 * How the agent names records: the way the person sees them, never by internal id.
 *
 *   elements   by name ("Energy"), found again however it is spelled or accented
 *   notes      N12 (the note's number), decisions D3, reasons R4, repeats P2
 *
 * In an answer a record is cited in square brackets, [N12], and shown as a chip that opens it.
 */
import { claimCode, claimSentence } from '../domain/claims';
import { decisionCode, entryCode, mapElements, patternCode, patternTitle } from '../domain/selectors';
import type { AtlasData, AtlasNode } from '../domain/types';
import type { Citation } from './types';

/** Lower case, no accents, words only: how names are compared. */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * The element a name means: the one with that name, or else the only one whose name contains it or is contained in
 * it (four letters or more). Two that could be meant are none: the agent asks instead of guessing.
 */
export function findElement(data: AtlasData, name: string): AtlasNode | undefined {
  const q = fold(name);
  if (!q) return undefined;
  const elements = mapElements(data);
  const exact = elements.find((n) => fold(n.label) === q);
  if (exact) return exact;
  const near = elements.filter((n) => {
    const l = fold(n.label);
    return (l.length >= 4 && q.includes(l)) || (q.length >= 4 && l.includes(q));
  });
  return near.length === 1 ? near[0] : undefined;
}

const HANDLE = /\[([NDRP])(\d{1,4})\]/g;

export function handleOf(data: AtlasData, c: Citation): string | undefined {
  if (c.kind === 'entry') return data.entries[c.id] && `N${data.entries[c.id].seq}`;
  if (c.kind === 'decision') return data.decisions[c.id] && `D${data.decisions[c.id].seq}`;
  if (c.kind === 'claim') return data.claims[c.id] && `R${data.claims[c.id].code}`;
  if (c.kind === 'pattern') return data.patterns[c.id] && `P${data.patterns[c.id].code}`;
  return undefined;
}

/** The record a handle (N12, D3, R4, P2) names, if there is one. */
export function citationOf(data: AtlasData, letter: string, n: number): Citation | undefined {
  if (letter === 'N') {
    const e = Object.values(data.entries).find((x) => x.seq === n);
    return e && { kind: 'entry', id: e.id };
  }
  if (letter === 'D') {
    const d = Object.values(data.decisions).find((x) => x.seq === n);
    return d && { kind: 'decision', id: d.id };
  }
  if (letter === 'R') {
    const c = Object.values(data.claims).find((x) => x.code === n);
    return c && { kind: 'claim', id: c.id };
  }
  if (letter === 'P') {
    const p = Object.values(data.patterns).find((x) => x.code === n);
    return p && { kind: 'pattern', id: p.id };
  }
  return undefined;
}

/** The records an answer cites, in order, each once. */
export function citationsIn(data: AtlasData, text: string): Citation[] {
  const out: Citation[] = [];
  for (const m of text.matchAll(HANDLE)) {
    const c = citationOf(data, m[1], Number(m[2]));
    if (c && !out.some((x) => x.kind === c.kind && x.id === c.id)) out.push(c);
  }
  return out;
}

/** An answer split into text and cited records, for showing the citations as chips in place. */
export function splitCitations(data: AtlasData, text: string): (string | Citation)[] {
  const parts: (string | Citation)[] = [];
  let at = 0;
  for (const m of text.matchAll(HANDLE)) {
    const c = citationOf(data, m[1], Number(m[2]));
    if (!c) continue;
    if (m.index! > at) parts.push(text.slice(at, m.index));
    parts.push(c);
    at = m.index! + m[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/** What a cited record is called on screen. */
export function citationLabel(data: AtlasData, c: Citation): string {
  if (c.kind === 'entry') {
    const e = data.entries[c.id];
    return e ? `${entryCode(e.seq)}${e.title ? ` · ${e.title}` : ''}` : '';
  }
  if (c.kind === 'decision') {
    const d = data.decisions[c.id];
    return d ? `${decisionCode(d.seq)} · ${d.title}` : '';
  }
  if (c.kind === 'claim') {
    const x = data.claims[c.id];
    return x ? `${claimCode(x.code)} · ${claimSentence(data, x)}` : '';
  }
  if (c.kind === 'pattern') {
    const p = data.patterns[c.id];
    return p ? `${patternCode(p.code)} · ${patternTitle(p)}` : '';
  }
  if (c.kind === 'node') return data.nodes[c.id]?.label ?? '';
  return data.paths[c.id]?.title ?? '';
}
