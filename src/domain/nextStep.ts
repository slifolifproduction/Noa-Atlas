/**
 * The single most useful thing to do right now, so nobody has to learn the
 * whole system before it helps. Checked in order of what unblocks the most.
 */
import { daysBetween, todayISO } from '../lib/dates';
import { currentAction, experimentCode, experimentProgress, pendingSuggestions } from './selectors';
import type { AtlasData, CaptureKind, EntityRef, ID } from './types';

export type NextStepAction =
  | { kind: 'capture'; capture: CaptureKind }
  | { kind: 'open'; ref: EntityRef }
  | { kind: 'route'; route: 'patterns' | 'paths' | 'navigation' }
  | { kind: 'done'; actionId: ID };

export interface NextStep {
  key: string;
  title: string;
  detail: string;
  cta: string;
  action: NextStepAction;
  /** A second, quieter way in (e.g. "Open the plan"). */
  also?: { label: string; action: NextStepAction };
}

export function nextStep(data: AtlasData, today = todayISO()): NextStep {
  const entries = Object.values(data.entries);
  const records = entries.length + Object.keys(data.decisions).length;

  if (records === 0) {
    return {
      key: 'first-note',
      title: 'Write your first note',
      detail: 'A few lines about your day or a decision on your mind is enough. The map builds itself from what you write.',
      cta: 'Write a note',
      action: { kind: 'capture', capture: 'journal' },
    };
  }

  // An experiment that has run its course is waiting for its result.
  const due = Object.values(data.experiments).find((x) => {
    if (x.status !== 'running') return false;
    const p = experimentProgress(x, today);
    return p.overdue || p.day >= p.total;
  });
  if (due) {
    return {
      key: `result:${due.id}`,
      title: `Record what happened in ${experimentCode(due.code)}`,
      detail: `“${due.title}” has run its ${due.durationDays} days. Its result updates the patterns it was testing.`,
      cta: 'Record the result',
      action: { kind: 'open', ref: { kind: 'experiment', id: due.id } },
    };
  }

  // Suggestions from the analysis wait for a yes or no.
  const pending = pendingSuggestions(data);
  if (pending.length) {
    const evidence = pending.filter((p) => p.suggestion.type === 'pattern_evidence').length;
    const latest = [...pending].sort((a, b) => b.entry.date.localeCompare(a.entry.date))[0].entry;
    return evidence
      ? {
          key: 'review-evidence',
          title: `Review ${evidence} suggestion${evidence === 1 ? '' : 's'}`,
          detail: 'The atlas found notes that may support or count against a pattern. Accept what fits, reject what does not.',
          cta: 'Review in Patterns',
          action: { kind: 'route', route: 'patterns' },
        }
      : {
          key: `review-links:${latest.id}`,
          title: `Check ${pending.length} suggested link${pending.length === 1 ? '' : 's'}`,
          detail: `From “${latest.title}”. Say yes to add them to your map, or dismiss them.`,
          cta: 'Open the note',
          action: { kind: 'open', ref: { kind: 'entry', id: latest.id } },
        };
  }

  // Nothing written for a week: the map only knows what you tell it.
  const lastDate = entries
    .map((e) => e.date)
    .sort()
    .pop();
  if (!lastDate || daysBetween(lastDate, today) >= 7) {
    return {
      key: 'weekly-note',
      title: 'Write about this week',
      detail: lastDate ? `Your last note was ${daysBetween(lastDate, today)} days ago. What happened since then?` : 'What happened this week?',
      cta: 'Write a note',
      action: { kind: 'capture', capture: 'journal' },
    };
  }

  if (!data.navigation) {
    return {
      key: 'choose-direction',
      title: 'Choose a direction',
      detail: 'Compare your options side by side, then pick one to turn into concrete steps.',
      cta: 'See your options',
      action: { kind: 'route', route: 'paths' },
    };
  }

  const action = currentAction(data.navigation);
  if (action) {
    return {
      key: `action:${action.id}`,
      title: action.title,
      detail: `This week's next step toward “${data.navigation.objective.title}”.`,
      cta: 'Mark as done',
      action: { kind: 'done', actionId: action.id },
      also: { label: 'Open the plan', action: { kind: 'route', route: 'navigation' } },
    };
  }

  return {
    key: 'plan-week',
    title: 'Plan this week',
    detail: 'Every step for this week is done. Add the next one to your plan.',
    cta: 'Open the plan',
    action: { kind: 'route', route: 'navigation' },
  };
}
