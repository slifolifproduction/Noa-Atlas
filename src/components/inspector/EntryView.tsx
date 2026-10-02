import { Check, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sortSuggestions } from '../../domain/learning';
import { AREA_META, CAPTURE_KIND_LABEL, ENERGY_LABELS, MOOD_LABELS, OCCURRENCE_KIND_LABEL, expectSentence, stateSentence } from '../../domain/constants';
import { entryCode, mapElements, patternTitle } from '../../domain/selectors';
import type { AnalysisSuggestion, ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { readAndWeave } from '../../state/operations';
import { useUI } from '../../state/uiStore';
import { StanceMark } from '../evidence/EvidenceRow';
import { CAPTURE_ICONS } from '../icons';
import { Button, IconButton } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Chip } from '../ui/primitives';
import { ClaimComposer } from './ClaimComposer';
import { Muted, PanelSection } from './parts';
import { Readings } from './Readings';
import { OfferList, useWeave, WeaveList } from '../weave/Weave';
import { KnowledgeTag } from '../evidence/Status';
import { MoreDetail } from '../ui/Detail';
import { t, tn } from '../../i18n';
import { Trans } from '../../i18n/Trans';

export function EntryView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const entry = data.entries[id];
  const updateEntry = useAtlas((s) => s.updateEntry);
  const deleteEntry = useAtlas((s) => s.deleteEntry);
  const openCapture = useUI((s) => s.openCapture);
  const back = useUI((s) => s.back);
  const open = useUI((s) => s.openEntity);
  const busy = useUI((s) => s.busy[`entry:${id}`]);
  const highlight = useUI((s) => s.highlight);
  const resolve = useAtlas((s) => s.resolveSuggestion);
  const [linking, setLinking] = useState(false);
  const [explaining, setExplaining] = useState<ID | null>(null);
  const weave = useWeave(id);
  if (!entry) return null;
  const Icon = CAPTURE_ICONS[entry.kind];
  const ctx = entry.context;
  const analysis = entry.analysis;
  // What is still waiting and is not one of the offers above, kinds you usually take first (see domain/learning).
  const offered = new Set(weave.offers.map((o) => o.suggestion));
  const rest = sortSuggestions(data, analysis?.suggestions.filter((s) => s.state === 'pending' && !offered.has(s.id)) ?? []);

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-ink-3" aria-hidden />
          <span className="label">
            {CAPTURE_KIND_LABEL[entry.kind]} · {entryCode(entry.seq)}
          </span>
          <span className="num ml-auto text-[11.5px] text-ink-3">{formatDate(entry.date, { year: true })}</span>
          <KnowledgeTag kind="recorded" />
        </div>
        <h2 className="mt-2.5 display text-[21px] leading-[1.2] text-ink">{entry.title}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
          <Marked text={entry.content} passage={highlight} />
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.areas.map((d) => (
            <Chip key={d} color={AREA_META[d].color}>
              {AREA_META[d].label}
            </Chip>
          ))}
          {entry.tags.map((t) => (
            <span key={t} className="num text-[11.5px] leading-[22px] text-ink-3">
              #{t}
            </span>
          ))}
        </div>
        {ctx && (ctx.energy !== undefined || ctx.mood !== undefined || ctx.emotions?.length || ctx.setting) && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
            {ctx.energy !== undefined && (
              <>
                <dt className="text-ink-3">{t('Energy')}</dt>
                <dd className="text-ink-2">
                  {ENERGY_LABELS[String(ctx.energy)]} <span className="num text-ink-3">({ctx.energy}/5)</span>
                </dd>
              </>
            )}
            {ctx.mood !== undefined && (
              <>
                <dt className="text-ink-3">{t('Mood')}</dt>
                <dd className="text-ink-2">{MOOD_LABELS[String(ctx.mood)]}</dd>
              </>
            )}
            {ctx.emotions?.length ? (
              <>
                <dt className="text-ink-3">{t('Felt')}</dt>
                <dd className="text-ink-2">{ctx.emotions.map((e) => t(e)).join(', ')}</dd>
              </>
            ) : null}
            {ctx.setting && (
              <>
                <dt className="text-ink-3">{t('Setting')}</dt>
                <dd className="text-ink-2">{ctx.setting}</dd>
              </>
            )}
          </dl>
        )}
        <div className="mt-3.5 flex items-center gap-1.5">
          <Button size="sm" icon={Pencil} onClick={() => openCapture(entry.kind, { kind: 'entry', id })}>
            {t('Edit')}
          </Button>
          <span className="ml-auto">
            <ConfirmButton
              onConfirm={() => {
                deleteEntry(id);
                back();
              }}
            />
          </span>
        </div>
      </div>

      <PanelSection
        title={t('Connected to')}
        aside={
          <IconButton
            icon={linking ? X : Plus}
            label={linking ? t('Cancel') : t('Link to something on the map')}
            size="sm"
            onClick={() => setLinking(!linking)}
          />
        }
      >
        {linking && (
          <select
            className="field mb-2"
            autoFocus
            value=""
            aria-label={t('Link to something on the map')}
            onChange={(e) => {
              if (e.target.value) updateEntry(id, { nodeIds: [...entry.nodeIds, e.target.value] });
              setLinking(false);
            }}
          >
            <option value="">{t('Choose…')}</option>
            {mapElements(data)
              .filter((n) => !entry.nodeIds.includes(n.id))
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
          </select>
        )}
        <WeaveList entryId={id} />
        {weave.auto > 0 && (
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
            {t('The Atlas connected what your note says on its own. Anything wrong: × takes it back.')}
          </p>
        )}
      </PanelSection>

      {weave.offers.length > 0 && (
        <PanelSection title={t('Only you can say')} count={weave.offers.length}>
          <OfferList entryId={id} offers={weave.offers} onExplain={(o) => setExplaining(o.suggestion)} />
          {explaining && (
            <div className="mt-2">
              <ClaimComposer
                hint={t('Your explanation, as a possible reason. It starts as a hunch: one note saying so is your guess, not yet something seen again.')}
                onCreated={(cid) => {
                  resolve(id, explaining, true);
                  setExplaining(null);
                  open({ kind: 'claim', id: cid });
                }}
                onCancel={() => setExplaining(null)}
              />
            </div>
          )}
        </PanelSection>
      )}

      <MoreDetail>
        <PanelSection
          title={t('What the Atlas noticed')}
          aside={
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} onClick={() => readAndWeave(id)}>
              {analysis ? t('Read it again') : t('Read it')}
            </Button>
          }
        >
          {!analysis ? (
            <Muted>{t('Not read yet.')}</Muted>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11.5px] text-ink-3">
                  {t('Read by {provider} · {date}', { provider: t(analysis.provider), date: formatDate(analysis.generatedAt) })}
                </div>
                {analysis.observations.length ? (
                  <ul className="space-y-1.5">
                    {analysis.observations.map((o) => (
                      <li key={o.id} className="text-[13px] leading-snug text-ink-2">
                        {o.statement}
                        <span className="block text-[11.5px] text-ink-3">{o.basis}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Muted>{t('Nothing specific enough to note.')}</Muted>
                )}
              </div>
              {analysis.readings && analysis.readings.length > 0 && <Readings readings={analysis.readings} />}
              {rest.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[11.5px] text-ink-3 hover:text-ink">
                    {tn(rest.length, 'Also possible: {n} more', 'Also possible: {n} more')}
                  </summary>
                  <ul className="mt-1.5 divide-y divide-line rounded-[2px] border border-line">
                    {rest.map((s) => (
                      <SuggestionRow key={s.id} entryId={id} suggestion={s} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </PanelSection>
      </MoreDetail>
    </div>
  );
}

function SuggestionRow({ entryId, suggestion: s }: { entryId: ID; suggestion: AnalysisSuggestion }) {
  const data = useAtlas((st) => st.data);
  const resolve = useAtlas((st) => st.resolveSuggestion);
  const [composing, setComposing] = useState(false);
  let title: React.ReactNode;
  if (s.type === 'pattern_evidence') {
    const p = data.patterns[s.patternId];
    title = (
      <>
        {s.stance === 'supports' ? t('Might be another time of') : t('Might be an exception to')}{' '}
        <span className="text-ink">{p ? patternTitle(p) : t('something that repeats')}</span>
      </>
    );
  } else if (s.type === 'link_node') {
    title = <Trans text={t('About {target}')} values={{ target: <span className="text-ink">{data.nodes[s.nodeId]?.label ?? t('an element')}</span> }} />;
  } else if (s.type === 'area') {
    title = <Trans text={t('Also touches {area}')} values={{ area: <span className="text-ink">{AREA_META[s.area].label}</span> }} />;
  } else if (s.type === 'occurrence') {
    title = (
      <>
        {t('Add to the timeline')}: <span className="text-ink">{s.label}</span> <span className="label-sm text-ink-3">{OCCURRENCE_KIND_LABEL[s.kind]}</span>
      </>
    );
  } else if (s.type === 'change') {
    title = (
      <>
        {t('What changed')}: <span className="text-ink">{stateSentence(data.nodes[s.factor]?.label ?? '', s.reads)}</span>
      </>
    );
  } else if (s.type === 'expectation') {
    title = (
      <>
        {t('You expect')}: <span className="text-ink">{expectSentence(data.nodes[s.factor]?.label ?? '', s.reads)}</span>{' '}
        <span className="text-ink-3">{t('within {n} days', { n: s.within })}</span>
      </>
    );
  } else {
    title = t('Your note explains a cause in its own words');
  }
  const excerpt =
    s.type === 'pattern_evidence' || s.type === 'occurrence' || s.type === 'attribution' || s.type === 'change' || s.type === 'expectation'
      ? s.excerpt
      : undefined;
  return (
    <li className="px-2.5 py-2">
      <div className="flex items-start gap-2">
        {s.type === 'pattern_evidence' && <StanceMark stance={s.stance} />}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] leading-snug text-ink-2">{title}</div>
          {excerpt && <div className="mt-0.5 text-[12px] text-ink-2">“{excerpt}”</div>}
          <div className="mt-0.5 text-[11.5px] text-ink-3">{s.reason}</div>
        </div>
        {s.type === 'attribution' ? (
          <div className="flex shrink-0 gap-0.5">
            {!composing && (
              <Button size="sm" variant="ghost" onClick={() => setComposing(true)}>
                {t('Add as a reason')}
              </Button>
            )}
            <IconButton icon={X} label={t('Dismiss')} size="sm" onClick={() => resolve(entryId, s.id, false)} />
          </div>
        ) : (
          <div className="flex shrink-0 gap-0.5">
            <IconButton icon={Check} label={t('Accept')} size="sm" onClick={() => resolve(entryId, s.id, true)} />
            <IconButton icon={X} label={t('Dismiss')} size="sm" onClick={() => resolve(entryId, s.id, false)} />
          </div>
        )}
      </div>
      {composing && s.type === 'attribution' && (
        <div className="mt-2">
          <ClaimComposer
            hint={t('Your explanation, as a possible reason. It starts as a hunch: one note saying so is your guess, not yet something seen again.')}
            onCreated={(cid) => {
              resolve(entryId, s.id, true);
              setComposing(false);
              useUI.getState().openEntity({ kind: 'claim', id: cid });
            }}
            onCancel={() => setComposing(false)}
          />
        </div>
      )}
    </li>
  );
}

/**
 * A note's text with the passage that was cited marked, so opening a note
 * from its moment lands on the words that count.
 */
function Marked({ text, passage }: { text: string; passage: string | null }) {
  const mark = useRef<HTMLElement>(null);
  const [at, needle] = findPassage(text, passage);
  // After the panel has settled at the top, bring the passage into view.
  useEffect(() => {
    if (at < 0) return;
    const timer = setTimeout(() => mark.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
    return () => clearTimeout(timer);
  }, [at, needle]);
  if (!needle || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[1px] bg-accent/20 px-0.5 text-ink" ref={mark}>
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * Where a cited passage sits in a note. Excerpts are trimmed and may end
 * differently from the note ("blocks." for "blocks, steady…"), so the match
 * loosens one word at a time, down to the first four.
 */
function findPassage(text: string, passage: string | null): [number, string] {
  const clean = passage?.replace(/[“”"]/g, '').trim() ?? '';
  const hay = text.toLowerCase();
  let words = clean.split(/\s+/).filter(Boolean);
  while (words.length >= 4 || (words.length && words.join(' ') === clean)) {
    const needle = words.join(' ').replace(/[.,;:!?…]+$/, '');
    const at = hay.indexOf(needle.toLowerCase());
    if (at >= 0) return [at, needle];
    words = words.slice(0, -1);
  }
  return [-1, ''];
}
