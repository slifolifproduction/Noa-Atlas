import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { claimsInto, claimStatus } from '../../domain/claims';
import { expectSentence, READS_LABEL, readingsFor, stateSentence, STATUS_META } from '../../domain/constants';
import { expectationOf, type ExpectationView } from '../../domain/expect';
import { episodeOfItem } from '../../domain/factors';
import { mapElements } from '../../domain/selectors';
import type { FactorReading, ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { Button, IconButton } from '../ui/Button';
import { ClaimRow, HistoryRow, Muted, NodeChip } from './parts';
import { t } from '../../i18n';

/** Choosing a factor and what it did. */
export function FactorReadingPicker({
  factorIds,
  onPick,
  submitLabel,
  defaultFactor,
}: {
  factorIds: ID[];
  onPick(factor: ID, reads: FactorReading): void;
  submitLabel: string;
  defaultFactor?: ID;
}) {
  const data = useAtlas((s) => s.data);
  const [factor, setFactor] = useState<ID>(defaultFactor ?? factorIds[0] ?? '');
  const [reads, setReads] = useState<FactorReading | ''>('');
  const kind = data.nodes[factor]?.kind;
  const options = readingsFor(kind);
  return (
    <div className="space-y-2">
      <select
        className="field"
        value={factor}
        onChange={(e) => {
          setFactor(e.target.value);
          setReads('');
        }}
        aria-label={t('Which element')}
      >
        {factorIds.map((id) => (
          <option key={id} value={id}>
            {data.nodes[id]?.label}
          </option>
        ))}
      </select>
      <div role="radiogroup" aria-label={t('What it did')} className="flex flex-wrap gap-1">
        {options.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reads === r}
            onClick={() => setReads(r)}
            className={cn(
              'rounded-[2px] border px-2 py-0.5 text-[12px]',
              reads === r ? 'border-ink/50 bg-ink/[0.07] text-ink' : 'border-line text-ink-3 hover:text-ink',
            )}
          >
            {READS_LABEL[r]}
          </button>
        ))}
      </div>
      <Button size="sm" disabled={!factor || !reads} onClick={() => reads && onPick(factor, reads)}>
        {submitLabel}
      </Button>
    </div>
  );
}

/** Elements to offer first: what the happening concerns, then the rest of the map's states and behaviours. */
function factorChoices(data: ReturnType<typeof useAtlas.getState>['data'], first: ID[]): ID[] {
  const rest = mapElements(data)
    .filter((n) => (n.kind === 'state' || n.kind === 'behaviour') && !first.includes(n.id))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((n) => n.id);
  return [...first.filter((id) => data.nodes[id]), ...rest];
}

/**
 * What changed, as written with a happening: which element went up or down,
 * was high or low, happened or did not. This is what the Atlas compares;
 * that a note is about something says nothing about which way it went.
 */
export function ChangeEditor({ occurrenceId }: { occurrenceId: ID }) {
  const data = useAtlas((s) => s.data);
  const setChanges = useAtlas((s) => s.setOccurrenceChanges);
  const o = data.occurrences[occurrenceId];
  const [adding, setAdding] = useState(false);
  const choices = useMemo(() => (o ? factorChoices(data, [...(o.instanceOf ? [o.instanceOf] : []), ...o.about]) : []), [data, o]);
  if (!o) return null;
  const changes = o.changes ?? [];
  return (
    <div>
      {changes.length ? (
        <ul className="space-y-1">
          {changes.map((c) => (
            <li key={c.factor} className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <NodeChip id={c.factor} />
              <span>{READS_LABEL[c.reads].toLowerCase()}</span>
              <IconButton
                icon={X}
                size="sm"
                label={t('Remove')}
                className="ml-auto"
                onClick={() =>
                  setChanges(
                    occurrenceId,
                    changes.filter((x) => x.factor !== c.factor),
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <Muted>
          {t('Nothing says which way things went here. The Atlas compares what changed, not what was mentioned, so this happening does not count yet.')}
        </Muted>
      )}
      <div className="mt-2">
        {adding ? (
          <FactorReadingPicker
            factorIds={choices}
            submitLabel={t('Add')}
            onPick={(factor, reads) => {
              setChanges(occurrenceId, [...changes.filter((x) => x.factor !== factor), { factor, reads }]);
              setAdding(false);
            }}
          />
        ) : (
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
            {t('Say what changed')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The episode a happening belongs to, and the person's say over it. */
export function EpisodeSection({ occurrenceId }: { occurrenceId: ID }) {
  const data = useAtlas((s) => s.data);
  const keepApart = useAtlas((s) => s.keepApart);
  const regroup = useAtlas((s) => s.regroup);
  const o = data.occurrences[occurrenceId];
  const episode = episodeOfItem(data, `occ:${occurrenceId}`);
  if (!o || !episode) return null;
  const others = episode.items.filter((h) => h.key !== `occ:${occurrenceId}` && !h.key.startsWith('energy:'));
  return (
    <div>
      <p className="text-[12px] text-ink-3">
        {others.length
          ? t('One episode with these ({range}). Everything in one episode counts once.', {
              range: episode.from === episode.until ? formatDate(episode.from) : `${formatDate(episode.from)} – ${formatDate(episode.until)}`,
            })
          : t('An episode of its own.')}
      </p>
      {others.length > 0 && (
        <ul className="-mx-1.5 mt-1">
          {others.slice(0, 6).map((h) => (
            <HistoryRow key={h.key} item={h} />
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {o.episode ? (
          <Button size="sm" variant="ghost" onClick={() => regroup(occurrenceId)}>
            {t('Let the Atlas group it again')}
          </Button>
        ) : (
          others.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => keepApart(occurrenceId)} title={t('It was a separate thing: count it on its own.')}>
              {t('Keep it apart')}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

const VERDICT_LABEL = {
  get held() {
    return t('It held');
  },
  get failed() {
    return t('It did not hold');
  },
  get unobserved() {
    return t('Nothing was recorded to tell');
  },
  get open() {
    return t('Still open');
  },
};

/** One expectation as a line: what was expected, by when, and how it went. */
export function ExpectationLine({ view }: { view: ExpectationView }) {
  const data = useAtlas((s) => s.data);
  const name = data.nodes[view.factor]?.label ?? '';
  return (
    <span className="block text-[12.5px] leading-snug text-ink-2">
      {expectSentence(name, view.reads)}
      <span className="text-ink-3">
        {' '}
        · {t('by {date}', { date: formatDate(view.until) })} ·{' '}
        <span className={cn(view.verdict === 'held' ? 'text-ink' : '')}>{VERDICT_LABEL[view.verdict]}</span>
        {!view.writtenBefore && ` · ${t('written after it began')}`}
      </span>
    </span>
  );
}

/** An expectation: what should happen, what it rests on, and what the record says so far. */
export function ExpectationPanel({ occurrenceId }: { occurrenceId: ID }) {
  const data = useAtlas((s) => s.data);
  const setVerdict = useAtlas((s) => s.setExpectationVerdict);
  const view = expectationOf(data, occurrenceId);
  if (!view) return null;
  const name = data.nodes[view.factor]?.label ?? '';
  const chain = view.basis.length > 1;
  const least = chain ? view.basis.reduce((a, b) => (STATUS_META[claimStatus(data, a)].rank <= STATUS_META[claimStatus(data, b)].rank ? a : b)) : undefined;
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-snug text-ink">
        {t('Expected: {what}, between {from} and {until}.', {
          what: expectSentence(name, view.reads),
          from: formatDate(view.from),
          until: formatDate(view.until),
        })}
      </p>
      <p className="text-[12px] text-ink-3">
        {view.writtenBefore
          ? t('Written down before its window began, so it can count.')
          : t('Written down after its window began: it is shown, but it does not count for or against anything.')}
      </p>
      <div>
        <div className="label mb-1">{t('How it went')}</div>
        <p className="text-[12.5px] text-ink-2">
          {VERDICT_LABEL[view.verdict]}
          {view.by === 'you' ? ` (${t('your verdict')})` : ''}
          {view.shownBy &&
            ` · ${t('{what}, {date}', { what: stateSentence(data.nodes[view.shownBy.factor]?.label ?? '', view.shownBy.reads), date: formatDate(view.shownBy.date) })}`}
        </p>
        {view.verdict === 'open' && view.shownBy && (
          <p className="mt-0.5 text-[11.5px] text-ink-3">{t('So far it went the other way; the window is still open.')}</p>
        )}
        {view.verdict === 'unobserved' && (
          <p className="mt-0.5 text-[11.5px] text-ink-3">{t('Not recorded is not the same as not happening: this counts neither way.')}</p>
        )}
        {view.occurrence.expectation?.verdict?.note && <p className="mt-0.5 text-[12px] text-ink-2">“{view.occurrence.expectation.verdict.note}”</p>}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(['held', 'failed', 'unobserved'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view.by === 'you' && view.verdict === v}
              onClick={() => setVerdict(occurrenceId, view.by === 'you' && view.verdict === v ? null : v)}
              className={cn(
                'rounded-[2px] border px-1.5 py-0.5 text-[11.5px]',
                view.by === 'you' && view.verdict === v ? 'border-ink/50 bg-ink/[0.07] text-ink' : 'border-line text-ink-3 hover:text-ink',
              )}
            >
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>
      </div>
      {view.basis.length > 0 && (
        <div>
          <div className="label mb-1">{chain ? t('It rests on these together') : t('It rests on')}</div>
          <ul className="-mx-1.5">
            {view.basis.map((c) => (
              <ClaimRow key={c.id} id={c.id} />
            ))}
          </ul>
          <p className="mt-1 text-[11.5px] text-ink-3">
            {chain
              ? t(
                  'A chain is checked together. If it fails, one of these did not hold, and the Atlas cannot tell which: test the least certain first ({claim}).',
                  {
                    claim: data.nodes[least!.from]?.label ?? '',
                  },
                )
              : t('One reason: a direct check of it. If it holds it strengthens the reason; if it fails it counts against it.')}
          </p>
        </div>
      )}
    </div>
  );
}

/** Other possible reasons into an element, to offer as the basis of an expectation. */
export const reasonsInto = (data: ReturnType<typeof useAtlas.getState>['data'], id: ID) => claimsInto(data, id).filter((c) => !c.retired);
