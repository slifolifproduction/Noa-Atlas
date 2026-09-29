import { ChevronDown, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  CAPTURE_KINDS,
  CAPTURE_NODE_TARGET,
  DOMAINS,
  DRIVERS,
  EMOTION_OPTIONS,
  ENERGY_LABELS,
  MOOD_LABELS,
  OUTCOME_RATING_LABEL,
} from '../../domain/constants';
import type { CaptureKind, DecisionOption, DomainKey, EntryKind, OutcomeRating } from '../../domain/types';
import { formatDate, todayISO } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { createId } from '../../lib/ids';
import { nodeTargetLabel, useAtlas } from '../../state/atlasStore';
import { captureDecision, captureEntry } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { CAPTURE_ICONS } from '../icons';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FieldLabel, Kbd, Segmented, ToggleChip } from '../ui/primitives';
import { t, tn } from '../../i18n';

interface Draft {
  kind: CaptureKind;
  title: string;
  content: string;
  date: string;
  domains: DomainKey[];
  tags: string;
  energy?: number;
  mood?: number;
  emotions: string[];
  setting: string;
  addToMap: boolean;
  // decision
  options: DecisionOption[];
  chosenOptionId?: string;
  chosenAction: string;
  expectedOutcome: string;
  optimizingFor: string[];
  actualOutcome: string;
  outcomeRating?: OutcomeRating;
  learned: string;
}

const blankOption = (): DecisionOption => ({ id: createId('opt'), label: '', rationale: '' });

function emptyDraft(kind: CaptureKind): Draft {
  return {
    kind,
    title: '',
    content: '',
    date: todayISO(),
    domains: [],
    tags: '',
    emotions: [],
    setting: '',
    addToMap: true,
    options: [blankOption(), blankOption()],
    chosenAction: '',
    expectedOutcome: '',
    optimizingFor: [],
    actualOutcome: '',
    learned: '',
  };
}

const parseTags = (s: string) => [
  ...new Set(
    s
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean),
  ),
];

/** Quick capture for every kind of record. Fast by default; context is optional. */
export function CaptureModal() {
  const request = useUI((s) => s.capture);
  const close = useUI((s) => s.closeCapture);
  if (!request) return null;
  return <CaptureForm key={`${request.kind}:${request.edit?.id ?? 'new'}`} onClose={close} />;
}

function CaptureForm({ onClose }: { onClose(): void }) {
  const request = useUI((s) => s.capture)!;
  const data = useAtlas((s) => s.data);
  const updateEntry = useAtlas((s) => s.updateEntry);
  const updateDecision = useAtlas((s) => s.updateDecision);
  const editing = request.edit;
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<Draft>(() => {
    if (editing?.kind === 'entry') {
      const e = data.entries[editing.id];
      if (e)
        return {
          ...emptyDraft(e.kind),
          title: e.title,
          content: e.content,
          date: e.date,
          domains: e.domains,
          tags: e.tags.join(', '),
          energy: e.context?.energy,
          mood: e.context?.mood,
          emotions: e.context?.emotions ?? [],
          setting: e.context?.setting ?? '',
          addToMap: false,
        };
    }
    if (editing?.kind === 'decision') {
      const d = data.decisions[editing.id];
      if (d)
        return {
          ...emptyDraft('decision'),
          title: d.title,
          content: d.context,
          date: d.date,
          domains: d.domains,
          tags: d.tags.join(', '),
          options: d.options.length ? d.options : [blankOption()],
          chosenOptionId: d.chosenOptionId,
          chosenAction: d.chosenAction,
          expectedOutcome: d.expectedOutcome,
          optimizingFor: d.optimizingFor,
          actualOutcome: d.actualOutcome ?? '',
          outcomeRating: d.outcomeRating,
          learned: d.learned ?? '',
          addToMap: false,
        };
    }
    return emptyDraft(request.kind);
  });
  const [showContext, setShowContext] = useState(Boolean(draft.energy !== undefined || draft.mood !== undefined || draft.emotions.length));
  // Simple by default: one box. Everything else (type, title, date, domains, tags, context) is one click away.
  const [details, setDetails] = useState(Boolean(editing) || (request.kind !== 'journal' && request.kind !== 'decision'));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const isDecision = draft.kind === 'decision';
  const target = CAPTURE_NODE_TARGET[draft.kind];
  const kindMeta = CAPTURE_KINDS.find((k) => k.key === draft.kind)!;
  // Notes do not need a title: the first line is used.
  const title = draft.title.trim() || (isDecision ? '' : firstLine(draft.content));
  const valid = isDecision ? title.length > 0 : draft.content.trim().length > 0;

  const noteKinds = useMemo(() => CAPTURE_KINDS.filter((k) => k.key !== 'decision'), []);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const context = {
      energy: draft.energy,
      mood: draft.mood,
      emotions: draft.emotions.length ? draft.emotions : undefined,
      setting: draft.setting.trim() || undefined,
    };
    const hasContext = Object.values(context).some((v) => v !== undefined);
    try {
      if (isDecision) {
        const options = draft.options.filter((o) => o.label.trim());
        const payload = {
          title,
          date: draft.date,
          context: draft.content.trim(),
          options,
          chosenOptionId: options.some((o) => o.id === draft.chosenOptionId) ? draft.chosenOptionId : undefined,
          chosenAction: draft.chosenAction.trim() || options.find((o) => o.id === draft.chosenOptionId)?.label || '',
          expectedOutcome: draft.expectedOutcome.trim(),
          optimizingFor: draft.optimizingFor,
          domains: draft.domains,
          tags: parseTags(draft.tags),
        };
        if (editing) {
          updateDecision(editing.id, {
            ...payload,
            actualOutcome: draft.actualOutcome.trim() || undefined,
            outcomeRating: draft.actualOutcome.trim() ? draft.outcomeRating : undefined,
            learned: draft.learned.trim() || undefined,
          });
          toast(t('Decision updated.'), { tone: 'success' });
        } else {
          captureDecision({ ...payload, nodeIds: [] }, { addToMap: draft.addToMap });
        }
      } else if (editing) {
        updateEntry(editing.id, {
          kind: draft.kind as EntryKind,
          title,
          content: draft.content.trim(),
          date: draft.date,
          domains: draft.domains,
          tags: parseTags(draft.tags),
          context: hasContext ? context : undefined,
        });
        toast(t('Entry updated. Re-run analysis from its panel if the content changed.'), { tone: 'success' });
      } else {
        onClose();
        await captureEntry(
          {
            kind: draft.kind as EntryKind,
            title,
            content: draft.content.trim(),
            date: draft.date,
            domains: draft.domains,
            tags: parseTags(draft.tags),
            context: hasContext ? context : undefined,
            nodeIds: [],
          },
          { addToMap: draft.addToMap },
        );
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const summary = [
    isDecision ? null : CAPTURE_KINDS.find((k) => k.key === draft.kind)?.label,
    draft.date === todayISO() ? t('today') : formatDate(draft.date),
    draft.domains.length ? tn(draft.domains.length, '{n} area', '{n} areas') : null,
    parseTags(draft.tags).length ? tn(parseTags(draft.tags).length, '{n} tag', '{n} tags') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('Edit {kind}', { kind: kindMeta.label.toLowerCase() }) : t('Capture')}
      description={
        isDecision
          ? t('A choice you are making: the options, and what you expect.')
          : t('Anything that happened or crossed your mind. The atlas does the sorting.')
      }
      width="max-w-[640px]"
      initialFocus={isDecision ? '#cap-title' : '#cap-content'}
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1 text-[11.5px] text-ink-3 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd> {t('to save')}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid} loading={saving}>
            {editing ? t('Save changes') : isDecision ? t('Log decision') : t('Save note')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {!editing && (
          <Segmented<'note' | 'decision'>
            label={t('What are you capturing?')}
            value={isDecision ? 'decision' : 'note'}
            onChange={(v) => set('kind', v === 'decision' ? 'decision' : 'journal')}
            options={[
              { value: 'note', label: t('A note') },
              { value: 'decision', label: t('A decision') },
            ]}
          />
        )}

        {isDecision ? (
          <>
            <div>
              <FieldLabel htmlFor="cap-title">{t('What are you deciding?')}</FieldLabel>
              <input
                id="cap-title"
                className="field"
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder={t('e.g. Take the agency retainer or keep two days for my own film')}
              />
            </div>
            <div>
              <FieldLabel htmlFor="cap-content" hint="optional">
                {t('What is the situation?')}
              </FieldLabel>
              <textarea
                id="cap-content"
                className="field min-h-[80px] resize-y leading-relaxed"
                value={draft.content}
                onChange={(e) => set('content', e.target.value)}
                placeholder={t('What is at stake, and why now?')}
              />
            </div>
            <DecisionFields draft={draft} set={set} editing={Boolean(editing)} />
          </>
        ) : (
          <div>
            <FieldLabel htmlFor="cap-content">{t('What happened?')}</FieldLabel>
            <textarea
              id="cap-content"
              className="field min-h-[150px] resize-y leading-relaxed"
              value={draft.content}
              onChange={(e) => set('content', e.target.value)}
              placeholder={t('Write it like a note to yourself: what happened, what you noticed, how it felt. A few lines is enough.')}
            />
          </div>
        )}

        <div className="rounded-[2px] border border-line">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2"
            onClick={() => setDetails(!details)}
            aria-expanded={details}
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="text-[12.5px] text-ink-2">{t('More details')}</span>
              <span className="truncate text-[11.5px] text-ink-3">{details ? 'optional' : summary}</span>
            </span>
            <ChevronDown size={14} className={cn('shrink-0 text-ink-3 transition-transform', !details && '-rotate-90')} aria-hidden />
          </button>
          {details && (
            <div className="space-y-4 border-t border-line px-3 pt-3 pb-3.5">
              {!isDecision && (
                <div>
                  <FieldLabel hint={kindMeta.hint}>{t('Type')}</FieldLabel>
                  <div role="radiogroup" aria-label={t('Type')} className="flex flex-wrap gap-1.5">
                    {noteKinds.map((k) => {
                      const Icon = CAPTURE_ICONS[k.key];
                      const active = draft.kind === k.key;
                      return (
                        <button
                          key={k.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => set('kind', k.key)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-[2px] border px-2 py-1 text-[12px] transition-colors',
                            active ? 'border-accent/45 bg-accent-dim text-ink' : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-2',
                          )}
                        >
                          <Icon size={12} aria-hidden />
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={cn('grid gap-3', !isDecision && 'sm:grid-cols-[1fr_150px]')}>
                {!isDecision && (
                  <div>
                    <FieldLabel htmlFor="cap-title" hint={t('optional: the first line is used')}>
                      {t('Title')}
                    </FieldLabel>
                    <input
                      id="cap-title"
                      className="field"
                      value={draft.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder={firstLine(draft.content) || t('A short, specific title')}
                    />
                  </div>
                )}
                <div className={isDecision ? 'max-w-[180px]' : undefined}>
                  <FieldLabel htmlFor="cap-date">{t('Date')}</FieldLabel>
                  <input id="cap-date" type="date" className="field num" value={draft.date} onChange={(e) => set('date', e.target.value)} />
                </div>
              </div>

              <div>
                <FieldLabel hint={t('the analysis suggests these too')}>{t('Areas of life')}</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {DOMAINS.map((d) => {
                    const on = draft.domains.includes(d.key);
                    return (
                      <ToggleChip
                        key={d.key}
                        on={on}
                        onClick={() => set('domains', on ? draft.domains.filter((x) => x !== d.key) : [...draft.domains, d.key])}
                        className="py-1"
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color, opacity: on ? 1 : 0.55 }} aria-hidden />
                        {d.label}
                      </ToggleChip>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="cap-tags" hint={t('comma separated')}>
                  {t('Tags')}
                </FieldLabel>
                <input
                  id="cap-tags"
                  className="field"
                  value={draft.tags}
                  onChange={(e) => set('tags', e.target.value)}
                  placeholder={t('focus, client, night-ferry')}
                />
              </div>

              {!isDecision && (
                <div className="rounded-[2px] border border-line">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2"
                    onClick={() => setShowContext(!showContext)}
                    aria-expanded={showContext}
                  >
                    <span className="text-[12.5px] text-ink-2">{t('How you felt')}</span>
                    <ChevronDown size={14} className={cn('text-ink-3 transition-transform', !showContext && '-rotate-90')} aria-hidden />
                  </button>
                  {showContext && (
                    <div className="space-y-3 border-t border-line px-3 pt-3 pb-3.5">
                      <ScaleRow label={t('Energy')} values={[1, 2, 3, 4, 5]} labels={ENERGY_LABELS} value={draft.energy} onChange={(v) => set('energy', v)} />
                      <ScaleRow label={t('Mood')} values={[-2, -1, 0, 1, 2]} labels={MOOD_LABELS} value={draft.mood} onChange={(v) => set('mood', v)} />
                      <div>
                        <div className="label mb-1.5">{t('Felt')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {EMOTION_OPTIONS.map((e) => {
                            const on = draft.emotions.includes(e);
                            return (
                              <ToggleChip key={e} on={on} onClick={() => set('emotions', on ? draft.emotions.filter((x) => x !== e) : [...draft.emotions, e])}>
                                {t(e)}
                              </ToggleChip>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <FieldLabel htmlFor="cap-setting">{t('Setting')}</FieldLabel>
                        <input
                          id="cap-setting"
                          className="field"
                          value={draft.setting}
                          onChange={(e) => set('setting', e.target.value)}
                          placeholder={t('Where, when, with whom')}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!editing && target && (
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={draft.addToMap}
                    onChange={(e) => set('addToMap', e.target.checked)}
                    className="accent-[var(--color-accent)]"
                  />
                  {t('Also add to {target}', { target: nodeTargetLabel(target) })}
                </label>
              )}
            </div>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** The first sentence or line of a note, short enough to be its title. */
function firstLine(text: string): string {
  const line =
    text
      .trim()
      .split(/\n|(?<=[.!?])\s/)[0]
      ?.trim() ?? '';
  return line.length > 72 ? `${line.slice(0, 69).trimEnd()}…` : line;
}

function ScaleRow({
  label,
  values,
  labels,
  value,
  onChange,
}: {
  label: string;
  values: number[];
  labels: Record<string, string>;
  value?: number;
  onChange(v: number | undefined): void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label w-14">{label}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {values.map((v) => (
          <ToggleChip key={v} on={value === v} onClick={() => onChange(value === v ? undefined : v)}>
            {labels[String(v)]}
          </ToggleChip>
        ))}
      </div>
    </div>
  );
}

function DecisionFields({ draft, set, editing }: { draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; editing: boolean }) {
  const updateOption = (id: string, patch: Partial<DecisionOption>) =>
    set(
      'options',
      draft.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    );
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel hint={t('mark the one you chose')}>{t('Options considered')}</FieldLabel>
        <div className="space-y-2">
          {draft.options.map((o, i) => (
            <div key={o.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-[2px] border border-line p-2">
              <input
                type="radio"
                name="chosen"
                aria-label={t('Chose option {n}', { n: i + 1 })}
                checked={draft.chosenOptionId === o.id}
                onChange={() => set('chosenOptionId', o.id)}
                className="mt-2.5 accent-[var(--color-accent)]"
              />
              <div className="space-y-1.5">
                <input
                  className="field"
                  value={o.label}
                  onChange={(e) => updateOption(o.id, { label: e.target.value })}
                  placeholder={t('Option {n}', { n: i + 1 })}
                  aria-label={t('Option {n}', { n: i + 1 })}
                />
                <input
                  className="field text-[12.5px]"
                  value={o.rationale}
                  onChange={(e) => updateOption(o.id, { rationale: e.target.value })}
                  placeholder={t('Why it was worth considering')}
                  aria-label={t('Why option {n} was considered', { n: i + 1 })}
                />
              </div>
              <button
                type="button"
                className="mt-1.5 rounded-[2px] p-1 text-ink-3 hover:text-ink"
                aria-label={t('Remove option')}
                onClick={() =>
                  set(
                    'options',
                    draft.options.filter((x) => x.id !== o.id),
                  )
                }
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set('options', [...draft.options, blankOption()])}>
            {t('Add option')}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="cap-chosen">{t('Chosen action')}</FieldLabel>
          <input
            id="cap-chosen"
            className="field"
            value={draft.chosenAction}
            onChange={(e) => set('chosenAction', e.target.value)}
            placeholder={t('What you actually did')}
          />
        </div>
        <div>
          <FieldLabel htmlFor="cap-expected">{t('Expected outcome')}</FieldLabel>
          <input
            id="cap-expected"
            className="field"
            value={draft.expectedOutcome}
            onChange={(e) => set('expectedOutcome', e.target.value)}
            placeholder={t('What you expect to happen')}
          />
        </div>
      </div>
      <div>
        <FieldLabel hint={t('used to find decision patterns')}>{t('Optimising for')}</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {DRIVERS.map((d) => {
            const on = draft.optimizingFor.includes(d);
            return (
              <ToggleChip key={d} on={on} onClick={() => set('optimizingFor', on ? draft.optimizingFor.filter((x) => x !== d) : [...draft.optimizingFor, d])}>
                {t(d)}
              </ToggleChip>
            );
          })}
        </div>
      </div>
      {editing && (
        <div className="space-y-3 rounded-[2px] border border-line p-3">
          <div>
            <FieldLabel htmlFor="cap-actual">{t('Actual outcome')}</FieldLabel>
            <textarea id="cap-actual" className="field min-h-[56px]" value={draft.actualOutcome} onChange={(e) => set('actualOutcome', e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['better', 'as_expected', 'mixed', 'worse'] as const).map((r) => (
              <ToggleChip key={r} on={draft.outcomeRating === r} onClick={() => set('outcomeRating', r)}>
                {OUTCOME_RATING_LABEL[r]}
              </ToggleChip>
            ))}
          </div>
          <div>
            <FieldLabel htmlFor="cap-learned">{t('What I learned')}</FieldLabel>
            <textarea id="cap-learned" className="field min-h-[56px]" value={draft.learned} onChange={(e) => set('learned', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
