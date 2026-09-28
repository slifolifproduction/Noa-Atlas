import { useState } from 'react';
import { navigate } from '../../app/router';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel, Segmented } from '../../components/ui/primitives';
import type { PatternKind } from '../../domain/types';
import { lines } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';

const splitPhrases = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Describe a pattern you suspect. It starts with no evidence, at the 50% prior. */
export function DescribePatternModal({ onClose }: { onClose(): void }) {
  const addPattern = useAtlas((s) => s.addPattern);
  const [kind, setKind] = useState<PatternKind>('behavioral');
  const [steps, setSteps] = useState(['', '', '']);
  const [observation, setObservation] = useState('');
  const [triggers, setTriggers] = useState('');
  const [behaviors, setBehaviors] = useState('');
  const [consequences, setConsequences] = useState('');
  const [supports, setSupports] = useState('');
  const [counters, setCounters] = useState('');
  const valid = steps[0].trim() && observation.trim();

  const save = () => {
    if (!valid) return;
    const id = addPattern({
      kind,
      chain: steps.map((x) => x.trim()).filter(Boolean),
      observation: observation.trim(),
      triggers: lines(triggers),
      behaviors: lines(behaviors),
      consequences: lines(consequences),
      cues: { supports: splitPhrases(supports), counters: splitPhrases(counters) },
      domains: [],
    });
    onClose();
    navigate('patterns', id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Describe a pattern"
      description="Something you suspect recurs. It enters the model with no evidence; confidence moves only as you attach entries and decisions to it."
      width="max-w-[640px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Add pattern
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented<PatternKind>
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'behavioral', label: 'Behavioural' },
            { value: 'cognitive', label: 'Cognitive' },
            { value: 'decision', label: 'Decision' },
          ]}
        />
        <div>
          <FieldLabel hint="short names">Trigger → behaviour → consequence</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-3">
            {['e.g. New request', 'e.g. Immediate yes', 'e.g. Overload'].map((ph, i) => (
              <input
                key={ph}
                className="field"
                value={steps[i]}
                placeholder={ph}
                aria-label={['Trigger', 'Behaviour', 'Consequence'][i]}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="dp-obs">What you have noticed</FieldLabel>
          <textarea
            id="dp-obs"
            className="field min-h-[64px]"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Describe the behaviour, not a trait: “I tend to…”, “When X happens, I…”"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="dp-tr" hint="one per line">
              Triggers
            </FieldLabel>
            <textarea id="dp-tr" className="field min-h-[72px] text-[12.5px]" value={triggers} onChange={(e) => setTriggers(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="dp-be" hint="one per line">
              Behaviour
            </FieldLabel>
            <textarea id="dp-be" className="field min-h-[72px] text-[12.5px]" value={behaviors} onChange={(e) => setBehaviors(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="dp-co" hint="one per line">
              Consequences
            </FieldLabel>
            <textarea id="dp-co" className="field min-h-[72px] text-[12.5px]" value={consequences} onChange={(e) => setConsequences(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="dp-sup" hint="comma separated">
              Phrases that would support it
            </FieldLabel>
            <input id="dp-sup" className="field" value={supports} onChange={(e) => setSupports(e.target.value)} placeholder="said yes, took on" />
          </div>
          <div>
            <FieldLabel htmlFor="dp-cnt" hint="comma separated">
              Phrases that would count against it
            </FieldLabel>
            <input id="dp-cnt" className="field" value={counters} onChange={(e) => setCounters(e.target.value)} placeholder="declined, said no" />
          </div>
        </div>
        <p className="text-[12px] text-ink-3">The analysis layer uses these phrases to propose evidence from your entries. You review every proposal.</p>
      </div>
    </Modal>
  );
}
