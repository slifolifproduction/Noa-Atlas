import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { claimsInto, claimStatus } from '../../domain/claims';
import { expectSentence, READS_LABEL, readingsFor, stateSentence, STATUS_META } from '../../domain/constants';
import { expectationOf, type ExpectationView } from '../../domain/expect';
import { episodeOfItem, observedIn } from '../../domain/factors';
import { repairsFor, type ProposedExpectation } from '../../domain/ledger';
import { mapElements } from '../../domain/selectors';
import type { FactorReading, ID, SourceRef } from '../../domain/types';
import { addDays, formatDate, todayISO } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { StatusBadge } from '../evidence/Status';
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
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            {observedIn(data, view.factor, view.from, view.until) === 'silent'
              ? t('Almost nothing at all was written down in that window.')
              : t('{f} was not recorded in that window.', { f: name })}{' '}
            {t('Not recorded is not the same as not happening: this counts neither way.')}
          </p>
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
      {view.verdict === 'failed' && <Repairs view={view} />}
    </div>
  );
}

/**
 * Where the model may be wrong, after an expectation failed: each a question
 * to look into, never applied. Changing a reason makes a new version of it.
 */
function Repairs({ view }: { view: ExpectationView }) {
  const data = useAtlas((s) => s.data);
  const updateClaim = useAtlas((s) => s.updateClaim);
  const addExpectation = useAtlas((s) => s.addExpectation);
  const open = useUI((s) => s.openEntity);
  const { located, chain, repairs } = useMemo(() => repairsFor(data, view), [data, view]);
  if (!repairs.length) return null;
  const name = (id: ID) => data.nodes[id]?.label ?? '';
  return (
    <div>
      <div className="label mb-1">{t('Where the model may be wrong')}</div>
      {located && (
        <p className="mb-1.5 text-[11.5px] text-ink-3">
          {chain
            ? t('Most likely at its least sure step: {claim}.', { claim: data.claims[located.id] ? name(located.from) : '' })
            : t('It rested on one reason, so the failure counts against it.')}
        </p>
      )}
      <ul className="space-y-1.5">
        {repairs.map((r, i) => (
          <li key={`${r.kind}:${i}`} className="text-[12.5px] leading-snug text-ink-2">
            {r.text}
            {r.kind === 'scope' && r.claimId && r.condition && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 block"
                onClick={() => {
                  const c = data.claims[r.claimId!];
                  const next = c.condition
                    ? updateClaim(c.id, { scope: { ...c.scope, also: [...(c.scope?.also ?? []), r.condition!] } })
                    : updateClaim(c.id, { condition: r.condition });
                  if (next !== c.id) open({ kind: 'claim', id: next });
                }}
              >
                {t('Only when {f} is {state}?', { f: name(r.condition.factor), state: r.condition.reads === 'high' ? t('high') : t('low') })}
              </Button>
            )}
            {r.kind === 'timescale' && r.days && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 block"
                onClick={() => {
                  const today = todayISO();
                  const occ = addExpectation({
                    factor: view.factor,
                    reads: view.reads,
                    from: today,
                    until: addDays(today, r.days!),
                    label: view.occurrence.label,
                    basis: view.basis.map((c) => c.id),
                  });
                  open({ kind: 'occurrence', id: occ });
                }}
              >
                {t('Expect it again, over {n} days', { n: r.days })}
              </Button>
            )}
            {r.kind === 'rival' && r.otherClaimId && (
              <Button size="sm" variant="ghost" className="mt-1 block" onClick={() => open({ kind: 'claim', id: r.otherClaimId! })}>
                {t('Open that reason')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the model expects to follow, offered to keep as expectations. Nothing
 * is kept until you keep it, and only what is kept before its window can count.
 */
export function Proposals({ items, source, excerpt }: { items: ProposedExpectation[]; source?: SourceRef; excerpt?: string }) {
  const addExpectation = useAtlas((s) => s.addExpectation);
  const [kept, setKept] = useState<string[]>([]);
  if (!items.length) return <Muted>{t('Nothing on the map follows from this yet, so the model expects nothing.')}</Muted>;
  return (
    <ul className="space-y-1.5">
      {items.map((p) => (
        <li key={p.key} className="rounded-[2px] border border-line p-2">
          <span className="block text-[12.5px] leading-snug text-ink-2">
            {p.label} <span className="text-ink-3">· {t('by {date}', { date: formatDate(p.until) })}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
            <StatusBadge status={p.weakest} />
            {p.ifYouChange === 'tested' ? t('tested') : t('seen, not tested')}
          </span>
          {kept.includes(p.key) ? (
            <span className="mt-1 block text-[11.5px] text-ink-3">{t('Kept: it will be checked against what you record.')}</span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1"
              onClick={() => {
                addExpectation({ factor: p.factor, reads: p.reads, from: p.from, until: p.until, label: p.label, basis: p.basis, source, excerpt });
                setKept([...kept, p.key]);
              }}
            >
              {t('Keep this expectation')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Other possible reasons into an element, to offer as the basis of an expectation. */
export const reasonsInto = (data: ReturnType<typeof useAtlas.getState>['data'], id: ID) => claimsInto(data, id).filter((c) => !c.retired);
