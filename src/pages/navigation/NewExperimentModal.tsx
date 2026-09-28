import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel } from '../../components/ui/primitives';
import { pathCode, patternCode } from '../../domain/selectors';
import type { Stance } from '../../domain/types';
import { lines } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';

export function NewExperimentModal({ onClose }: { onClose(): void }) {
  const data = useAtlas((s) => s.data);
  const add = useAtlas((s) => s.addExperiment);
  const open = useUI((s) => s.openEntity);
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [design, setDesign] = useState('');
  const [days, setDays] = useState(30);
  const [measures, setMeasures] = useState('');
  const [patternId, setPatternId] = useState('');
  const [ifSupported, setIfSupported] = useState<Stance>('supports');
  const [pathId, setPathId] = useState('');
  const valid = title.trim() && hypothesis.trim();

  const save = () => {
    if (!valid) return;
    const id = add({
      title: title.trim(),
      hypothesis: hypothesis.trim(),
      design: design.trim(),
      durationDays: Math.max(1, days),
      status: 'proposed',
      measures: lines(measures).map((label, i) => ({ id: `m${i + 1}`, label })),
      patternLinks: patternId ? [{ patternId, ifSupported }] : [],
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
      title="New experiment"
      description="A small, time-boxed test. Phrase the hypothesis so a result could contradict it."
      width="max-w-[600px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Add experiment
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div>
            <FieldLabel htmlFor="x-title">Title</FieldLabel>
            <input id="x-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Commitment cap" />
          </div>
          <div>
            <FieldLabel htmlFor="x-days">Days</FieldLabel>
            <input id="x-days" type="number" min={1} className="field num" value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="x-hyp">Hypothesis</FieldLabel>
          <input id="x-hyp" className="field" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="I may… / If I…, then…" />
        </div>
        <div>
          <FieldLabel htmlFor="x-design">Experiment</FieldLabel>
          <textarea
            id="x-design"
            className="field min-h-[64px]"
            value={design}
            onChange={(e) => setDesign(e.target.value)}
            placeholder="What you will do differently, and for how long"
          />
        </div>
        <div>
          <FieldLabel htmlFor="x-measures" hint="one per line">
            Measures
          </FieldLabel>
          <textarea
            id="x-measures"
            className="field min-h-[72px]"
            value={measures}
            onChange={(e) => setMeasures(e.target.value)}
            placeholder={'Completion rate\nFocus hours per week\nStress (1–5)'}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="x-pattern" hint="optional">
              Tests pattern
            </FieldLabel>
            <select id="x-pattern" className="field" value={patternId} onChange={(e) => setPatternId(e.target.value)}>
              <option value="">None</option>
              {Object.values(data.patterns)
                .filter((p) => p.status !== 'dismissed')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {patternCode(p.code)} · {p.chain[0]}
                  </option>
                ))}
            </select>
            {patternId && (
              <select
                className="field mt-1.5"
                value={ifSupported}
                onChange={(e) => setIfSupported(e.target.value as Stance)}
                aria-label="If the hypothesis holds"
              >
                <option value="supports">A supported hypothesis supports the pattern</option>
                <option value="counters">A supported hypothesis counters the pattern</option>
              </select>
            )}
          </div>
          <div>
            <FieldLabel htmlFor="x-path" hint="optional">
              Informs path
            </FieldLabel>
            <select id="x-path" className="field" value={pathId} onChange={(e) => setPathId(e.target.value)}>
              <option value="">None</option>
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
