import type { AnalysisProvider } from './types';
import { analyzeEntryLocally } from './localAnalysis';
import { localProvider } from './localProvider';

/**
 * The local AI (src/ml): the local rules first, then what the models on this device read in the note, added to
 * them. It reads with the built-in model straight away, and with the language model once it is downloaded and
 * has learned (Settings). The rest (patterns across decisions, tests, plans) is the local rules'.
 */
export const localAIProvider: AnalysisProvider = {
  ...localProvider,
  id: 'local-ai',
  label: 'Local AI',
  analyzeEntry: async (entry, data) => {
    const base = analyzeEntryLocally(entry, data);
    try {
      const { readWithAI } = await import('../ml/reader');
      return await readWithAI(entry, data, base);
    } catch {
      // If the models cannot read here, the rules still have.
      return base;
    }
  },
};
