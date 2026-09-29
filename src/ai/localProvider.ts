import type { AnalysisProvider } from './types';
import {
  analyzeEntryLocally,
  detectDecisionPatternsLocally,
  draftNavigationPlanLocally,
  evaluateExperimentLocally,
  LOCAL_PROVIDER_LABEL,
  proposeExperimentsLocally,
} from './localAnalysis';

/** A short pause keeps loading states honest; real providers are never instant. */
const settle = <T>(value: T, ms = 320): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

/** Mock provider: deterministic heuristics behind the same async contract as Claude. */
export const localProvider: AnalysisProvider = {
  id: 'local',
  label: LOCAL_PROVIDER_LABEL,
  analyzeEntry: (entry, data) => settle(analyzeEntryLocally(entry, data)),
  detectDecisionPatterns: (data) => settle(detectDecisionPatternsLocally(data)),
  proposeExperiments: (claim, data) => settle(proposeExperimentsLocally(claim, data)),
  evaluateExperiment: (experiment, result, data) => settle(evaluateExperimentLocally(experiment, result, data)),
  draftNavigationPlan: (path, data) => settle(draftNavigationPlanLocally(path, data)),
};
