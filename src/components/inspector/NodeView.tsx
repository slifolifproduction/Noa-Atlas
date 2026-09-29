import { Check, Crosshair, Link2, Pencil, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRoute } from '../../app/router';
import { showOnMap } from '../../app/showOnMap';
import { byStrength, claimsInto, claimsOutOf } from '../../domain/claims';
import { AREA_META, AREAS, KIND_META, LINK_META, QUESTION_STATUS_LABEL } from '../../domain/constants';
import { historyOf, readingsOf } from '../../domain/history';
import { loopsThrough } from '../../domain/loops';
import { displayNode, neighbors, patternsForNode, recordsFor, type Neighbor } from '../../domain/selectors';
import type { AreaKey, ID, Investigation, LinkType, QuestionStatus } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { KnowledgeTag } from '../evidence/Status';
import { LinkSwatch } from '../graph/Legend';
import { KIND_ICONS, LoopIcon } from '../icons';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Segmented } from '../ui/primitives';
import { ClaimComposer, ConnectForm, ElementSelect } from './ClaimComposer';
import { ClaimRow, HistoryRow, KindEyebrow, Muted, NodeChip, PanelSection, PatternRow, RecordRow } from './parts';
import { t, tn } from '../../i18n';

/**
 * One element of the map, read through the layers: what it is (map), what
 * happened around it (history), what is claimed to act on it and what it
 * acts on (understanding), and the loops it sits in.
 */
export function NodeView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const adoptNode = useAtlas((s) => s.adoptNode);
  const deleteNode = useAtlas((s) => s.deleteNode);
  const closeInspector = useUI((s) => s.closeInspector);
  const route = useRoute();
  const [editing, setEditing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const node = data.nodes[id];
  const display = displayNode(data, id);
  const into = useMemo(() => claimsInto(data, id).sort(byStrength(data)), [data, id]);
  const out = useMemo(() => claimsOutOf(data, id).sort(byStrength(data)), [data, id]);
  const loops = useMemo(() => loopsThrough(data, id), [data, id]);
  const links = useMemo(() => neighbors(data, id).filter((n) => n.relation.family === 'link'), [data, id]);
  const history = useMemo(() => historyOf(data, id), [data, id]);
  const records = useMemo(() => recordsFor(data, id), [data, id]);
  const patterns = useMemo(() => patternsForNode(data, id), [data, id]);

  if (!node || !display) return null;
  const Icon = KIND_ICONS[node.kind];
  const color = display.color;
  const layer = route.key === 'network' ? 'network' : 'orbit';

  const byLink = new Map<string, Neighbor[]>();
  for (const l of links) {
    if (l.relation.family !== 'link') continue;
    const k = `${l.direction}:${l.relation.type}`;
    byLink.set(k, [...(byLink.get(k) ?? []), l]);
  }

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[2px] border" style={{ borderColor: `${color}66` }}>
            <Icon size={13} color={color} strokeWidth={1.8} aria-hidden />
          </span>
          <KindEyebrow id={id} />
          <span className="ml-auto">
            <KnowledgeTag kind={node.adopted ? 'declared' : 'suggested'} />
          </span>
        </div>

        {editing ? (
          <EditForm id={id} onDone={() => setEditing(false)} />
        ) : (
          <>
            <h2 className="mt-2.5 display text-[21px] leading-[1.2] text-ink">{node.label}</h2>
            {node.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{node.summary}</p>}
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
              {(node.since || node.until) && (
                <span>
                  {node.since ? formatDate(node.since, { year: true }) : '…'} – {node.until ? formatDate(node.until, { year: true }) : t('now')}
                </span>
              )}
              {node.concern && <span className="text-ink-2">{t('An outcome you want explained or changed')}</span>}
              {node.external && <span>{t('Outside your control')}</span>}
            </p>
          </>
        )}

        {!node.adopted && (
          <div className="mt-3 rounded-[2px] border border-dashed border-line-strong p-3">
            <p className="text-[12.5px] leading-snug text-ink-2">
              {t('Proposed by the analysis from your notes. It stays off the map until you say it fits.')}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" icon={Check} onClick={() => adoptNode(id)}>
                {t('It fits, add it')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                onClick={() => {
                  deleteNode(id);
                  closeInspector();
                }}
              >
                {t('It does not fit')}
              </Button>
            </div>
          </div>
        )}

        {!editing && node.adopted && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" icon={Crosshair} onClick={() => showOnMap(layer, id)}>
              {t('Show on map')}
            </Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              {t('Edit')}
            </Button>
            <Button size="sm" variant="ghost" icon={Link2} onClick={() => setConnecting((c) => !c)} aria-expanded={connecting}>
              {t('Connect')}
            </Button>
            <span className="ml-auto">
              <ConfirmButton
                onConfirm={() => {
                  deleteNode(id);
                  closeInspector();
                }}
              />
            </span>
          </div>
        )}
        {connecting && <ConnectForm id={id} onDone={() => setConnecting(false)} />}
      </div>

      {node.kind === 'belief' && <BeliefSection id={id} />}
      {node.kind === 'question' && <QuestionSection id={id} />}
      {node.kind === 'state' && <ReadingsSection id={id} />}

      <PanelSection title={t('What acts on it')} count={into.length}>
        {into.length ? (
          <ul className="-mx-1.5">
            {into.map((c) => (
              <ClaimRow key={c.id} id={c.id} />
            ))}
          </ul>
        ) : (
          <Muted>
            {node.concern
              ? t('Nothing claimed yet. This is an outcome you care about with no explanation on the map: where understanding is thin.')
              : t('No claims about what changes this yet.')}
          </Muted>
        )}
      </PanelSection>

      <PanelSection title={t('What it acts on')} count={out.length}>
        {out.length ? (
          <ul className="-mx-1.5">
            {out.map((c) => (
              <ClaimRow key={c.id} id={c.id} />
            ))}
          </ul>
        ) : (
          <Muted>{t('No claims about what this changes yet. Use Connect, or drag from it to another element on the map.')}</Muted>
        )}
      </PanelSection>

      {loops.length > 0 && (
        <PanelSection title={t('Loops it is part of')} count={loops.length}>
          <ul className="-mx-1.5">
            {loops.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink/[0.035]"
                  onClick={() => useUI.getState().openEntity({ kind: 'loop', id: l.id })}
                >
                  <LoopIcon size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink-2 group-hover:text-ink">
                      {l.name ?? (l.type === 'reinforcing' ? t('A reinforcing loop') : t('A balancing loop'))}
                    </span>
                    <span className="block text-[11.5px] text-ink-3">
                      {l.type === 'reinforcing' ? t('Reinforcing: it escalates') : t('Balancing: it pulls back')} ·{' '}
                      {tn(l.claimIds.length, '{n} link', '{n} links')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      {links.length > 0 && (
        <PanelSection title={t('Declared links')} count={links.length}>
          <div className="space-y-2.5">
            {[...byLink.entries()].map(([k, list]) => {
              const [dir, type] = k.split(':') as ['in' | 'out', LinkType];
              const meta = LINK_META[type];
              return (
                <div key={k}>
                  <div className="mb-1 flex items-center gap-2">
                    <LinkSwatch type={type} width={20} />
                    <span className="text-[11.5px] text-ink-3">{dir === 'out' ? meta.label : inverseLink(type)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-7">
                    {list.map((l) => (
                      <NodeChip key={l.otherId + k} id={l.otherId} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </PanelSection>
      )}

      <PanelSection title={t('What happened')} count={history.length}>
        {history.length ? (
          <ul className="-mx-1.5">
            {history.slice(0, 8).map((h) => (
              <HistoryRow key={h.key} item={h} />
            ))}
          </ul>
        ) : (
          <Muted>{t('Nothing on the timeline concerns this yet.')}</Muted>
        )}
        {history.length > 8 && <p className="mt-1 text-[11.5px] text-ink-3">{t('+{n} more on the Timeline', { n: history.length - 8 })}</p>}
      </PanelSection>

      <PanelSection title={t('Notes and decisions')} count={records.entries.length + records.decisions.length}>
        {records.entries.length + records.decisions.length === 0 ? (
          <Muted>{t('No notes are linked to this yet. Link one from a note’s panel, or accept an analysis suggestion.')}</Muted>
        ) : (
          <ul className="-mx-1.5">
            {records.decisions.slice(0, 3).map((d) => (
              <RecordRow key={d.id} kind="decision" id={d.id} />
            ))}
            {records.entries.slice(0, 5).map((e) => (
              <RecordRow key={e.id} kind="entry" id={e.id} />
            ))}
          </ul>
        )}
      </PanelSection>

      {patterns.length > 0 && (
        <PanelSection title={t('Patterns')} count={patterns.length}>
          <ul className="-mx-1.5">
            {patterns.map((p) => (
              <PatternRow key={p.id} id={p.id} />
            ))}
          </ul>
        </PanelSection>
      )}

      <div className="border-t border-line px-4 py-3 text-[11.5px] text-ink-3">
        {t('Added {date}', { date: formatDate(node.createdAt, { year: true }) })} ·{' '}
        {node.origin === 'inferred' ? t('proposed by the analysis') : t('written by you')}
        {node.origin === 'inferred' && node.adopted && ` · ${t('adopted by you')}`}
      </div>
    </div>
  );
}

function inverseLink(type: LinkType): string {
  switch (type) {
    case 'aims_at':
      return t('Aimed at by');
    case 'motivates':
      return t('Motivated by');
    case 'about':
      return t('Asked or believed about it');
    case 'part_of':
      return t('Contains');
    default:
      return LINK_META[type].label;
  }
}

/** A belief is also a claim about how things work: show the claim and how it is holding up. */
function BeliefSection({ id }: { id: ID }) {
  const node = useAtlas((s) => s.data.nodes[id]);
  const updateNode = useAtlas((s) => s.updateNode);
  const [composing, setComposing] = useState(false);
  if (!node) return null;
  return (
    <PanelSection title={t('As a claim')}>
      <Muted>{t('A belief is something you hold, and also a claim about how things work that the record can bear out or not.')}</Muted>
      {node.claimId ? (
        <ul className="-mx-1.5 mt-1.5">
          <ClaimRow id={node.claimId} />
        </ul>
      ) : composing ? (
        <div className="mt-2">
          <ClaimComposer
            hint={t('What does this belief say changes what?')}
            onCreated={(cid) => {
              updateNode(id, { claimId: cid });
              setComposing(false);
            }}
            onCancel={() => setComposing(false)}
          />
        </div>
      ) : (
        <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setComposing(true)}>
          {t('State it as a claim')}
        </Button>
      )}
    </PanelSection>
  );
}

const INVESTIGATION_KINDS: { value: Investigation['kind']; label: () => string; hint: () => string }[] = [
  { value: 'why', label: () => t('Why?'), hint: () => t('Explain something that happened, against what you expected instead.') },
  { value: 'what_if', label: () => t('What if?'), hint: () => t('Follow a change forward through what it acts on.') },
  { value: 'value', label: () => t('What matters?'), hint: () => t('A question only you can settle. Evidence can inform it, not decide it.') },
];

/** An open question, worked as an investigation: why, what if, or what matters. */
function QuestionSection({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const updateNode = useAtlas((s) => s.updateNode);
  const updateInvestigation = useAtlas((s) => s.updateInvestigation);
  const node = data.nodes[id];
  const [conclusion, setConclusion] = useState(node?.investigation?.conclusion ?? node?.resolution ?? '');
  const [contrast, setContrast] = useState(node?.investigation?.contrast ?? '');
  if (!node) return null;
  const inv = node.investigation;
  const kind = inv?.kind ?? 'why';
  const anchor = inv?.anchorId;
  const gathered = inv?.claimIds ?? [];
  const candidates = anchor
    ? (kind === 'what_if' ? claimsOutOf(data, anchor) : claimsInto(data, anchor)).filter((c) => !gathered.includes(c.id)).sort(byStrength(data))
    : [];
  const set = (patch: Partial<Investigation>) => updateInvestigation(id, patch);

  return (
    <>
      <PanelSection title={t('Status')}>
        <Segmented<QuestionStatus>
          label={t('Question status')}
          size="sm"
          value={node.status ?? 'open'}
          onChange={(status) => updateNode(id, { status })}
          options={(['open', 'exploring', 'resolved'] as const).map((s) => ({ value: s, label: QUESTION_STATUS_LABEL[s] }))}
        />
      </PanelSection>
      <PanelSection title={t('Investigation')}>
        <Segmented<Investigation['kind']>
          label={t('Kind of question')}
          size="sm"
          value={kind}
          onChange={(k) => set({ kind: k })}
          options={INVESTIGATION_KINDS.map((k) => ({ value: k.value, label: k.label(), title: k.hint() }))}
        />
        <p className="mt-1.5 text-[12px] text-ink-3">{INVESTIGATION_KINDS.find((k) => k.value === kind)!.hint()}</p>
        {kind !== 'value' && (
          <div className="mt-2.5 space-y-2">
            <label className="block">
              <span className="label">{kind === 'why' ? t('What is being explained') : t('What would change')}</span>
              <div className="mt-1">
                <ElementSelect value={anchor ?? ''} onChange={(v) => set({ anchorId: v || undefined })} label={t('Element')} />
              </div>
            </label>
            {kind === 'why' && (
              <label className="block">
                <span className="label">{t('Rather than what?')}</span>
                <input
                  className="field mt-1"
                  value={contrast}
                  onChange={(e) => setContrast(e.target.value)}
                  onBlur={() => contrast !== (inv?.contrast ?? '') && set({ contrast: contrast.trim() || undefined })}
                  placeholder={t('e.g. finishing on time, like the short film did')}
                />
              </label>
            )}
            <div>
              <div className="label">{kind === 'why' ? t('Possible contributors') : t('Possible consequences')}</div>
              {gathered.length ? (
                <ul className="-mx-1.5 mt-1">
                  {gathered.map((cid) => (
                    <li key={cid} className="flex items-start">
                      <ul className="min-w-0 flex-1">
                        <ClaimRow id={cid} />
                      </ul>
                      <button
                        type="button"
                        className="mt-1.5 rounded-[2px] p-1 text-ink-3 hover:text-ink"
                        aria-label={t('Remove from this investigation')}
                        onClick={() => set({ claimIds: gathered.filter((x) => x !== cid) })}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Muted>{t('None gathered yet.')}</Muted>
              )}
              {candidates.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11.5px] text-ink-3">{t('Claims on the map that could belong here:')}</div>
                  <div className="mt-1 flex flex-col items-start gap-1">
                    {candidates.slice(0, 5).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left text-[12.5px] text-ink-2 hover:text-ink"
                        onClick={() => set({ claimIds: [...gathered, c.id] })}
                      >
                        <Plus size={12} aria-hidden />
                        {displayNode(data, kind === 'what_if' ? c.to : c.from)?.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <label className="mt-3 block">
          <span className="label">{t('What you conclude, for now')}</span>
          <textarea
            className="field mt-1 min-h-[64px]"
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            onBlur={() => conclusion !== (inv?.conclusion ?? '') && set({ conclusion: conclusion.trim() || undefined })}
            placeholder={t('A provisional answer, and what would change it.')}
          />
        </label>
      </PanelSection>
    </>
  );
}

/** A state is read over time: its readings as a small line. */
function ReadingsSection({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const node = data.nodes[id];
  const readings = useMemo(() => readingsOf(data, id), [data, id]);
  if (!node) return null;
  if (readings.length < 2)
    return (
      <PanelSection title={t('Readings')}>
        <Muted>{t('Not enough readings yet to show how it moves.')}</Muted>
      </PanelSection>
    );
  const min = node.scale?.min ?? Math.min(...readings.map((r) => r.value));
  const max = node.scale?.max ?? Math.max(...readings.map((r) => r.value));
  const w = 300;
  const h = 56;
  const x = (i: number) => 4 + (i / (readings.length - 1)) * (w - 8);
  const y = (v: number) => 4 + (1 - (v - min) / Math.max(1, max - min)) * (h - 8);
  const d = readings.map((r, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`).join(' ');
  const last = readings[readings.length - 1];
  return (
    <PanelSection title={t('Readings')} count={readings.length}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label={t('Readings over time')}>
        <path d={d} fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={x(readings.length - 1)} cy={y(last.value)} r="2.5" fill="var(--color-ink)" />
      </svg>
      <p className="mt-1 text-[11.5px] text-ink-3">
        {t('From {a} to {b}. Latest {v} of {max}.', {
          a: formatDate(readings[0].date),
          b: formatDate(last.date),
          v: last.value,
          max,
        })}
      </p>
    </PanelSection>
  );
}

function EditForm({ id, onDone }: { id: ID; onDone(): void }) {
  const node = useAtlas((s) => s.data.nodes[id]);
  const updateNode = useAtlas((s) => s.updateNode);
  const [label, setLabel] = useState(node?.label ?? '');
  const [summary, setSummary] = useState(node?.summary ?? '');
  const [area, setArea] = useState<AreaKey>(node?.area ?? 'self');
  const [since, setSince] = useState(node?.since ?? '');
  const [until, setUntil] = useState(node?.until ?? '');
  const [concern, setConcern] = useState(Boolean(node?.concern));
  if (!node) return null;
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        updateNode(id, {
          label: label.trim(),
          summary: summary.trim(),
          area,
          since: since || undefined,
          until: until || undefined,
          concern: concern || undefined,
        });
        onDone();
      }}
    >
      <label className="block">
        <span className="label">{KIND_META[node.kind].label}</span>
        <input className="field mt-1" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
      <label className="block">
        <span className="label">{t('Description')}</span>
        <textarea className="field mt-1 min-h-[72px] resize-y" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">{t('Area of life')}</span>
        <select className="field mt-1" value={area} onChange={(e) => setArea(e.target.value as AreaKey)}>
          {AREAS.map((a) => (
            <option key={a.key} value={a.key}>
              {AREA_META[a.key].label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">{t('Since')}</span>
          <input type="date" className="field mt-1" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('Until')}</span>
          <input type="date" className="field mt-1" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-[12.5px] text-ink-2">
        <input type="checkbox" className="mt-[3px]" checked={concern} onChange={(e) => setConcern(e.target.checked)} />
        <span>{t('An outcome I want explained or changed')}</span>
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" icon={Check}>
          {t('Save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}
