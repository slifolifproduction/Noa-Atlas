import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AREAS, EFFECTS, KIND_META, LINKS } from '../../domain/constants';
import { mapElements } from '../../domain/selectors';
import type { Effect, ID, LinkType } from '../../domain/types';
import { t } from '../../i18n';
import { useAtlas, type NewEvidence } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/primitives';

/** Every element on the map, grouped by area, for picking one side of a claim or link. */
export function ElementSelect({ value, onChange, exclude, label, id }: { value: ID; onChange(id: ID): void; exclude?: ID; label: string; id?: string }) {
  const data = useAtlas((s) => s.data);
  const elements = mapElements(data).filter((n) => n.id !== exclude);
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} required>
      <option value="">{t('Choose…')}</option>
      {AREAS.map((a) => {
        const list = elements.filter((n) => n.area === a.key).sort((x, y) => x.label.localeCompare(y.label));
        return list.length ? (
          <optgroup key={a.key} label={a.label}>
            {list.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} · {KIND_META[n.kind].label.toLowerCase()}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

/**
 * State a claim: "A raises / lowers / triggers… B". It starts as proposed; the
 * record moves it up. When it comes from a note (an explanation in the
 * person's own words), that passage is kept as its first instance.
 */
export function ClaimComposer({
  from: initialFrom = '',
  to: initialTo = '',
  evidence,
  hint,
  onCreated,
  onCancel,
}: {
  from?: ID;
  to?: ID;
  evidence?: NewEvidence;
  hint?: string;
  onCreated?(id: ID): void;
  onCancel(): void;
}) {
  const addClaim = useAtlas((s) => s.addClaim);
  const [from, setFrom] = useState<ID>(initialFrom);
  const [to, setTo] = useState<ID>(initialTo);
  const [effect, setEffect] = useState<Effect>('raises');
  const [via, setVia] = useState('');
  const [when, setWhen] = useState('');
  const ok = from && to && from !== to;
  return (
    <form
      className="space-y-2 rounded-[2px] border border-line bg-raised/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const id = addClaim(
          { from, to, effect, via: via.trim() || undefined, when: when.trim() || undefined, author: 'user', state: 'adopted' },
          evidence ? [evidence] : undefined,
        );
        onCreated?.(id);
      }}
    >
      {hint && <p className="text-[12px] leading-snug text-ink-3">{hint}</p>}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <span className="text-[12px] text-ink-3">{t('This')}</span>
        <ElementSelect value={from} onChange={setFrom} exclude={to} label={t('What acts')} />
        <span className="text-[12px] text-ink-3">{t('may')}</span>
        <select className="field" value={effect} onChange={(e) => setEffect(e.target.value as Effect)} aria-label={t('Effect')}>
          {EFFECTS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label.toLowerCase()}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-ink-3">{t('this')}</span>
        <ElementSelect value={to} onChange={setTo} exclude={from} label={t('What it acts on')} />
      </div>
      <label className="block">
        <span className="label">{t('How, in your words')}</span>
        <input className="field mt-1" value={via} onChange={(e) => setVia(e.target.value)} placeholder={t('The mechanism, e.g. less time for deep work')} />
      </label>
      <label className="block">
        <span className="label">{t('When it holds')}</span>
        <input className="field mt-1" value={when} onChange={(e) => setWhen(e.target.value)} placeholder={t('Optional, e.g. in deadline weeks')} />
      </label>
      {evidence && (
        <p className="text-[12px] text-ink-3">
          “{evidence.excerpt}” — {t('kept as its first instance')}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" icon={Plus} disabled={!ok}>
          {t('Add claim')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Keyboard- and touch-friendly alternative to dragging on the canvas: a claim or a declared link from one element. */
export function ConnectForm({ id, onDone }: { id: ID; onDone(): void }) {
  const addLink = useAtlas((s) => s.addLink);
  const [mode, setMode] = useState<'claim' | 'link'>('claim');
  const [type, setType] = useState<LinkType>('aims_at');
  const [target, setTarget] = useState('');
  return (
    <div className="mt-3 space-y-2">
      <Segmented<'claim' | 'link'>
        label={t('What to add')}
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'claim', label: t('A claim'), title: t('How this changes something else: a hypothesis to check') },
          { value: 'link', label: t('A link'), title: t('How they relate, in your terms: needs no evidence') },
        ]}
      />
      {mode === 'claim' ? (
        <ClaimComposer
          from={id}
          hint={t('It starts as proposed. Add the notes that show it, and it climbs.')}
          onCreated={(cid) => {
            // Opening the new claim shows where its evidence goes next.
            useUI.getState().openEntity({ kind: 'claim', id: cid });
            onDone();
          }}
          onCancel={onDone}
        />
      ) : (
        <form
          className="space-y-2 rounded-[2px] border border-line bg-raised/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!target) return;
            addLink(id, target, type);
            onDone();
          }}
        >
          <div className="grid grid-cols-[64px_1fr] items-center gap-2">
            <span className="text-[12px] text-ink-3">{t('This')}</span>
            <select className="field" value={type} onChange={(e) => setType(e.target.value as LinkType)} aria-label={t('Link')}>
              {LINKS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.verb}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-ink-3">{t('this')}</span>
            <ElementSelect value={target} onChange={setTarget} exclude={id} label={t('Target')} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" type="submit" icon={Plus} disabled={!target}>
              {t('Add link')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              {t('Cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
