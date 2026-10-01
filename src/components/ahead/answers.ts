import { claimSentence, claimStatus } from '../../domain/claims';
import { EXPERIMENT_STATUS_LABEL, REGULARITY_LABEL, SKILL_STATUS_LABEL, STATUS_META } from '../../domain/constants';
import { experimentCode, patternStats, patternTitle } from '../../domain/selectors';
import type { AtlasData, EntityRef, SkillStatus, StrategicPath } from '../../domain/types';
import { t } from '../../i18n';

/*
 * What every option in Ahead is asked, and its answers: what it needs, the
 * skills it takes, what it costs, and what is not known yet. Each option is
 * asked the same questions so they can be compared; nothing here is ranked.
 */

export type Band = 'needs' | 'skills' | 'costs' | 'unknowns';
export const BANDS: Band[] = ['needs', 'skills', 'costs', 'unknowns'];

export type AnswerKind =
  'requirement' | 'dependency' | 'capital' | 'time' | 'skill' | 'risk' | 'tradeoff' | 'cost' | 'unknown' | 'assumption' | 'test' | 'idea' | 'repeat';

export const BAND_OF: Record<AnswerKind, Band> = {
  requirement: 'needs',
  dependency: 'needs',
  capital: 'needs',
  time: 'needs',
  skill: 'skills',
  risk: 'costs',
  tradeoff: 'costs',
  cost: 'costs',
  unknown: 'unknowns',
  assumption: 'unknowns',
  test: 'unknowns',
  idea: 'unknowns',
  repeat: 'unknowns',
};

export const BAND_LABEL: Record<Band, () => string> = {
  needs: () => t('Needs'),
  skills: () => t('Skills'),
  costs: () => t('Costs'),
  unknowns: () => t('Unknowns'),
};

export const KIND_LABEL: Record<AnswerKind, () => string> = {
  requirement: () => t('Requirement'),
  dependency: () => t('Dependency'),
  capital: () => t('Capital'),
  time: () => t('Time'),
  skill: () => t('Skill'),
  risk: () => t('Risk'),
  tradeoff: () => t('Trade-off'),
  cost: () => t('Opportunity cost'),
  unknown: () => t('Unknown'),
  assumption: () => t('Relies on'),
  test: () => t('Test'),
  idea: () => t('Idea for a test'),
  repeat: () => t('Repeat in play'),
};

/** One answer an option gives. */
export interface Answer {
  key: string;
  pathId: string;
  kind: AnswerKind;
  band: Band;
  text: string;
  /** Its status in words (a skill's, a reason's, a test's, a repeat's). */
  status?: string;
  /** A skill's footing. */
  skill?: SkillStatus;
  /** How a reason it relies on is drawn: its line and how solid it reads. */
  dash?: string;
  opacity?: number;
  /** Wants your attention: a skill you lack, a reason the exceptions outweigh. */
  warn?: boolean;
  /** What it opens in the inspector. */
  ref?: EntityRef;
}

/** Every answer an option gives, in the order of its bands. */
export function answersOf(data: AtlasData, p: StrategicPath): Answer[] {
  const out: Answer[] = [];
  const add = (kind: AnswerKind, text: string, extra: Partial<Answer> = {}) =>
    out.push({ key: `${p.id}:${kind}:${out.length}`, pathId: p.id, kind, band: BAND_OF[kind], text, ...extra });
  p.requirements.forEach((x) => add('requirement', x));
  p.dependencies.forEach((x) => add('dependency', x));
  if (p.capital) add('capital', p.capital);
  if (p.time) add('time', p.time);
  p.skills.forEach((s) => add('skill', s.label, { skill: s.status, status: SKILL_STATUS_LABEL[s.status], warn: s.status === 'gap' }));
  p.risks.forEach((x) => add('risk', x));
  p.tradeoffs.forEach((x) => add('tradeoff', x));
  p.opportunityCosts.forEach((x) => add('cost', x));
  p.unknowns.forEach((x) => add('unknown', x));
  for (const id of p.assumptionIds) {
    const c = data.claims[id];
    if (!c) continue;
    const status = claimStatus(data, c);
    const meta = STATUS_META[status];
    add('assumption', claimSentence(data, c, status), {
      status: meta.label,
      dash: meta.dash,
      opacity: meta.opacity,
      warn: status === 'weakened' || status === 'retired',
      ref: { kind: 'claim', id },
    });
  }
  for (const id of p.experimentIds) {
    const x = data.experiments[id];
    if (!x) continue;
    add('test', `${experimentCode(x.code)} ${x.title}`, { status: EXPERIMENT_STATUS_LABEL[x.status], ref: { kind: 'experiment', id } });
  }
  p.proposedExperiments.forEach((x) => add('idea', x));
  for (const id of p.patternIds) {
    const pat = data.patterns[id];
    if (!pat || pat.setAside) continue;
    add('repeat', patternTitle(pat), { status: REGULARITY_LABEL[patternStats(data, pat).regularity], ref: { kind: 'pattern', id } });
  }
  return out;
}
