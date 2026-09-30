import { useMemo } from 'react';
import { STATUS_META } from '../../domain/constants';
import { DEFAULT_SUPPORTED_EPISODES } from '../../domain/claims';
import { INQUIRY_KIND_LABEL } from '../../domain/inquiry';
import { calibration, learnedWords, ruleProposal, suggestionRank, type SuggestionType } from '../../domain/learning';
import type { ClaimStatus } from '../../domain/types';
import { formatDate, useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { t, tn } from '../../i18n';

const SUGGESTION_LABEL: Record<SuggestionType, () => string> = {
  link_node: () => t('Elements a note is about'),
  pattern_evidence: () => t('A note fitting a repeat'),
  area: () => t('Areas of life'),
  occurrence: () => t('Happenings to add to Time'),
  attribution: () => t('Your own explanations'),
  change: () => t('What a note says changed'),
  expectation: () => t('What a note expects'),
};

const WHERE_LABEL: Record<string, () => string> = {
  search: () => t('Search'),
  map: () => t('Map'),
  causes: () => t('Causes'),
  time: () => t('Time'),
};

const STATUS_ORDER: ClaimStatus[] = ['tested', 'supported', 'plausible', 'proposed', 'weakened', 'retired'];

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="label mb-1.5">{title}</div>
      {children}
    </div>
  );
}

/**
 * What the Atlas learned from you, in plain counts: the suggestions you take
 * and set aside, the words you use for things, how its predictions went (and
 * the stricter rule it proposes when "supported" has not earned its name),
 * and the questions you put away. Everything here can be forgotten.
 */
export function LearnedPanel() {
  const data = useAtlas((s) => s.data);
  const setRule = useAtlas((s) => s.setSupportedEpisodes);
  const forgetWord = useAtlas((s) => s.forgetWord);
  const forgetLearning = useAtlas((s) => s.forgetLearning);
  const today = useToday();
  const mem = data.learning;
  const kinds = (Object.entries(mem?.suggestions ?? {}) as [SuggestionType, { taken: number; dismissed: number }][]).filter(
    ([, c]) => c.taken + c.dismissed >= 3,
  );
  const words = useMemo(() => learnedWords(data).slice(0, 10), [data]);
  const cal = useMemo(() => calibration(data, today).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)), [data, today]);
  const proposal = useMemo(() => ruleProposal(data, today), [data, today]);
  const rule = mem?.rules?.supportedEpisodes;
  const declined = Object.entries(mem?.declined ?? {}).filter(([, n]) => (n ?? 0) > 0) as [keyof typeof INQUIRY_KIND_LABEL, number][];
  const friction = [...(mem?.friction ?? [])].reverse().slice(0, 8);
  const nothing = !kinds.length && !words.length && !cal.length && !declined.length && !rule && !friction.length;

  return (
    <div className="text-[12.5px] leading-snug">
      {nothing && (
        <p className="text-ink-3">
          {t(
            'Nothing yet. It learns from the suggestions you take or set aside, the notes you link to elements, how its predictions turn out, and the questions you put away.',
          )}
        </p>
      )}

      {kinds.length > 0 && (
        <Part title={t('Suggestions you take and set aside')}>
          <ul className="space-y-1">
            {kinds.map(([type, c]) => {
              const r = suggestionRank(data, type);
              return (
                <li key={type} className="flex flex-wrap items-baseline gap-x-2 text-ink-2">
                  <span className="text-ink">{SUGGESTION_LABEL[type]()}</span>
                  <span className="text-ink-3">{t('taken {a}, set aside {b}', { a: c.taken, b: c.dismissed })}</span>
                  <span className="text-ink-3">· {r > 0.5 ? t('shown first') : r < 0.5 ? t('shown later') : t('shown as usual')}</span>
                </li>
              );
            })}
          </ul>
        </Part>
      )}

      {words.length > 0 && (
        <Part title={t('Your words for things')}>
          <ul className="space-y-1">
            {words.map((w) => (
              <li key={`${w.nodeId}:${w.word}`} className="flex flex-wrap items-baseline gap-x-2 text-ink-2">
                <span className="text-ink">“{w.word}”</span>
                <span>→ {data.nodes[w.nodeId]?.label}</span>
                <span className="text-ink-3">· {tn(w.notes, 'one note', '{n} notes')}</span>
                <button type="button" className="text-[11.5px] text-ink-3 hover:text-ink" onClick={() => forgetWord(w.nodeId, w.word)}>
                  {t('Forget')}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-3">{t('A note that uses one of these words gets the element suggested, with the count as its reason.')}</p>
        </Part>
      )}

      {(cal.length > 0 || rule) && (
        <Part title={t('How its predictions went')}>
          <ul className="space-y-1">
            {cal.map((c) => (
              <li key={c.status} className="text-ink-2">
                <span className="text-ink">{STATUS_META[c.status].label}</span>{' '}
                <span className="text-ink-3">{t('held {a}, did not hold {b}', { a: c.held, b: c.failed })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-3">{t('Read by the status its reasons had on the day each prediction was written down.')}</p>
          {proposal && (
            <div className="mt-2.5 rounded-[2px] border border-line p-2.5">
              <p className="text-ink">
                {t(
                  'Predictions from “supported” reasons held {a} times and did not hold {b} times. Should “supported” ask for {to} separate episodes instead of {from}?',
                  {
                    a: proposal.held,
                    b: proposal.failed,
                    to: proposal.to,
                    from: proposal.from,
                  },
                )}
              </p>
              <p className="mt-1 text-ink-3">{t('Reasons with fewer episodes would read “plausible” until more are recorded. You can go back at any time.')}</p>
              <Button size="sm" variant="primary" className="mt-2" onClick={() => setRule(proposal.to)}>
                {t('Ask for {n}', { n: proposal.to })}
              </Button>
            </div>
          )}
          {rule && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-ink-2">
                {t('“Supported” asks for {n} separate episodes (you set this on {date}).', { n: rule, date: formatDate(mem?.rules?.since) })}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setRule(undefined)}>
                {t('Back to {n}', { n: DEFAULT_SUPPORTED_EPISODES })}
              </Button>
            </div>
          )}
        </Part>
      )}

      {declined.length > 0 && (
        <Part title={t('Questions you put away')}>
          <ul className="space-y-1">
            {declined.map(([kind, n]) => (
              <li key={kind} className="text-ink-2">
                <span className="text-ink">{INQUIRY_KIND_LABEL[kind]()}</span>{' '}
                <span className="text-ink-3">
                  · {tn(n, 'once', '{n} times')}
                  {n >= 3 ? ` · ${t('asked after the others')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Part>
      )}

      {friction.length > 0 && (
        <Part title={t('Looked for and not found')}>
          <ul className="space-y-1">
            {friction.map((f) => (
              <li key={`${f.where}:${f.q}`} className="text-ink-2">
                <span className="text-ink">“{f.q}”</span>{' '}
                <span className="text-ink-3">
                  · {WHERE_LABEL[f.where]?.() ?? f.where} · {tn(f.n, 'once', '{n} times')} · {formatDate(f.last)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-3">{t('Kept so the app can be improved where it falls short: the words searched for and where, nothing else.')}</p>
        </Part>
      )}

      {!nothing && (
        <div className="mt-4">
          <ConfirmButton label={t('Forget what it learned')} confirmLabel={t('Forget it all')} onConfirm={forgetLearning} />
          <p className="mt-1 text-[11.5px] text-ink-3">{t('Rules you changed stay; your notes and elements are not touched.')}</p>
        </div>
      )}
    </div>
  );
}
