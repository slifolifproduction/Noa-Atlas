import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import type { ModelUpdateProposal } from '../../ai/types';
import { pct } from '../../domain/confidence';
import { experimentCode, patternCode } from '../../domain/selectors';
import type { Experiment, ExperimentOutcome, ExperimentResult } from '../../domain/types';
import { useAtlas } from '../../state/atlasStore';
import { reviewExperimentResult } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { StanceMark } from '../evidence/EvidenceRow';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FieldLabel, Segmented } from '../ui/primitives';

const OUTCOMES: { value: ExperimentOutcome; label: string }[] = [
  { value: 'supports', label: 'Supported' },
  { value: 'contradicts', label: 'Contradicted' },
  { value: 'inconclusive', label: 'Inconclusive' },
];

/**
 * Hypothesis → experiment → result → learning → model update.
 * The update is previewed before anything changes, and the user applies it.
 */
export function ResultModal({ experiment, onClose }: { experiment: Experiment; onClose(): void }) {
  const updateExperiment = useAtlas((s) => s.updateExperiment);
  const apply = useAtlas((s) => s.applyExperimentResult);
  const busy = useUI((s) => s.busy[`review:${experiment.id}`]);
  const data = useAtlas((s) => s.data);
  const [outcome, setOutcome] = useState<ExperimentOutcome>('supports');
  const [summary, setSummary] = useState('');
  const [learning, setLearning] = useState('');
  const [measures, setMeasures] = useState(() => Object.fromEntries(experiment.measures.map((m) => [m.id, m.result ?? ''])));
  const [proposal, setProposal] = useState<ModelUpdateProposal | null>(null);

  const result = (): ExperimentResult => ({ outcome, summary: summary.trim(), learning: learning.trim(), recordedAt: new Date().toISOString() });

  const preview = async () => {
    updateExperiment(experiment.id, { measures: experiment.measures.map((m) => ({ ...m, result: measures[m.id] || undefined })) });
    setProposal(await reviewExperimentResult({ ...experiment, measures: experiment.measures.map((m) => ({ ...m, result: measures[m.id] })) }, result()));
  };

  const confirm = () => {
    if (!proposal) return;
    apply(experiment.id, result(), proposal);
    toast(`${experimentCode(experiment.code)} completed. ${proposal.changes.length ? 'The model was updated.' : 'No pattern changed.'}`, { tone: 'success' });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record result · ${experimentCode(experiment.code)}`}
      description={experiment.hypothesis}
      footer={
        proposal ? (
          <>
            <Button variant="ghost" onClick={() => setProposal(null)}>
              Back
            </Button>
            <Button variant="primary" onClick={confirm}>
              Apply update
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={preview} loading={busy} disabled={!summary.trim()} icon={ArrowRight}>
              Preview model update
            </Button>
          </>
        )
      }
    >
      {!proposal ? (
        <div className="space-y-4">
          <div>
            <FieldLabel>Was the hypothesis supported?</FieldLabel>
            <Segmented label="Outcome" value={outcome} onChange={setOutcome} options={OUTCOMES} />
          </div>
          {experiment.measures.length > 0 && (
            <div>
              <FieldLabel>Measures</FieldLabel>
              <div className="divide-y divide-line rounded-[8px] border border-line">
                {experiment.measures.map((m) => (
                  <label key={m.id} className="grid grid-cols-[1fr_auto_120px] items-center gap-3 px-3 py-2">
                    <span className="text-[12.5px] text-ink-2">{m.label}</span>
                    <span className="num text-[11px] text-ink-3">
                      {m.baseline ? `${m.baseline} → ` : ''}
                      {m.target ?? ''}
                    </span>
                    <input
                      className="field py-1"
                      value={measures[m.id]}
                      onChange={(e) => setMeasures({ ...measures, [m.id]: e.target.value })}
                      placeholder="Result"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <FieldLabel htmlFor="res-summary">What happened</FieldLabel>
            <textarea
              id="res-summary"
              className="field min-h-[72px]"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="The facts, briefly. This text becomes the evidence excerpt."
            />
          </div>
          <div>
            <FieldLabel htmlFor="res-learning">What you learned</FieldLabel>
            <textarea
              id="res-learning"
              className="field min-h-[56px]"
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
              placeholder="What would you do differently, or keep doing?"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-ink-2">{proposal.learningNote}</p>
          {proposal.changes.length ? (
            <ul className="divide-y divide-line rounded-[8px] border border-line">
              {proposal.changes.map((c) => {
                const p = data.patterns[c.patternId];
                return (
                  <li key={c.patternId} className="flex items-start gap-3 px-3 py-2.5">
                    <StanceMark stance={c.stance} />
                    <div className="min-w-0 flex-1">
                      <div className="label">{p ? patternCode(p.code) : 'Pattern'}</div>
                      <div className="text-[13px] text-ink">{p?.chain.join(' → ')}</div>
                      <div className="mt-0.5 text-[12px] text-ink-3">
                        Added as {c.stance === 'supports' ? 'supporting evidence' : 'counter-evidence'}, weight {c.weight}
                      </div>
                    </div>
                    <div className="num shrink-0 text-right text-[13px] text-ink">
                      {pct(c.before)} <span className="text-ink-3">→</span> {pct(c.after)}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-[8px] border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-3">No pattern confidence will change.</p>
          )}
          {proposal.interpretationNotes.length > 0 && (
            <div>
              <FieldLabel>Suggested interpretation notes</FieldLabel>
              <ul className="space-y-1 text-[12.5px] text-ink-2">
                {proposal.interpretationNotes.map((n) => (
                  <li key={n.patternId}>{n.statement}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
