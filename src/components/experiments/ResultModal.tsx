import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import type { ModelUpdateProposal } from '../../ai/types';
import { claimCode, claimSentence } from '../../domain/claims';
import { experimentCode } from '../../domain/selectors';
import type { Experiment, ExperimentOutcome, ExperimentResult } from '../../domain/types';
import { useAtlas } from '../../state/atlasStore';
import { reviewExperimentResult } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { StanceMark } from '../evidence/EvidenceRow';
import { StatusBadge } from '../evidence/Status';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FieldLabel, Segmented } from '../ui/primitives';
import { t } from '../../i18n';

const OUTCOMES: { value: ExperimentOutcome; label: string }[] = [
  {
    value: 'supports',
    get label() {
      return t('As predicted');
    },
  },
  {
    value: 'contradicts',
    get label() {
      return t('Not as predicted');
    },
  },
  {
    value: 'inconclusive',
    get label() {
      return t('Inconclusive');
    },
  },
];

/**
 * Predict → test → compare → revise. The result is compared with the
 * prediction written beforehand; what it would change on the claim is
 * previewed before anything changes, and the person applies it.
 */
export function ResultModal({ experiment, onClose }: { experiment: Experiment; onClose(): void }) {
  const updateExperiment = useAtlas((s) => s.updateExperiment);
  const apply = useAtlas((s) => s.applyExperimentResult);
  const busy = useUI((s) => s.busy[`review:${experiment.id}`]);
  const data = useAtlas((s) => s.data);
  const [outcome, setOutcome] = useState<ExperimentOutcome>('supports');
  const [summary, setSummary] = useState('');
  const [learning, setLearning] = useState('');
  const [sideEffects, setSideEffects] = useState('');
  const [measures, setMeasures] = useState(() => Object.fromEntries(experiment.measures.map((m) => [m.id, m.result ?? ''])));
  const [proposal, setProposal] = useState<ModelUpdateProposal | null>(null);

  const result = (): ExperimentResult => ({
    outcome,
    summary: summary.trim(),
    learning: learning.trim(),
    sideEffects: sideEffects.trim() || undefined,
    recordedAt: new Date().toISOString(),
  });

  const preview = async () => {
    updateExperiment(experiment.id, { measures: experiment.measures.map((m) => ({ ...m, result: measures[m.id] || undefined })) });
    setProposal(await reviewExperimentResult({ ...experiment, measures: experiment.measures.map((m) => ({ ...m, result: measures[m.id] })) }, result()));
  };

  const confirm = () => {
    if (!proposal) return;
    apply(experiment.id, result(), proposal);
    toast(
      t(proposal.changes.length ? '{code} completed. The claim was updated.' : '{code} completed. No claim changed.', {
        code: experimentCode(experiment.code),
      }),
      { tone: 'success' },
    );
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Record result · {code}', { code: experimentCode(experiment.code) })}
      description={experiment.hypothesis}
      footer={
        proposal ? (
          <>
            <Button variant="ghost" onClick={() => setProposal(null)}>
              {t('Back')}
            </Button>
            <Button variant="primary" onClick={confirm}>
              {t('Apply update')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={preview} loading={busy} disabled={!summary.trim()} icon={ArrowRight}>
              {t('Preview model update')}
            </Button>
          </>
        )
      }
    >
      {!proposal ? (
        <div className="space-y-4">
          {experiment.prediction && (
            <div className="rounded-[2px] border border-line px-3 py-2">
              <div className="label">{t('You predicted')}</div>
              <p className="mt-0.5 text-[13px] text-ink-2">{experiment.prediction}</p>
              {experiment.criteria && <p className="mt-1 text-[12px] text-ink-3">{t('It did not work if: {c}', { c: experiment.criteria })}</p>}
            </div>
          )}
          <div>
            <FieldLabel>{t('Compared with the prediction')}</FieldLabel>
            <Segmented label={t('Outcome')} value={outcome} onChange={setOutcome} options={OUTCOMES} />
          </div>
          {experiment.measures.length > 0 && (
            <div>
              <FieldLabel>{t('Measures')}</FieldLabel>
              <div className="divide-y divide-line rounded-[2px] border border-line">
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
                      placeholder={t('Result')}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <FieldLabel htmlFor="res-summary">{t('What happened')}</FieldLabel>
            <textarea
              id="res-summary"
              className="field min-h-[72px]"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t('The facts, briefly. This text becomes the evidence excerpt.')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="res-learning">{t('What you learned')}</FieldLabel>
            <textarea
              id="res-learning"
              className="field min-h-[56px]"
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
              placeholder={t('What would you do differently, or keep doing?')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="res-side" hint="optional">
              {t('What else changed')}
            </FieldLabel>
            <input
              id="res-side"
              className="field"
              value={sideEffects}
              onChange={(e) => setSideEffects(e.target.value)}
              placeholder={t('Effects you did not aim for, good or bad')}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-ink-2">{proposal.learningNote}</p>
          {proposal.changes.length ? (
            <ul className="divide-y divide-line rounded-[2px] border border-line">
              {proposal.changes.map((c) => {
                const claim = data.claims[c.claimId];
                return (
                  <li key={c.claimId} className="flex items-start gap-3 px-3 py-2.5">
                    <StanceMark stance={c.stance} />
                    <div className="min-w-0 flex-1">
                      <div className="label">{claim ? claimCode(claim.code) : t('Claim')}</div>
                      <div className="text-[13px] text-ink">{claim ? claimSentence(data, claim, c.before) : ''}</div>
                      <div className="mt-0.5 text-[12px] text-ink-3">
                        {c.stance === 'supports' ? t('Added as a test that went as predicted.') : t('Added as a test that did not go as predicted.')}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={c.before} />
                      <span className="text-[11px] text-ink-3">↓</span>
                      <StatusBadge status={c.after} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-[2px] border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-3">
              {t('This test is not linked to a claim, so no status will change. An inconclusive result changes nothing either.')}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
