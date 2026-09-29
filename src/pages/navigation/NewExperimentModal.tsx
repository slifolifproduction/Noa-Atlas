import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel } from '../../components/ui/primitives';
import { activeClaims, claimCode, claimSentence } from '../../domain/claims';
import { pathCode, patternCode, patternTitle, sortedPatterns } from '../../domain/selectors';
import type { ID } from '../../domain/types';
import { lines } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { t } from '../../i18n';

/**
 * A test: change one thing on purpose, keep recording, and compare with a
 * prediction written down before starting. Its result becomes intervention
 * evidence on the claim it tests.
 */
export function NewExperimentModal({ onClose, claimId: initialClaim = '' }: { onClose(): void; claimId?: ID }) {
  const data = useAtlas((s) => s.data);
  const add = useAtlas((s) => s.addExperiment);
  const open = useUI((s) => s.openEntity);
  const [claimId, setClaimId] = useState<ID>(initialClaim);
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState(() => (initialClaim && data.claims[initialClaim] ? claimSentence(data, data.claims[initialClaim]!) : ''));
  const [design, setDesign] = useState('');
  const [prediction, setPrediction] = useState('');
  const [criteria, setCriteria] = useState('');
  const [baseline, setBaseline] = useState('');
  const [days, setDays] = useState(30);
  const [measures, setMeasures] = useState('');
  const [patternId, setPatternId] = useState('');
  const [pathId, setPathId] = useState('');
  const valid = title.trim() && hypothesis.trim() && prediction.trim();

  const save = () => {
    if (!valid) return;
    const id = add({
      title: title.trim(),
      hypothesis: hypothesis.trim(),
      design: design.trim(),
      durationDays: Math.max(1, days),
      status: 'proposed',
      claimId: claimId || undefined,
      prediction: prediction.trim(),
      criteria: criteria.trim() || undefined,
      baseline: baseline.trim() || undefined,
      measures: lines(measures).map((label, i) => ({ id: `m${i + 1}`, label })),
      patternIds: patternId ? [patternId] : [],
      pathIds: pathId ? [pathId] : [],
      questionIds: [],
    });
    open({ kind: 'experiment', id });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('New test')}
      description={t('Change one thing on purpose, keep recording, and write down beforehand what should happen if the claim holds.')}
      width="max-w-[620px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {t('Add test')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <FieldLabel htmlFor="x-claim" hint="optional">
            {t('The claim it tests')}
          </FieldLabel>
          <select
            id="x-claim"
            className="field"
            value={claimId}
            onChange={(e) => {
              setClaimId(e.target.value);
              const c = data.claims[e.target.value];
              if (c && !hypothesis.trim()) setHypothesis(claimSentence(data, c));
            }}
          >
            <option value="">{t('None')}</option>
            {activeClaims(data)
              .filter((c) => !c.retired)
              .sort((a, b) => a.code - b.code)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {claimCode(c.code)} · {claimSentence(data, c)}
                </option>
              ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div>
            <FieldLabel htmlFor="x-title">{t('Title')}</FieldLabel>
            <input id="x-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. Commitment cap')} />
          </div>
          <div>
            <FieldLabel htmlFor="x-days">{t('Days')}</FieldLabel>
            <input id="x-days" type="number" min={1} className="field num" value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="x-hyp">{t('Hypothesis')}</FieldLabel>
          <input id="x-hyp" className="field" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder={t('I may… / If I…, then…')} />
        </div>
        <div>
          <FieldLabel htmlFor="x-design">{t('What changes on purpose')}</FieldLabel>
          <textarea
            id="x-design"
            className="field min-h-[56px]"
            value={design}
            onChange={(e) => setDesign(e.target.value)}
            placeholder={t('One thing you will do differently, and for how long. Keep everything else as it is.')}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="x-pred">{t('Prediction')}</FieldLabel>
            <textarea
              id="x-pred"
              className="field min-h-[56px]"
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              placeholder={t('If the claim holds, what will you see?')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="x-crit" hint="optional">
              {t('It did not work if')}
            </FieldLabel>
            <textarea
              id="x-crit"
              className="field min-h-[56px]"
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder={t('The result that would count against the claim')}
            />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="x-base" hint="optional">
            {t('How things are now')}
          </FieldLabel>
          <input
            id="x-base"
            className="field"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
            placeholder={t('The baseline to compare against')}
          />
        </div>
        <div>
          <FieldLabel htmlFor="x-measures" hint={t('one per line')}>
            {t('Measures')}
          </FieldLabel>
          <textarea
            id="x-measures"
            className="field min-h-[64px]"
            value={measures}
            onChange={(e) => setMeasures(e.target.value)}
            placeholder={t('Completion rate\nFocus hours per week\nStress (1–5)')}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="x-pattern" hint="optional">
              {t('Also bears on pattern')}
            </FieldLabel>
            <select id="x-pattern" className="field" value={patternId} onChange={(e) => setPatternId(e.target.value)}>
              <option value="">{t('None')}</option>
              {sortedPatterns(data).map((p) => (
                <option key={p.id} value={p.id}>
                  {patternCode(p.code)} · {patternTitle(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="x-path" hint="optional">
              {t('Informs option')}
            </FieldLabel>
            <select id="x-path" className="field" value={pathId} onChange={(e) => setPathId(e.target.value)}>
              <option value="">{t('None')}</option>
              {Object.values(data.paths).map((p) => (
                <option key={p.id} value={p.id}>
                  {pathCode(p.code)} · {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}
