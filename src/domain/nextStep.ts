/**
 * The single most useful thing to do right now, so nobody has to learn the
 * whole system before it helps. Checked in order of what unblocks the most.
 */
import { daysBetween, todayISO } from '../lib/dates';
import { claimSentence } from './claims';
import { inquiries } from './inquiry';
import { currentAction, experimentCode, experimentProgress, pendingSuggestions, thinSpots } from './selectors';
import type { AtlasData, CaptureKind, EntityRef, ID } from './types';
import { t, tn } from '../i18n';

export type NextStepAction =
  | { kind: 'capture'; capture: CaptureKind }
  | { kind: 'open'; ref: EntityRef }
  | { kind: 'route'; route: 'patterns' | 'paths' | 'navigation' }
  | { kind: 'done'; actionId: ID }
  /** "Not now" to something the Atlas asked to find out. */
  | { kind: 'decline'; key: string };

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
      title: t('Write your first note'),
      detail: t('A few lines about your day or a decision on your mind is enough. The map builds itself from what you write.'),
      cta: t('Write a note'),
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
      title: t('Record what happened in {code}', { code: experimentCode(due.code) }),
      detail: t('“{title}” has run its {n} days. Compare what happened with what you predicted.', { title: due.title, n: due.durationDays }),
      cta: t('Record the result'),
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
          title: tn(evidence, 'Review {n} suggestion', 'Review {n} suggestions'),
          detail: t('The Atlas found notes that might be another time something happened, or an exception to it. Say yes to what fits.'),
          cta: t('Look in Repeats'),
          action: { kind: 'route', route: 'patterns' },
        }
      : {
          key: `review-links:${latest.id}`,
          title: tn(pending.length, 'Check {n} suggestion', 'Check {n} suggestions'),
          detail: t('From “{title}”: what happened, what it is about, and any cause you named. Say yes to what fits.', { title: latest.title }),
          cta: t('Open the note'),
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
      title: t('Write about this week'),
      detail: lastDate ? t('Your last note was {n} days ago. What happened since then?', { n: daysBetween(lastDate, today) }) : t('What happened this week?'),
      cta: t('Write a note'),
      action: { kind: 'capture', capture: 'journal' },
    };
  }

  // Where understanding is thin: something you care about with no explanation, or a claim with nothing behind it.
  const thin = thinSpots(data, today);
  if (!data.navigation && thin.unexplained.length) {
    const n = thin.unexplained[0];
    return {
      key: `ask-why:${n.id}`,
      title: t('Ask why: {label}', { label: n.label }),
      detail: t('You care about this, and nothing on the map explains it yet. What might be acting on it?'),
      cta: t('Open it'),
      action: { kind: 'open', ref: { kind: 'node', id: n.id } },
    };
  }
  if (!data.navigation && thin.bareClaims.length) {
    const c = thin.bareClaims[0];
    return {
      key: `back-claim:${c.id}`,
      title: t('Check a hunch against your notes'),
      detail: t('“{claim}” has nothing behind it yet. Look for a time it happened, and a time it did not.', { claim: claimSentence(data, c) }),
      cta: t('Open it'),
      action: { kind: 'open', ref: { kind: 'claim', id: c.id } },
    };
  }

  // Something worth finding out: a check that would tell two readings of what you care about apart.
  // It never displaces a step you committed to: it comes when there is no plan, or this week's steps are done.
  const ask = !data.navigation || !currentAction(data.navigation) ? inquiries(data, today).find((q) => q.decisive && q.relevance >= 2) : undefined;
  if (ask) {
    return {
      key: `inquiry:${ask.key}`,
      title: t('Something to find out'),
      detail: ask.between.length === 2 ? `${ask.question} ${t('It would tell “{a}” from “{b}”.', { a: ask.between[0], b: ask.between[1] })}` : ask.question,
      cta: t('Look into it'),
      action: { kind: 'open', ref: ask.open },
      also: { label: t('Not now'), action: { kind: 'decline', key: ask.key } },
    };
  }

  if (!data.navigation) {
    return {
      key: 'choose-direction',
      title: t('Choose a direction'),
      detail: t('Compare your options side by side, then pick one to turn into concrete steps.'),
      cta: t('See your options'),
      action: { kind: 'route', route: 'paths' },
    };
  }

  const action = currentAction(data.navigation);
  if (action) {
    return {
      key: `action:${action.id}`,
      title: action.title,
      detail: t('This week’s next step toward “{goal}”.', { goal: data.navigation.objective.title }),
      cta: t('Mark as done'),
      action: { kind: 'done', actionId: action.id },
      also: { label: t('Open the plan'), action: { kind: 'route', route: 'navigation' } },
    };
  }

  return {
    key: 'plan-week',
    title: t('Plan this week'),
    detail: t('Every step for this week is done. Add the next one to your plan.'),
    cta: t('Open the plan'),
    action: { kind: 'route', route: 'navigation' },
  };
}
