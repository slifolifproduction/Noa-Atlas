/**
 * How Claude is reached from here, if at all: on the viewer's claude.ai account (inside claude.ai's viewer, signed
 * in), or on the person's own Anthropic API key (anywhere else, once they add one in Settings). The account comes
 * first where both could answer; the key is offered only outside claude.ai.
 */
import { t } from '../i18n';
import { capability, type Sample } from '../runtime/claude';
import { useAccount, type AccountState } from '../state/accountStore';
import { keySample, useOwnKey } from './ownKey';

export type ClaudeVia = 'account' | 'key' | 'checking' | null;

export function claudeVia(account: AccountState['claude'], key: string): ClaudeVia {
  if (account === 'available') return 'account';
  if (key) return 'key';
  return account === 'checking' ? 'checking' : null;
}

/** For a component: re-rendered when either changes. */
export function useClaudeVia(): ClaudeVia {
  const account = useAccount((s) => s.claude);
  const key = useOwnKey((s) => s.key);
  return claudeVia(account, key);
}

export const claudeViaNow = (): ClaudeVia => claudeVia(useAccount.getState().claude, useOwnKey.getState().key);

/** Whether Claude can be asked from here now. */
export const claudeReady = () => {
  const via = claudeViaNow();
  return via === 'account' || via === 'key';
};

/** Claude, as the agent, the analysis and the review ask it: claude.ai's own, else the person's key, else none. */
export async function claudeHere(): Promise<Sample | null> {
  const sample = await capability('sample');
  if (sample) return sample;
  const { key, model } = useOwnKey.getState();
  return key ? keySample(key, model) : null;
}

/** The analysis provider's name, by how Claude is reached. */
export const accountLabel = () => (claudeViaNow() === 'key' ? t('Claude (your API key)') : t('Claude (your account)'));
