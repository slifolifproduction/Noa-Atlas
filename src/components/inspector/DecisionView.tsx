import { Check, Pencil, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { claimCode, claimSentence, claimsTouching } from '../../domain/claims';
import { OUTCOME_RATING_LABEL } from '../../domain/constants';
import { windowAfter } from '../../domain/history';
import { decisionCode, decisionHorizon, patternCode, patternTitle, usagesOfSource } from '../../domain/selectors';
import type { Decision, ID, OutcomeRating } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { StanceMark } from '../evidence/EvidenceRow';
import { KnowledgeTag } from '../evidence/Status';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Segmented } from '../ui/primitives';
import { ClaimRow, HistoryRow, Muted, NodeChip, PanelSection } from './parts';
import { t } from '../../i18n';

const HORIZON_LABEL = {
  get immediate() {
    return t('Near-term drivers');
  },
  get long_term() {
    return t('Long-term drivers');
  },
  get neutral() {
    return t('Mixed drivers');
  },
};

/**
 * A decision as a branch point: the options that were seen, the one lived and
 * the ones not taken. Deciding, doing, what followed, judging the result and
 * explaining it are kept apart, and a good decision can still turn out badly.
 */
export function DecisionView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const d = data.decisions[id];
  const deleteDecision = useAtlas((s) => s.deleteDecision);
  const update = useAtlas((s) => s.updateDecision);
  const openCapture = useUI((s) => s.openCapture);
  const open = useUI((s) => s.openEntity);
  const back = useUI((s) => s.back);
  const followed = useMemo(
    () =>
      d
        ? windowAfter(data, d.date, 56)
            .filter((h) => h.key !== `dec:${id}`)
            .slice(0, 6)
        : [],
    [data, d, id],
  );
  if (!d) return null;
  const usages = usagesOfSource(data, { kind: 'decision', id });
  const horizon = decisionHorizon(d);
  const chosen = d.options.find((o) => o.id === d.chosenOptionId);
  const notTaken = d.options.filter((o) => o.id !== d.chosenOptionId);

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="label">{decisionCode(d.seq)}</span>
          <span className="num ml-auto text-[11.5px] text-ink-3">{formatDate(d.date, { year: true })}</span>
          <KnowledgeTag kind="recorded" />
        </div>
        <h2 className="mt-2 display text-[21px] leading-[1.2] text-ink">{d.title}</h2>
        {d.context && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{d.context}</p>}
        {d.nodeIds.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {d.nodeIds.map((n) => (
              <NodeChip key={n} id={n} />
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-1.5">
          <Button size="sm" icon={Pencil} onClick={() => openCapture('decision', { kind: 'decision', id })}>
            {t('Edit')}
          </Button>
          <span className="ml-auto">
            <ConfirmButton
              onConfirm={() => {
                deleteDecision(id);
                back();
              }}
            />
          </span>
        </div>
      </div>

      <PanelSection title={t('The branches')} count={d.options.length}>
        <ol className="space-y-2">
          {chosen && (
            <li className="rounded-[2px] border border-accent/40 bg-accent-dim/40 px-2.5 py-2">
              <div className="flex items-center gap-2 text-[13px] text-ink">
                <Check size={13} className="shrink-0 text-accent" aria-hidden />
                {chosen.label}
                <span className="ml-auto font-mono text-[10px] tracking-wide text-ink-3 uppercase">{t('Lived')}</span>
              </div>
              {chosen.rationale && <p className="mt-0.5 text-[12.5px] text-ink-2">{chosen.rationale}</p>}
              {chosen.expected && (
                <p className="mt-1 text-[12px] text-ink-3">
                  {t('Expected then')}: <span className="text-ink-2">{chosen.expected}</span>
                </p>
              )}
            </li>
          )}
          {notTaken.map((o) => (
            <li key={o.id} className="rounded-[2px] border border-dashed border-line px-2.5 py-2">
              <div className="flex items-center gap-2 text-[13px] text-ink-2">
                {o.label}
                <span className="ml-auto font-mono text-[10px] tracking-wide text-ink-3 uppercase">{t('Not taken')}</span>
              </div>
              {o.rationale && <p className="mt-0.5 text-[12.5px] text-ink-3">{o.rationale}</p>}
              {o.expected && (
                <p className="mt-1 text-[12px] text-ink-3">
                  {t('Expected then')}: <span className="text-ink-2">{o.expected}</span>
                </p>
              )}
              <ImaginedField decision={d} optionId={o.id} />
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11.5px] text-ink-3">
          {t('Branches not taken are possibilities. What might have happened there is imagined, and never counts as evidence.')}
        </p>
      </PanelSection>

      <PanelSection title={t('Why this one')}>
        <p className="text-[13px] text-ink">{d.chosenAction || <span className="text-ink-3">{t('Not recorded.')}</span>}</p>
        {d.optimizingFor.length > 0 && (
          <p className="mt-2 text-[12px] text-ink-3">
            {t('Optimising for')}{' '}
            {d.optimizingFor.map((x, i) => (
              <span key={x}>
                <span className="text-ink-2">{t(x)}</span>
                {i < d.optimizingFor.length - 1 ? ', ' : ''}
              </span>
            ))}
            <span className="ml-1.5 rounded-[2px] border border-line px-1 text-[10.5px]">{HORIZON_LABEL[horizon]}</span>
          </p>
        )}
        <p className="mt-1.5 text-[11.5px] text-ink-3">{t('Your stated reasons at the time.')}</p>
      </PanelSection>

      <PanelSection title={t('Carried out?')}>
        <Segmented<NonNullable<Decision['enacted']> | 'unknown'>
          label={t('Carried out?')}
          size="sm"
          value={d.enacted ?? 'unknown'}
          onChange={(v) => update(id, { enacted: v === 'unknown' ? undefined : v })}
          options={[
            { value: 'unknown', label: '—' },
            { value: 'yes', label: t('Yes') },
            { value: 'partly', label: t('Partly') },
            { value: 'no', label: t('No') },
          ]}
        />
        <p className="mt-1.5 text-[11.5px] text-ink-3">{t('Deciding and doing are different: a decision not carried out says little about the choice.')}</p>
      </PanelSection>

      <PanelSection title={t('What you expected')}>
        <p className="text-[13px] text-ink-2">{d.expectedOutcome || <span className="text-ink-3">{t('Not recorded.')}</span>}</p>
      </PanelSection>

      <OutcomeSection id={id} />

      {followed.length > 0 && (
        <PanelSection title={t('What followed')} count={followed.length}>
          <ul className="-mx-1.5">
            {followed.map((h) => (
              <HistoryRow key={h.key} item={h} />
            ))}
          </ul>
          <p className="mt-1 text-[11.5px] text-ink-3">{t('Eight weeks after, from the timeline. Following is not the same as caused by.')}</p>
        </PanelSection>
      )}

      <ProcessSection decision={d} />
      <ExplanationSection decision={d} />

      <PanelSection title={t('Cited as evidence')} count={usages.length}>
        {usages.length ? (
          <ul className="space-y-1">
            {usages.map(({ pattern, claim, evidence }) => (
              <li key={evidence.id}>
                <button
                  type="button"
                  onClick={() => open(pattern ? { kind: 'pattern', id: pattern.id } : { kind: 'claim', id: claim!.id })}
                  className="flex w-full items-start gap-2 rounded-[2px] px-1 py-1 text-left hover:bg-ink/[0.035]"
                >
                  <StanceMark stance={evidence.stance} />
                  <span className="min-w-0">
                    <span className="label block">{pattern ? patternCode(pattern.code) : claimCode(claim!.code)}</span>
                    <span className="block text-[13px] text-ink-2">{pattern ? patternTitle(pattern) : claimSentence(data, claim!)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Muted>{t('Not cited by any claim or pattern yet.')}</Muted>
        )}
      </PanelSection>
    </div>
  );
}

/** What might have happened on a branch not taken: imagined afterwards, kept as possibility. */
function ImaginedField({ decision, optionId }: { decision: Decision; optionId: ID }) {
  const update = useAtlas((s) => s.updateDecision);
  const option = decision.options.find((o) => o.id === optionId)!;
  const [draft, setDraft] = useState(option.imagined ?? '');
  const [editing, setEditing] = useState(false);
  if (!editing && !option.imagined)
    return (
      <button type="button" className="mt-1 text-[11.5px] text-ink-3 hover:text-ink" onClick={() => setEditing(true)}>
        + {t('What might have happened?')}
      </button>
    );
  if (!editing)
    return (
      <p className="mt-1 text-[12px] text-ink-3 italic">
        <KnowledgeTag kind="imagined" className="mr-1.5 not-italic" />
        {option.imagined}
        <button type="button" className="ml-1.5 not-italic text-ink-3 hover:text-ink" aria-label={t('Edit')} onClick={() => setEditing(true)}>
          <Pencil size={11} className="inline" aria-hidden />
        </button>
      </p>
    );
  return (
    <form
      className="mt-1.5 flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        update(decision.id, { options: decision.options.map((o) => (o.id === optionId ? { ...o, imagined: draft.trim() || undefined } : o)) });
        setEditing(false);
      }}
    >
      <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Imagined, not known')} autoFocus />
      <Button size="sm" type="submit" icon={Check} aria-label={t('Save')} />
    </form>
  );
}

/** The decision judged by what was knowable then, apart from how it turned out. */
function ProcessSection({ decision: d }: { decision: Decision }) {
  const update = useAtlas((s) => s.updateDecision);
  const [process, setProcess] = useState(d.processNote ?? '');
  const [next, setNext] = useState(d.nextTime ?? '');
  return (
    <PanelSection title={t('Judging the decision')}>
      <p className="text-[11.5px] text-ink-3">
        {t('By what you knew and could have known then, not by the result. A good decision can turn out badly, and a poor one well.')}
      </p>
      <textarea
        className="field mt-1.5 min-h-[56px]"
        value={process}
        onChange={(e) => setProcess(e.target.value)}
        onBlur={() => process !== (d.processNote ?? '') && update(d.id, { processNote: process.trim() || undefined })}
        placeholder={t('Was the information enough? Were the options wide enough? Was it rushed?')}
      />
      <label className="mt-2.5 block">
        <span className="label">{t('Next time')}</span>
        <input
          className="field mt-1"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          onBlur={() => next !== (d.nextTime ?? '') && update(d.id, { nextTime: next.trim() || undefined })}
          placeholder={t('If … then I will …')}
        />
      </label>
    </PanelSection>
  );
}

/** Claims that may explain how it turned out. Explanations, not verdicts. */
function ExplanationSection({ decision: d }: { decision: Decision }) {
  const data = useAtlas((s) => s.data);
  const update = useAtlas((s) => s.updateDecision);
  const [adding, setAdding] = useState(false);
  const candidates = useMemo(() => {
    const ids = new Set<ID>();
    for (const n of d.nodeIds) for (const c of claimsTouching(data, n)) if (c.state === 'adopted' && !d.claimIds.includes(c.id)) ids.add(c.id);
    return [...ids];
  }, [data, d]);
  return (
    <PanelSection
      title={t('What may explain how it turned out')}
      count={d.claimIds.length}
      aside={
        candidates.length > 0 && (
          <Button size="sm" variant="ghost" icon={adding ? X : Plus} onClick={() => setAdding(!adding)}>
            {adding ? t('Done') : t('Add')}
          </Button>
        )
      }
    >
      {d.claimIds.length ? (
        <ul className="-mx-1.5">
          {d.claimIds.map((c) => (
            <li key={c} className="flex items-start">
              <ul className="min-w-0 flex-1">
                <ClaimRow id={c} />
              </ul>
              <button
                type="button"
                className="mt-1.5 rounded-[2px] p-1 text-ink-3 hover:text-ink"
                aria-label={t('Remove')}
                onClick={() => update(d.id, { claimIds: d.claimIds.filter((x) => x !== c) })}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>{t('No explanation attached. Which claims might account for how it went?')}</Muted>
      )}
      {adding && (
        <ul className={cn('mt-2 space-y-1')}>
          {candidates.map((c) => (
            <li key={c}>
              <button
                type="button"
                className="flex items-start gap-1.5 text-left text-[12.5px] text-ink-2 hover:text-ink"
                onClick={() => update(d.id, { claimIds: [...d.claimIds, c] })}
              >
                <Plus size={12} className="mt-[3px] shrink-0" aria-hidden />
                {claimSentence(data, data.claims[c]!)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

function OutcomeSection({ id }: { id: ID }) {
  const d = useAtlas((s) => s.data.decisions[id]);
  const update = useAtlas((s) => s.updateDecision);
  const [editing, setEditing] = useState(false);
  const [actual, setActual] = useState(d?.actualOutcome ?? '');
  const [rating, setRating] = useState<OutcomeRating>(d?.outcomeRating ?? 'as_expected');
  const [learned, setLearned] = useState(d?.learned ?? '');
  if (!d) return null;

  if (editing || !d.actualOutcome) {
    if (!editing)
      return (
        <PanelSection title={t('What actually happened')}>
          <Muted>{t('Not reviewed yet. Recording what actually happened is what lets decision patterns emerge.')}</Muted>
          <Button size="sm" className="mt-2" onClick={() => setEditing(true)}>
            {t('Record outcome')}
          </Button>
        </PanelSection>
      );
    return (
      <PanelSection title={t('Record outcome')}>
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            update(id, { actualOutcome: actual.trim(), outcomeRating: rating, learned: learned.trim() || undefined, reviewedAt: new Date().toISOString() });
            setEditing(false);
          }}
        >
          <textarea
            className="field min-h-[64px]"
            placeholder={t('What actually happened?')}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            autoFocus
          />
          <div>
            <div className="label mb-1">{t('Compared with what you expected')}</div>
            <Segmented<OutcomeRating>
              label={t('Outcome compared with expectation')}
              size="sm"
              value={rating}
              onChange={setRating}
              options={(['better', 'as_expected', 'mixed', 'worse'] as const).map((r) => ({
                value: r,
                label: OUTCOME_RATING_LABEL[r].replace(' than expected', ''),
              }))}
            />
          </div>
          <textarea className="field min-h-[56px]" placeholder={t('What did you learn?')} value={learned} onChange={(e) => setLearned(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" type="submit">
              {t('Save outcome')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('Cancel')}
            </Button>
          </div>
        </form>
      </PanelSection>
    );
  }
  return (
    <>
      <PanelSection
        title={t('What actually happened')}
        aside={
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t('Revise')}
          </Button>
        }
      >
        <p className="text-[13px] text-ink-2">{d.actualOutcome}</p>
        {d.outcomeRating && <p className="mt-1.5 text-[12px] text-ink-3">{OUTCOME_RATING_LABEL[d.outcomeRating]}</p>}
      </PanelSection>
      <PanelSection title={t('What I learned')}>
        <p className="text-[13px] text-ink-2">{d.learned || <span className="text-ink-3">{t('Nothing recorded.')}</span>}</p>
      </PanelSection>
    </>
  );
}
