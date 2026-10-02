/**
 * The structure of an example, without its words: what both languages of an example must share exactly (ids,
 * dates, kinds, what each note is about, which notes each reason rests on, the plan's steps), so the English and
 * the Indonesian tell the same story and reach the same statuses.
 */
import { lagRange } from '../../domain/compare';
import type { ExampleSpec } from './build';

export function exampleShape(s: ExampleSpec) {
  const n = (xs: unknown[] | undefined) => xs?.length ?? 0;
  return {
    key: s.key,
    name: s.name,
    since: s.since,
    energy: s.energy,
    areas: Object.keys(s.areas).sort(),
    state: [n(s.state.constraints), n(s.state.assets)],
    elements: s.elements.map(([id, kind, area, , , o]) => [id, kind, area, o ?? {}]),
    links: s.links,
    notes: s.notes.map(({ title: _t, text: _x, ...rest }) => rest),
    happenings: s.happenings.map(({ label: _l, excerpt, ...rest }) => ({ ...rest, excerpt: excerpt !== undefined })),
    decisions: s.decisions.map((d) => ({
      n: d.n,
      date: d.date,
      chosen: d.chosen,
      options: d.options.map((o) => o.length),
      enacted: d.enacted,
      written: [d.actual, d.learned, d.nextTime].map((x) => x !== undefined),
      rating: d.rating,
      optimizingFor: n(d.optimizingFor),
      reasons: d.reasons,
      areas: d.areas,
      about: d.about,
      reviewed: d.reviewed,
    })),
    reasons: s.reasons.map(({ via: _v, lag, evidence, ...rest }) => ({
      ...rest,
      lag: lag ? lagRange({ lag }) : undefined,
      evidence: evidence.map(({ excerpt: _e, ...e }) => e),
    })),
    repeats: s.repeats.map((p) => ({
      id: p.id,
      code: p.code,
      kind: p.kind,
      steps: p.steps.map(([, id]) => id),
      lists: [n(p.triggers), n(p.behaviors), n(p.consequences), n(p.cues.supports), n(p.cues.counters)],
      areas: p.areas,
      evidence: p.evidence.map(({ excerpt: _e, ...e }) => e),
      explainedBy: p.explainedBy,
      implications: p.implications?.map(([, ids]) => ids),
      at: p.at,
    })),
    options: s.options.map((o) => ({
      id: o.id,
      code: o.code,
      skills: o.skills.map(([, status]) => status),
      lists: [o.requirements, o.dependencies, o.risks, o.tradeoffs, o.opportunityCosts, o.unknowns, o.proposedExperiments].map(n),
      assumptions: o.assumptions,
      patternIds: o.patternIds,
    })),
    plan: {
      path: s.plan.path,
      committedAt: s.plan.committedAt,
      targetDate: s.plan.objective.targetDate,
      due: s.plan.milestone.due,
      targets: s.plan.targets.map(([id, , due, done]) => [id, due, done]),
      actions: s.plan.actions.map(([id, , target, week, status]) => [id, target, week, status]),
      current: s.plan.current,
    },
    own: s.own && {
      targets: s.own.targets.map(([id, , due, done]) => [id, due, done]),
      actions: s.own.actions.map(([id, , target, week, status]) => [id, target, week, status]),
    },
  };
}
