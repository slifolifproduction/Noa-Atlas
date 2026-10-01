/**
 * The single most useful thing to do right now, so nobody has to learn the
 * whole system before it helps. Checked in order of what unblocks the most.
 */
import { daysBetween, todayISO } from '../lib/dates';
import { claimSentence } from './claims';
import { inquiries, type InquiryKind } from './inquiry';
import { OUTCOME_RATING_LABEL } from './constants';
import { currentAction, experimentCode, experimentProgress, thinSpots } from './selectors';
import { offerFor } from './weave';
import type { AtlasData, CaptureKind, EntityRef, ID, OutcomeRating } from './types';
import { t } from '../i18n';

export type NextStepAction =
  | { kind: 'capture'; capture: CaptureKind }
  | { kind: 'open'; ref: EntityRef }
  | { kind: 'route'; route: 'patterns' | 'paths' | 'navigation' }
  | { kind: 'done'; actionId: ID }
  /** "Not now" to something the Atlas asked to find out. */
  | { kind: 'decline'; key: string; inquiryKind?: InquiryKind }
  /** Yes or no to what only you can say about a note (see domain/weave). */
  | { kind: 'offer'; entryId: ID; suggestionId: ID; take: boolean }
  /** How a decision turned out, against what you expected. */
  | { kind: 'outcome'; decisionId: ID; rating: OutcomeRating };

export interface NextStep {
  key: string;
  title: string;
  detail: string;
  cta: string;
  action: NextStepAction;
  /** A second, quieter way in (e.g. "Open the plan"). */
  also?: { label: string; action: NextStepAction };
  /** One question with a few answers, each one tap, in place of the main button. */
  choices?: { label: string; action: NextStepAction }[];
}

/** How long after a decision to ask how it turned out, and how long "not now" lasts. */
const LOOK_BACK_DAYS = 14;

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

  // Only what you can say about a note: one question, the latest first, answered in place.
  for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq)) {
    const offer = (e.analysis?.suggestions ?? []).map((x) => offerFor(data, x)).find(Boolean);
    if (!offer) continue;
    const ask = { entryId: e.id, suggestionId: offer.suggestion };
    if (offer.kind === 'explain')
      return {
        key: `offer:${offer.suggestion}`,
        title: t('Your note explains a cause in its own words'),
        detail: `“${offer.excerpt}”`,
        cta: t('Add as a reason'),
        action: { kind: 'open', ref: { kind: 'entry', id: e.id } },
        also: { label: t('Not this'), action: { kind: 'offer', ...ask, take: false } },
      };
    return {
      key: `offer:${offer.suggestion}`,
      title: offer.kind === 'claim' ? t('A possible reason: {claim}?', { claim: offer.label }) : `${offer.label}?`,
      detail: `“${offer.excerpt}”`,
      cta: offer.kind === 'claim' ? t('Yes, keep it as a hunch') : t('Yes, it did not happen this time'),
      action: { kind: 'offer', ...ask, take: true },
      also: { label: t('Not this'), action: { kind: 'offer', ...ask, take: false } },
    };
  }

  // A decision made a while ago: how it turned out, with one tap.
  const declined = data.inquiry?.declined ?? {};
  const lookBack = Object.values(data.decisions)
    .filter((d) => !d.outcomeRating && daysBetween(d.date, today) >= LOOK_BACK_DAYS)
    .filter((d) => !declined[`outcome:${d.id}`] || daysBetween(declined[`outcome:${d.id}`], today) >= LOOK_BACK_DAYS)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lookBack) {
    const rate = (rating: OutcomeRating) => ({ label: OUTCOME_RATING_LABEL[rating], action: { kind: 'outcome' as const, decisionId: lookBack.id, rating } });
    return {
      key: `outcome:${lookBack.id}`,
      title: t('How did it turn out?'),
      detail: lookBack.expectedOutcome
        ? t('“{choice}”, {n} days ago. You expected: {expected}', {
            choice: lookBack.chosenAction || lookBack.title,
            n: daysBetween(lookBack.date, today),
            expected: lookBack.expectedOutcome,
          })
        : t('“{choice}”, {n} days ago.', { choice: lookBack.chosenAction || lookBack.title, n: daysBetween(lookBack.date, today) }),
      cta: '',
      action: { kind: 'open', ref: { kind: 'decision', id: lookBack.id } },
      choices: [rate('better'), rate('as_expected'), rate('mixed'), rate('worse')],
      also: { label: t('Not now'), action: { kind: 'decline', key: `outcome:${lookBack.id}` } },
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
      also: { label: t('Not now'), action: { kind: 'decline', key: ask.key, inquiryKind: ask.kind } },
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
