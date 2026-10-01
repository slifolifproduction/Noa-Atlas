import { useState } from 'react';
import { navigate } from '../../app/router';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel, Segmented } from '../../components/ui/primitives';
import type { PatternKind } from '../../domain/types';
import { lines } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';
import { t } from '../../i18n';

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
      steps: steps
        .map((x) => x.trim())
        .filter(Boolean)
        .map((label) => ({ label })),
      observation: observation.trim(),
      triggers: lines(triggers),
      behaviors: lines(behaviors),
      consequences: lines(consequences),
      // With no phrases of its own, the names of its steps find it in what you write.
      cues: {
        supports: splitPhrases(supports).length ? splitPhrases(supports) : steps.map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 4),
        counters: splitPhrases(counters),
      },
      areas: [],
    });
    onClose();
    navigate('patterns', id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Describe a pattern')}
      description={t(
        'Something you suspect keeps happening. It starts with no instances; it becomes a regularity only as you attach the notes and decisions where it happened.',
      )}
      width="max-w-[640px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {t('Add pattern')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel hint={t('short names')}>{t('Trigger → behaviour → consequence')}</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-3">
            {[t('e.g. New request'), t('e.g. Immediate yes'), t('e.g. Overload')].map((ph, i) => (
              <input
                key={ph}
                className="field"
                value={steps[i]}
                placeholder={ph}
                aria-label={[t('Trigger'), t('Behaviour'), t('Consequence')][i]}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="dp-obs">{t('What you have noticed')}</FieldLabel>
          <textarea
            id="dp-obs"
            className="field min-h-[64px]"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder={t('Describe the behaviour, not a trait: “I tend to…”, “When X happens, I…”')}
          />
        </div>
        <details className="rounded-[2px] border border-line px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] text-ink-2 hover:text-ink">{t('More details')}</summary>
          <div className="mt-3 space-y-4">
            <Segmented<PatternKind>
              label={t('Kind')}
              value={kind}
              onChange={setKind}
              options={[
                { value: 'behavioral', label: t('Behavioural') },
                { value: 'cognitive', label: t('Cognitive') },
                { value: 'decision', label: t('Decision') },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel htmlFor="dp-tr" hint={t('one per line')}>
                  {t('Triggers')}
                </FieldLabel>
                <textarea id="dp-tr" className="field min-h-[72px] text-[12.5px]" value={triggers} onChange={(e) => setTriggers(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="dp-be" hint={t('one per line')}>
                  {t('Behaviour')}
                </FieldLabel>
                <textarea id="dp-be" className="field min-h-[72px] text-[12.5px]" value={behaviors} onChange={(e) => setBehaviors(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="dp-co" hint={t('one per line')}>
                  {t('Consequences')}
                </FieldLabel>
                <textarea id="dp-co" className="field min-h-[72px] text-[12.5px]" value={consequences} onChange={(e) => setConsequences(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="dp-sup" hint={t('comma separated')}>
                  {t('Phrases that would support it')}
                </FieldLabel>
                <input id="dp-sup" className="field" value={supports} onChange={(e) => setSupports(e.target.value)} placeholder={t('said yes, took on')} />
              </div>
              <div>
                <FieldLabel htmlFor="dp-cnt" hint={t('comma separated')}>
                  {t('Phrases that would count against it')}
                </FieldLabel>
                <input id="dp-cnt" className="field" value={counters} onChange={(e) => setCounters(e.target.value)} placeholder={t('declined, said no')} />
              </div>
            </div>
            <p className="text-[12px] text-ink-3">
              {t('Notes that use these phrases are connected to it as they are saved, and you can take any back. With none, the names of its steps are used.')}
            </p>
          </div>
        </details>
      </div>
    </Modal>
  );
}
