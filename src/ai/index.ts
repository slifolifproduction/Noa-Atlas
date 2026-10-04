import { localAIProvider } from './localAIProvider';
import { localProvider } from './localProvider';
import type { AnalysisProvider, ProviderId } from './types';
import { accountLabel } from './access';
import { t } from '../i18n';

export interface ProviderSettings {
  provider: ProviderId;
  endpoint: string;
  /** The local AI may use its language model (downloaded once, with your say-so). */
  localModel?: boolean;
  /** Where to download the language model from, when not Hugging Face (a mirror, or your own copy). */
  modelHost?: string;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = { provider: 'local', endpoint: '/api/analysis' };

/**
 * Resolve the active provider. A Claude provider falls back to the local
 * heuristics per call when the proxy is unreachable, and reports that it did.
 */
// The Claude provider (and Zod, which validates its output) loads only when selected.
let claudeModule: Promise<typeof import('./claudeProvider')> | null = null;
const loadClaude = () => (claudeModule ??= import('./claudeProvider'));

export function resolveProvider(settings: ProviderSettings, onFallback?: (error: unknown) => void): AnalysisProvider {
  if (settings.provider === 'local-ai') return localAIProvider;
  if (settings.provider !== 'claude' && settings.provider !== 'account') return localProvider;
  const account = settings.provider === 'account';
  const withFallback = <K extends keyof AnalysisProvider>(key: K) =>
    (async (...args: unknown[]) => {
      try {
        const mod = await loadClaude();
        const claude = account ? mod.createAccountProvider() : mod.createClaudeProvider(settings.endpoint);
        return await (claude[key] as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (error) {
        onFallback?.(error);
        return (localProvider[key] as (...a: unknown[]) => Promise<unknown>)(...args);
      }
    }) as AnalysisProvider[K];
  return {
    id: settings.provider,
    label: account ? accountLabel() : t('Claude'),
    analyzeEntry: withFallback('analyzeEntry'),
    detectDecisionPatterns: withFallback('detectDecisionPatterns'),
    proposeExperiments: withFallback('proposeExperiments'),
    evaluateExperiment: withFallback('evaluateExperiment'),
    draftNavigationPlan: withFallback('draftNavigationPlan'),
  };
}

export type { AnalysisProvider, ProviderId } from './types';
