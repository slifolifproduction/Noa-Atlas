import { ExternalLink, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { sampleErrorText } from '../../ai/account';
import { checkKey, maskedKey, MODELS, useOwnKey, type ModelId } from '../../ai/ownKey';
import { t } from '../../i18n';
import { Trans } from '../../i18n/Trans';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { FieldLabel } from '../ui/primitives';

const CONSOLE = 'https://console.anthropic.com/settings/keys';

type Status = { kind: 'idle' } | { kind: 'checking' } | { kind: 'saved' } | { kind: 'error'; message: string };

/**
 * Claude on the person's own Anthropic API key (ai/ownKey.ts), for the Atlas opened outside claude.ai: where to get a
 * key, the key itself (checked before it is kept), the model, and who pays for what Claude reads.
 */
export function OwnKeyPanel({ id }: { id?: string }) {
  const { key, model, save, forget, choose } = useOwnKey();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const add = async () => {
    const value = draft.trim();
    if (!value) return;
    if (!value.startsWith('sk-ant-')) return setStatus({ kind: 'error', message: t('That does not look like an Anthropic API key: one starts with sk-ant-.') });
    setStatus({ kind: 'checking' });
    const result = await checkKey(value, model);
    if (!result.ok) return setStatus({ kind: 'error', message: sampleErrorText(result.error.code, result.error.message) });
    save(value);
    setDraft('');
    setStatus({ kind: 'saved' });
  };

  return (
    <div className="space-y-4">
      {key ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-line p-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <KeyRound size={16} strokeWidth={1.7} aria-hidden className="shrink-0 text-ink-3" />
            <div className="min-w-0">
              <div className="truncate font-mono text-[12.5px] text-ink">{maskedKey(key)}</div>
              <div className="text-[12px] leading-snug text-ink-3">{t('The agent, the analysis and the weekly review can ask Claude with it.')}</div>
            </div>
          </div>
          <ConfirmButton
            label={t('Remove the key')}
            confirmLabel={t('Remove it')}
            onConfirm={() => {
              forget();
              setStatus({ kind: 'idle' });
            }}
          />
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <FieldLabel htmlFor={id ?? 'own-key'}>{t('Your Anthropic API key')}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <input
              id={id ?? 'own-key'}
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="field num max-w-[360px] flex-1"
              placeholder="sk-ant-…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (status.kind === 'error') setStatus({ kind: 'idle' });
              }}
            />
            <Button type="submit" loading={status.kind === 'checking'} disabled={!draft.trim()}>
              {t('Save and check')}
            </Button>
          </div>
        </form>
      )}
      <p role="status" aria-live="polite" className={cn('text-[12.5px] empty:hidden', status.kind === 'error' ? 'text-counter' : 'text-support')}>
        {status.kind === 'saved' ? t('The key works. Claude can answer here now.') : status.kind === 'error' ? status.message : ''}
      </p>

      <div>
        <FieldLabel htmlFor="own-key-model">{t('Model')}</FieldLabel>
        <select id="own-key-model" className="field max-w-[360px]" value={model} onChange={(e) => choose(e.target.value as ModelId)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {`${m.name}: ${m.note()}`}
            </option>
          ))}
        </select>
      </div>

      <ul className="space-y-1.5 text-[12px] leading-snug text-ink-3">
        <li>
          <Trans
            text={t('Get a key at {console}. What Claude reads is billed to that Anthropic account, not to anyone else: set a monthly spend limit there.')}
            values={{
              console: (
                <a
                  href={CONSOLE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap inline-flex items-center gap-1 text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  console.anthropic.com
                  <ExternalLink size={11} strokeWidth={1.8} aria-hidden />
                </a>
              ),
            }}
          />
        </li>
        <li>
          {t(
            'The key is kept in this browser only, never in your atlas, its exports or its versions, and is sent only to Anthropic. Anyone using this browser can use it: remove it on a shared device.',
          )}
        </li>
        <li>{t('With a key, the agent on Auto answers with Claude. Choose “On this device” in the agent to keep a conversation free.')}</li>
      </ul>
    </div>
  );
}
