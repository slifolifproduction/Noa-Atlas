import { useState } from 'react';
import { AREAS, AREA_META, KIND_META, KINDS_BY_LAYER, LAYERS } from '../../domain/constants';
import type { AreaKey, ElementKind, GraphLayer } from '../../domain/types';
import { inferKind } from '../../domain/ask';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FieldLabel } from '../ui/primitives';
import { t } from '../../i18n';

const PLACEHOLDER: Partial<Record<ElementKind, () => string>> = {
  value: () => t('e.g. Autonomy'),
  belief: () => t('e.g. Good work gets noticed on its own'),
  fear: () => t('e.g. Running out of money'),
  goal: () => t('e.g. Finish my short film'),
  question: () => t('e.g. Why do my projects slip?'),
  behaviour: () => t('e.g. Saying yes to every request'),
  commitment: () => t('e.g. The documentary edit'),
  skill: () => t('e.g. Colour grading'),
  role: () => t('e.g. Freelance producer'),
  state: () => t('e.g. Energy'),
  person: () => t('e.g. My sister'),
  resource: () => t('e.g. Savings'),
  place: () => t('e.g. The studio'),
};

/**
 * Add something to the map: a name and an area are enough. What kind of
 * thing it is (which decides its ring) is guessed from the name and shown,
 * so it can be corrected in one tap.
 */
export function AddNodeModal({
  layer = 'orbit',
  onClose,
  defaultArea,
  defaultKind,
}: {
  layer?: GraphLayer;
  onClose(): void;
  defaultArea?: AreaKey;
  defaultKind?: ElementKind;
}) {
  const addNode = useAtlas((s) => s.addNode);
  const openEntity = useUI((s) => s.openEntity);
  const requestFocus = useUI((s) => s.requestFocus);
  const [area, setArea] = useState<AreaKey>(defaultArea ?? 'projects');
  const [chosen, setChosen] = useState<ElementKind | null>(defaultKind ?? null);
  const [picking, setPicking] = useState(false);
  const [label, setLabel] = useState('');
  const [summary, setSummary] = useState('');
  const [concern, setConcern] = useState(false);
  const kind = chosen ?? inferKind(label, 'goal');

  const submit = () => {
    if (!label.trim()) return;
    const id = addNode({ label, summary, area, kind, concern: concern || undefined });
    openEntity({ kind: 'node', id });
    setTimeout(() => requestFocus(layer, id), 60);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Add to the map')}
      description={t('Something in your life: something you hold, something you do, or something around you.')}
      width="max-w-[500px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!label.trim()}>
            {t('Add')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <FieldLabel htmlFor="add-label">{t('Name')}</FieldLabel>
          <input
            id="add-label"
            className="field"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={PLACEHOLDER[kind]?.() ?? ''}
            autoFocus
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-area">{t('Area of life')}</FieldLabel>
          <select id="add-area" className="field" value={area} onChange={(e) => setArea(e.target.value as AreaKey)}>
            {AREAS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        {picking ? (
          <div>
            <FieldLabel htmlFor="add-kind">{t('What kind of thing')}</FieldLabel>
            <select id="add-kind" className="field" value={kind} onChange={(e) => setChosen(e.target.value as ElementKind)} autoFocus>
              {LAYERS.map((l) => (
                <optgroup key={l.key} label={l.label}>
                  {KINDS_BY_LAYER[l.key].map((k) => (
                    <option key={k} value={k}>
                      {KIND_META[k].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="mt-1.5 text-[12px] text-ink-3">
              {KIND_META[kind].description} {area === 'self' ? t('It sits in the centre, with you.') : AREA_META[area].description}
            </p>
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-3">
            {label.trim()
              ? t('It goes on the map as a {kind}.', { kind: KIND_META[kind].label.toLowerCase() })
              : t('The Atlas guesses what kind of thing it is from the name.')}{' '}
            <button type="button" className="tap text-accent hover:underline" onClick={() => setPicking(true)}>
              {t('Change')}
            </button>
          </p>
        )}
        <div>
          <FieldLabel htmlFor="add-summary" hint="optional">
            {t('Description')}
          </FieldLabel>
          <textarea id="add-summary" className="field min-h-[64px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <label className="tap flex items-start gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" className="mt-[3px]" checked={concern} onChange={(e) => setConcern(e.target.checked)} />
          <span>{t('Something I want explained or changed')}</span>
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
