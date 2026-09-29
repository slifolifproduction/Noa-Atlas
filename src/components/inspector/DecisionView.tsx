import { Check, Pencil } from 'lucide-react';
import { useState } from 'react';
import { OUTCOME_RATING_LABEL } from '../../domain/constants';
import { decisionCode, decisionHorizon, patternCode, usagesOfSource } from '../../domain/selectors';
import type { ID, OutcomeRating } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { StanceMark } from '../evidence/EvidenceRow';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Segmented } from '../ui/primitives';
import { Muted, PanelSection } from './parts';

const HORIZON_LABEL = { immediate: 'Near-term drivers', long_term: 'Long-term drivers', neutral: 'Mixed drivers' } as const;

export function DecisionView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const d = data.decisions[id];
  const deleteDecision = useAtlas((s) => s.deleteDecision);
  const openCapture = useUI((s) => s.openCapture);
  const open = useUI((s) => s.openEntity);
  const back = useUI((s) => s.back);
  if (!d) return null;
  const usages = usagesOfSource(data, { kind: 'decision', id });
  const horizon = decisionHorizon(d);

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="label">{decisionCode(d.seq)}</span>
          <span className="num ml-auto text-[11.5px] text-ink-3">{formatDate(d.date, { year: true })}</span>
        </div>
        <h2 className="mt-2 display text-[21px] leading-[1.2] text-ink">{d.title}</h2>
        {d.context && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{d.context}</p>}
        <div className="mt-3 flex items-center gap-1.5">
          <Button size="sm" icon={Pencil} onClick={() => openCapture('decision', { kind: 'decision', id })}>
            Edit
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

      <PanelSection title="Options considered" count={d.options.length}>
        <ol className="space-y-2">
          {d.options.map((o) => {
            const chosen = o.id === d.chosenOptionId;
            return (
              <li key={o.id} className={cn('rounded-[2px] border px-2.5 py-2', chosen ? 'border-accent/40 bg-accent-dim/40' : 'border-line')}>
                <div className="flex items-center gap-2 text-[13px] text-ink">
                  {chosen && <Check size={13} className="shrink-0 text-accent" aria-label="Chosen" />}
                  {o.label}
                </div>
                {o.rationale && <p className="mt-0.5 text-[12.5px] text-ink-2">{o.rationale}</p>}
              </li>
            );
          })}
        </ol>
      </PanelSection>

      <PanelSection title="Chosen action">
        <p className="text-[13px] text-ink">{d.chosenAction || <span className="text-ink-3">Not recorded.</span>}</p>
        {d.optimizingFor.length > 0 && (
          <p className="mt-2 text-[12px] text-ink-3">
            Optimising for{' '}
            {d.optimizingFor.map((x, i) => (
              <span key={x}>
                <span className="text-ink-2">{x}</span>
                {i < d.optimizingFor.length - 1 ? ', ' : ''}
              </span>
            ))}
            <span className="ml-1.5 rounded-[2px] border border-line px-1 text-[10.5px]">{HORIZON_LABEL[horizon]}</span>
          </p>
        )}
      </PanelSection>

      <PanelSection title="Expected outcome">
        <p className="text-[13px] text-ink-2">{d.expectedOutcome || <span className="text-ink-3">Not recorded.</span>}</p>
      </PanelSection>

      <OutcomeSection id={id} />

      <PanelSection title="Evidence in" count={usages.length}>
        {usages.length ? (
          <ul className="space-y-1">
            {usages.map(({ pattern, evidence }) => (
              <li key={pattern.id}>
                <button
                  type="button"
                  onClick={() => open({ kind: 'pattern', id: pattern.id })}
                  className="flex w-full items-start gap-2 rounded-[2px] px-1 py-1 text-left hover:bg-ink/[0.035]"
                >
                  <StanceMark stance={evidence.stance} />
                  <span className="min-w-0">
                    <span className="label block">{patternCode(pattern.code)}</span>
                    <span className="block text-[13px] text-ink-2">{pattern.chain.join(' → ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Muted>Not cited by any pattern yet. Decision patterns are proposed from the Decision log.</Muted>
        )}
      </PanelSection>
    </div>
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
        <PanelSection title="Actual outcome">
          <Muted>Not reviewed yet. Recording what actually happened is what lets decision patterns emerge.</Muted>
          <Button size="sm" className="mt-2" onClick={() => setEditing(true)}>
            Record outcome
          </Button>
        </PanelSection>
      );
    return (
      <PanelSection title="Record outcome">
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
            placeholder="What actually happened?"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            autoFocus
          />
          <div>
            <div className="label mb-1">Compared with what you expected</div>
            <Segmented<OutcomeRating>
              label="Outcome compared with expectation"
              size="sm"
              value={rating}
              onChange={setRating}
              options={(['better', 'as_expected', 'mixed', 'worse'] as const).map((r) => ({
                value: r,
                label: OUTCOME_RATING_LABEL[r].replace(' than expected', ''),
              }))}
            />
          </div>
          <textarea className="field min-h-[56px]" placeholder="What did you learn?" value={learned} onChange={(e) => setLearned(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" type="submit">
              Save outcome
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </PanelSection>
    );
  }
  return (
    <>
      <PanelSection
        title="Actual outcome"
        aside={
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Revise
          </Button>
        }
      >
        <p className="text-[13px] text-ink-2">{d.actualOutcome}</p>
        {d.outcomeRating && <p className="mt-1.5 text-[12px] text-ink-3">{OUTCOME_RATING_LABEL[d.outcomeRating]}</p>}
      </PanelSection>
      <PanelSection title="What I learned">
        <p className="text-[13px] text-ink-2">{d.learned || <span className="text-ink-3">Nothing recorded.</span>}</p>
      </PanelSection>
    </>
  );
}
