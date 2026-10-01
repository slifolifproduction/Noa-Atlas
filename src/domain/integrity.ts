/**
 * Referential integrity. Every lens reads the same records: the Map and
 * Causes draw elements, links and claims; Time reads notes, decisions and
 * what was read from them; Repeats reads patterns and their evidence; Ahead
 * reads options, the claims they rely on and the tests that check them. So a
 * record that points at something no longer there would show differently in
 * each lens, or break one of them.
 *
 * `repairReferences` runs after every change to the atlas and leaves it whole:
 * a record that cannot stand without what it points at goes with it (a claim
 * about a deleted element, a link to it, a happening read from a deleted
 * note); a record that can stand on its own is unlinked (a note that mentioned
 * it, an option that relied on a deleted claim). Links kept on both sides
 * (options and tests) are kept in step. `danglingReferences` lists what is out
 * of place, for tests and checks.
 */
import type { AtlasData, ID, SourceRef } from './types';

const sourceExists = (d: AtlasData, ref: SourceRef) =>
  ref.kind === 'entry'
    ? ref.id in d.entries
    : ref.kind === 'decision'
      ? ref.id in d.decisions
      : ref.kind === 'experiment'
        ? ref.id in d.experiments
        : ref.id in d.occurrences;

/** Every step and target, in the plan and in your own quests. */
const workIds = (d: AtlasData) =>
  new Set<ID>([
    ...(d.navigation?.actions ?? []).map((a) => a.id),
    ...(d.navigation?.targets ?? []).map((x) => x.id),
    ...(d.quests?.own?.actions ?? []).map((a) => a.id),
    ...(d.quests?.own?.targets ?? []).map((x) => x.id),
  ]);

/** Loop names are keyed by their member claim ids. */
const loopClaimIds = (key: string) => key.split('|');

/* ---------------- detection ---------------- */

/** Every reference to something that does not exist, and every one-sided link, as readable lines. */
export function danglingReferences(d: AtlasData): string[] {
  const out: string[] = [];
  const node = (id: ID | undefined, where: string) => id !== undefined && !(id in d.nodes) && out.push(`${where} → element ${id}`);
  const claim = (id: ID | undefined, where: string) => id !== undefined && !(id in d.claims) && out.push(`${where} → claim ${id}`);
  const pattern = (id: ID, where: string) => !(id in d.patterns) && out.push(`${where} → pattern ${id}`);
  const path = (id: ID, where: string) => !(id in d.paths) && out.push(`${where} → option ${id}`);
  const test = (id: ID | undefined, where: string) => id !== undefined && !(id in d.experiments) && out.push(`${where} → test ${id}`);
  const source = (ref: SourceRef, where: string) => !sourceExists(d, ref) && out.push(`${where} → ${ref.kind} ${ref.id}`);

  for (const e of Object.values(d.edges)) {
    node(e.source, `link ${e.id}.source`);
    node(e.target, `link ${e.id}.target`);
  }
  for (const c of Object.values(d.claims)) {
    node(c.from, `claim ${c.id}.from`);
    node(c.to, `claim ${c.id}.to`);
    c.with.forEach((w) => node(w, `claim ${c.id}.with`));
    c.rivalIds.forEach((r) => claim(r, `claim ${c.id}.rivals`));
    c.evidence.forEach((ev) => {
      source(ev.source, `claim ${c.id}.evidence`);
      if (ev.cause) source(ev.cause, `claim ${c.id}.evidence.cause`);
    });
    node(c.condition?.factor, `claim ${c.id}.condition`);
    claim(c.revises, `claim ${c.id}.revises`);
    claim(c.retired?.revisedInto, `claim ${c.id}.revisedInto`);
  }
  for (const n of Object.values(d.nodes)) {
    claim(n.claimId, `element ${n.id}.claim`);
    node(n.investigation?.anchorId, `element ${n.id}.investigation`);
    n.investigation?.claimIds.forEach((c) => claim(c, `element ${n.id}.investigation`));
  }
  for (const o of Object.values(d.occurrences)) {
    o.about.forEach((a) => node(a, `happening ${o.id}.about`));
    node(o.instanceOf, `happening ${o.id}.instanceOf`);
    if (o.source) source(o.source, `happening ${o.id}.source`);
    o.changes?.forEach((c) => node(c.factor, `happening ${o.id}.changes`));
    o.expectation?.basis.forEach((c) => claim(c, `expectation ${o.id}.basis`));
  }
  for (const e of Object.values(d.entries)) {
    e.nodeIds.forEach((n) => node(n, `note ${e.id}`));
    for (const s of e.analysis?.suggestions ?? []) {
      if (s.type === 'link_node') node(s.nodeId, `note ${e.id}.suggestion`);
      if (s.type === 'pattern_evidence') pattern(s.patternId, `note ${e.id}.suggestion`);
      if (s.type === 'occurrence') {
        s.about.forEach((a) => node(a, `note ${e.id}.suggestion`));
        node(s.instanceOf, `note ${e.id}.suggestion`);
      }
      if (s.type === 'change' || s.type === 'expectation') node(s.factor, `note ${e.id}.suggestion`);
      if (s.type === 'attribution' && s.claim) [s.claim.from, s.claim.to].forEach((n) => node(n, `note ${e.id}.suggestion`));
    }
    const work = workIds(d);
    e.woven?.parts.forEach((p) => !work.has(p) && out.push(`note ${e.id}.woven → step ${p}`));
    if (e.woven?.decision && !(e.woven.decision in d.decisions)) out.push(`note ${e.id}.woven → decision ${e.woven.decision}`);
  }
  for (const x of Object.values(d.decisions)) {
    x.nodeIds.forEach((n) => node(n, `decision ${x.id}`));
    x.claimIds.forEach((c) => claim(c, `decision ${x.id}`));
    if (x.chosenOptionId && !x.options.some((o) => o.id === x.chosenOptionId)) out.push(`decision ${x.id}.chosen → option ${x.chosenOptionId}`);
  }
  for (const p of Object.values(d.patterns)) {
    p.nodeIds.forEach((n) => node(n, `pattern ${p.id}`));
    p.steps.forEach((s) => node(s.elementId, `pattern ${p.id}.step`));
    p.explainedBy.forEach((c) => claim(c, `pattern ${p.id}.explainedBy`));
    p.evidence.forEach((ev) => source(ev.source, `pattern ${p.id}.evidence`));
    p.implications.forEach((i) => i.pathIds.forEach((x) => path(x, `pattern ${p.id}.implication`)));
  }
  for (const p of Object.values(d.paths)) {
    p.assumptionIds.forEach((c) => claim(c, `option ${p.id}.reliesOn`));
    p.patternIds.forEach((x) => pattern(x, `option ${p.id}.patterns`));
    for (const x of p.experimentIds) {
      test(x, `option ${p.id}.tests`);
      if (d.experiments[x] && !d.experiments[x].pathIds.includes(p.id)) out.push(`option ${p.id}.tests ↔ test ${x} (one-sided)`);
    }
  }
  for (const x of Object.values(d.experiments)) {
    claim(x.claimId, `test ${x.id}.claim`);
    x.measures.forEach((m) => node(m.factor, `test ${x.id}.measure`));
    x.patternIds.forEach((p) => pattern(p, `test ${x.id}.patterns`));
    x.questionIds.forEach((q) => node(q, `test ${x.id}.questions`));
    for (const p of x.pathIds) {
      path(p, `test ${x.id}.options`);
      if (d.paths[p] && !d.paths[p].experimentIds.includes(x.id)) out.push(`test ${x.id}.options ↔ option ${p} (one-sided)`);
    }
  }
  const nav = d.navigation;
  if (nav) {
    path(nav.pathId, 'plan.direction');
    test(nav.experimentId, 'plan.test');
    for (const a of nav.actions) if (a.targetId && !nav.targets.some((x) => x.id === a.targetId)) out.push(`plan step ${a.id} → target ${a.targetId}`);
    if (nav.currentActionId && !nav.actions.some((a) => a.id === nav.currentActionId)) out.push(`plan.current → step ${nav.currentActionId}`);
  }
  for (const key of Object.keys(d.loopNames)) for (const c of loopClaimIds(key)) claim(c, `cycle name ${key}`);
  if (d.quests) {
    for (const [boss, refs] of Object.entries(d.quests.armor)) {
      if (!bossExists(d, boss)) out.push(`quest armor → boss ${boss}`);
      for (const r of refs) {
        if (r.kind === 'pattern') pattern(r.id, `quest armor ${boss}`);
        else for (const c of loopClaimIds(r.id)) claim(c, `quest armor ${boss} cycle`);
      }
    }
    for (const u of d.quests.upgrades) node(u.nodeId, `quest upgrade ${u.id}`);
    const own = d.quests.own;
    if (own)
      for (const a of own.actions) if (a.targetId && !own.targets.some((x) => x.id === a.targetId)) out.push(`own quest step ${a.id} → quest ${a.targetId}`);
  }
  return out;
}

/** A Quests boss id: "milestone" while there is a plan, or "target:<id>" for a target in it. */
const bossExists = (d: AtlasData, boss: string) =>
  boss === 'milestone'
    ? Boolean(d.navigation)
    : boss.startsWith('target:') && [...(d.navigation?.targets ?? []), ...(d.quests?.own?.targets ?? [])].some((x) => `target:${x.id}` === boss);

/* ---------------- repair ---------------- */

/**
 * Remove what points at nothing, in place (it works on an immer draft or a
 * plain object). Arrays are only reassigned when something is actually
 * removed, so an atlas that is already whole comes back unchanged. Removing
 * one record can orphan another (an element's claims, then an option's
 * reliance on them), so it runs until nothing changes. Returns how many
 * references were fixed.
 */
export function repairReferences(d: AtlasData): number {
  let fixed = 0;
  const keep = <T>(list: T[], ok: (x: T) => boolean): T[] => {
    if (list.every(ok)) return list;
    const next = list.filter(ok);
    fixed += list.length - next.length;
    return next;
  };
  const hasNode = (id: ID) => id in d.nodes;
  const hasClaim = (id: ID) => id in d.claims;

  for (let round = 0; round < 5; round++) {
    const before = fixed;

    // What cannot stand on its own goes with what it points at.
    for (const [id, e] of Object.entries(d.edges)) {
      if (!hasNode(e.source) || !hasNode(e.target)) {
        delete d.edges[id];
        fixed++;
      }
    }
    for (const [id, c] of Object.entries(d.claims)) {
      if (!hasNode(c.from) || !hasNode(c.to)) {
        delete d.claims[id];
        fixed++;
      }
    }
    for (const [id, o] of Object.entries(d.occurrences)) {
      // History keeps its trail or nothing: a happening read from a deleted record goes with it.
      if (o.source && !sourceExists(d, o.source)) {
        delete d.occurrences[id];
        fixed++;
      }
    }

    // What can stand on its own is unlinked.
    for (const c of Object.values(d.claims)) {
      const w = keep(c.with, hasNode);
      if (w !== c.with) c.with = w;
      const r = keep(c.rivalIds, hasClaim);
      if (r !== c.rivalIds) c.rivalIds = r;
      // An instance drawn from two records rests on both: without its cause record, its order is unknown.
      const ev = keep(c.evidence, (e) => sourceExists(d, e.source) && (!e.cause || sourceExists(d, e.cause)));
      if (ev !== c.evidence) c.evidence = ev;
      // A condition about something gone can no longer be checked; a version gone is no longer a link in the line.
      if (c.condition && !hasNode(c.condition.factor)) {
        c.condition = undefined;
        fixed++;
      }
      if (c.revises && !hasClaim(c.revises)) {
        c.revises = undefined;
        fixed++;
      }
      if (c.retired?.revisedInto && !hasClaim(c.retired.revisedInto)) {
        c.retired = { ...c.retired, revisedInto: undefined };
        fixed++;
      }
    }
    for (const n of Object.values(d.nodes)) {
      if (n.claimId && !hasClaim(n.claimId)) {
        n.claimId = undefined;
        fixed++;
      }
      const inv = n.investigation;
      if (inv) {
        if (inv.anchorId && !hasNode(inv.anchorId)) {
          inv.anchorId = undefined;
          fixed++;
        }
        const ids = keep(inv.claimIds, hasClaim);
        if (ids !== inv.claimIds) inv.claimIds = ids;
      }
    }
    for (const o of Object.values(d.occurrences)) {
      const about = keep(o.about, hasNode);
      if (about !== o.about) o.about = about;
      if (o.instanceOf && !hasNode(o.instanceOf)) {
        o.instanceOf = undefined;
        fixed++;
      }
      if (o.changes) {
        const ch = keep(o.changes, (c) => hasNode(c.factor));
        if (ch !== o.changes) o.changes = ch.length ? ch : undefined;
      }
      if (o.expectation) {
        const basis = keep(o.expectation.basis, hasClaim);
        if (basis !== o.expectation.basis) o.expectation.basis = basis;
      }
    }
    // An expectation about something gone has nothing left to check.
    for (const [id, o] of Object.entries(d.occurrences)) {
      if (o.mode === 'expected' && o.expectation && !o.changes?.length) {
        delete d.occurrences[id];
        fixed++;
      }
    }
    const work = workIds(d);
    for (const e of Object.values(d.entries)) {
      const ids = keep(e.nodeIds, hasNode);
      if (ids !== e.nodeIds) e.nodeIds = ids;
      // A step the note finished that is no longer in any plan or quest.
      if (e.woven) {
        const parts = keep(e.woven.parts, (p) => work.has(p));
        if (parts !== e.woven.parts) e.woven.parts = parts;
        // A decision logged from it that you deleted stays deleted: it is not logged again.
        if (e.woven.decision && !(e.woven.decision in d.decisions)) {
          e.woven.decision = undefined;
          e.woven.decisionDeclined = true;
          fixed++;
        }
      }
      const a = e.analysis;
      if (a) {
        // A suggestion about something that is gone can no longer be answered.
        const sug = keep(a.suggestions, (s) =>
          s.type === 'link_node'
            ? hasNode(s.nodeId)
            : s.type === 'pattern_evidence'
              ? s.patternId in d.patterns
              : s.type === 'change' || s.type === 'expectation'
                ? hasNode(s.factor)
                : true,
        );
        if (sug !== a.suggestions) a.suggestions = sug;
        for (const s of a.suggestions) {
          if (s.type === 'attribution' && s.claim && (!hasNode(s.claim.from) || !hasNode(s.claim.to))) {
            s.claim = undefined;
            fixed++;
          }
          if (s.type !== 'occurrence') continue;
          const about = keep(s.about, hasNode);
          if (about !== s.about) s.about = about;
          if (s.instanceOf && !hasNode(s.instanceOf)) {
            s.instanceOf = undefined;
            fixed++;
          }
        }
      }
    }
    for (const x of Object.values(d.decisions)) {
      const n = keep(x.nodeIds, hasNode);
      if (n !== x.nodeIds) x.nodeIds = n;
      const c = keep(x.claimIds, hasClaim);
      if (c !== x.claimIds) x.claimIds = c;
      if (x.chosenOptionId && !x.options.some((o) => o.id === x.chosenOptionId)) {
        x.chosenOptionId = undefined;
        fixed++;
      }
    }
    for (const p of Object.values(d.patterns)) {
      const n = keep(p.nodeIds, hasNode);
      if (n !== p.nodeIds) p.nodeIds = n;
      for (const s of p.steps) {
        if (s.elementId && !hasNode(s.elementId)) {
          s.elementId = undefined;
          fixed++;
        }
      }
      const by = keep(p.explainedBy, hasClaim);
      if (by !== p.explainedBy) p.explainedBy = by;
      const ev = keep(p.evidence, (e) => sourceExists(d, e.source));
      if (ev !== p.evidence) p.evidence = ev;
      for (const i of p.implications) {
        const ids = keep(i.pathIds, (x) => x in d.paths);
        if (ids !== i.pathIds) i.pathIds = ids;
      }
    }
    for (const p of Object.values(d.paths)) {
      const a = keep(p.assumptionIds, hasClaim);
      if (a !== p.assumptionIds) p.assumptionIds = a;
      const pt = keep(p.patternIds, (x) => x in d.patterns);
      if (pt !== p.patternIds) p.patternIds = pt;
      const xs = keep(p.experimentIds, (x) => x in d.experiments);
      if (xs !== p.experimentIds) p.experimentIds = xs;
    }
    for (const x of Object.values(d.experiments)) {
      if (x.claimId && !hasClaim(x.claimId)) {
        x.claimId = undefined;
        fixed++;
      }
      for (const m of x.measures) {
        if (m.factor && !hasNode(m.factor)) {
          m.factor = undefined;
          fixed++;
        }
      }
      const pt = keep(x.patternIds, (p) => p in d.patterns);
      if (pt !== x.patternIds) x.patternIds = pt;
      const q = keep(x.questionIds, hasNode);
      if (q !== x.questionIds) x.questionIds = q;
      const ps = keep(x.pathIds, (p) => p in d.paths);
      if (ps !== x.pathIds) x.pathIds = ps;
    }
    // An option and a test that check each other are listed on both sides.
    for (const x of Object.values(d.experiments)) {
      for (const pid of x.pathIds) {
        const p = d.paths[pid];
        if (p && !p.experimentIds.includes(x.id)) {
          p.experimentIds = [...p.experimentIds, x.id];
          fixed++;
        }
      }
    }
    for (const p of Object.values(d.paths)) {
      for (const xid of p.experimentIds) {
        const x = d.experiments[xid];
        if (x && !x.pathIds.includes(p.id)) {
          x.pathIds = [...x.pathIds, p.id];
          fixed++;
        }
      }
    }

    const nav = d.navigation;
    if (nav) {
      if (!(nav.pathId in d.paths)) {
        d.navigation = null;
        fixed++;
      } else {
        if (nav.experimentId && !(nav.experimentId in d.experiments)) {
          nav.experimentId = undefined;
          fixed++;
        }
        for (const a of nav.actions) {
          if (a.targetId && !nav.targets.some((x) => x.id === a.targetId)) {
            a.targetId = undefined;
            fixed++;
          }
        }
        if (nav.currentActionId && !nav.actions.some((a) => a.id === nav.currentActionId)) {
          nav.currentActionId = nav.actions.find((a) => a.status === 'todo')?.id;
          fixed++;
        }
      }
    }
    for (const key of Object.keys(d.loopNames)) {
      if (!loopClaimIds(key).every(hasClaim)) {
        delete d.loopNames[key];
        fixed++;
      }
    }
    if (d.quests) {
      for (const [boss, refs] of Object.entries(d.quests.armor)) {
        const kept = bossExists(d, boss) ? refs.filter((r) => (r.kind === 'pattern' ? r.id in d.patterns : loopClaimIds(r.id).every(hasClaim))) : [];
        if (kept.length !== refs.length) {
          fixed += refs.length - kept.length;
          if (kept.length) d.quests.armor[boss] = kept;
          else delete d.quests.armor[boss];
        }
      }
      // A step of your own quest whose quest is gone goes with it.
      const own = d.quests.own;
      if (own) {
        const steps = own.actions.filter((a) => !a.targetId || own.targets.some((x) => x.id === a.targetId));
        if (steps.length !== own.actions.length) {
          fixed += own.actions.length - steps.length;
          own.actions = steps;
        }
      }
      const upgrades = d.quests.upgrades.filter((u) => u.nodeId in d.nodes);
      if (upgrades.length !== d.quests.upgrades.length) {
        fixed += d.quests.upgrades.length - upgrades.length;
        d.quests.upgrades = upgrades;
      }
    }

    if (fixed === before) break;
  }
  return fixed;
}
