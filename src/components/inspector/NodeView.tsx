import { Check, Crosshair, Link2, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { navigate, useRoute } from '../../app/router';
import { CATEGORIES, CATEGORY_META, DOMAIN_META, DOMAINS, hubId, hubKey, isHubId, QUESTION_STATUS_LABEL, RELATION_META, SEMANTIC_RELATIONS } from '../../domain/constants';
import {
  displayNode,
  evidenceForNode,
  neighborhood,
  neighbors,
  patternsForNode,
  resolveSource,
  type Neighbor,
} from '../../domain/selectors';
import type { ID, QuestionStatus, RelationType } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { RelationSwatch } from '../graph/Legend';
import { CATEGORY_ICONS, DOMAIN_ICONS } from '../icons';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Segmented } from '../ui/primitives';
import { KindEyebrow, Muted, NodeChip, PanelSection, PatternRow, RecordRow } from './parts';

/** Everything known about one node, organised around its relationships and evidence. */
export function NodeView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const updateNode = useAtlas((s) => s.updateNode);
  const updateDomain = useAtlas((s) => s.updateDomain);
  const deleteNode = useAtlas((s) => s.deleteNode);
  const requestFocus = useUI((s) => s.requestFocus);
  const closeInspector = useUI((s) => s.closeInspector);
  const route = useRoute();
  const [editing, setEditing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const hub = isHubId(id);
  const key = hub ? hubKey(id) : undefined;
  const node = hub ? undefined : data.nodes[id];
  const display = displayNode(data, id);

  const links = useMemo(() => neighbors(data, id), [data, id]);
  const evidence = useMemo(() => evidenceForNode(data, id), [data, id]);
  const patterns = useMemo(() => patternsForNode(data, id), [data, id]);
  const near2 = useMemo(() => neighborhood(data, id, 2), [data, id]);

  if (!display) return null;
  const color = display.color;
  const Icon = hub ? DOMAIN_ICONS[key!] : node?.category ? CATEGORY_ICONS[node.category] : node?.domain ? DOMAIN_ICONS[node.domain] : DOMAIN_ICONS.identity;

  const structural = links.filter((l) => l.relation === 'part_of');
  const semantic = links.filter((l) => l.relation !== 'part_of');
  const byRelation = new Map<string, Neighbor[]>();
  for (const l of semantic) {
    const k = `${l.direction}:${l.relation}`;
    byRelation.set(k, [...(byRelation.get(k) ?? []), l]);
  }

  const goals = [...near2].filter((x) => x !== id && data.nodes[x]?.domain === 'goals');
  const questions = [...neighborhood(data, id, 1)].filter((x) => x !== id && data.nodes[x]?.category === 'question');
  const decisions = hub ? evidence.decisions : evidence.decisions.length ? evidence.decisions : Object.values(data.decisions).filter((d) => node?.domain && d.domains.includes(node.domain)).sort((a, b) => b.date.localeCompare(a.date));
  const experiences = evidence.entries.filter((e) => e.kind === 'experience');
  const records = evidence.entries.filter((e) => e.kind !== 'experience');
  const layer = node?.category && !node.domain ? 'mind' : route.key === 'mind' && node?.category ? 'mind' : 'orbit';

  const focus = () => {
    if (layer !== route.key) navigate(layer);
    setTimeout(() => requestFocus(layer, id), layer !== route.key ? 250 : 0);
  };

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[6px] border" style={{ borderColor: `${color}66` }}>
            <Icon size={13} color={color} strokeWidth={1.8} aria-hidden />
          </span>
          <KindEyebrow id={id} />
          {node?.origin === 'inferred' && (
            <span className="num ml-auto rounded-[4px] border border-dashed border-line-strong px-1.5 text-[10.5px] text-ink-2" title="Proposed by the analysis layer from your entries">
              inferred{node.confidence !== undefined ? ` · ${Math.round(node.confidence * 100)}%` : ''}
            </span>
          )}
        </div>

        {editing ? (
          <EditForm
            id={id}
            onDone={() => setEditing(false)}
            onSave={(label, summary) => {
              if (hub) updateDomain(key!, { statement: label, summary });
              else updateNode(id, { label, summary, origin: node?.origin === 'inferred' ? 'user' : node?.origin });
              setEditing(false);
            }}
          />
        ) : (
          <>
            <h2 className="mt-2.5 text-[18px] leading-snug font-medium tracking-[-0.01em] text-ink">{hub ? DOMAIN_META[key!].label : display.label}</h2>
            {hub ? (
              <>
                <p className="mt-1 text-[14px] text-ink">{data.domains[key!].statement ? `“${data.domains[key!].statement}”` : <span className="text-ink-3">No current-state statement yet.</span>}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{data.domains[key!].summary || DOMAIN_META[key!].description}</p>
              </>
            ) : (
              node?.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{node.summary}</p>
            )}
          </>
        )}

        {node?.source && (
          <p className="mt-2 text-[12px] text-ink-3">
            Mirrors{' '}
            <button type="button" className="num text-accent underline decoration-accent/30 underline-offset-2" onClick={() => useUI.getState().openEntity({ kind: node.source!.kind, id: node.source!.id })}>
              {resolveSource(data, node.source).code}
            </button>{' '}
            in your records.
          </p>
        )}

        {!editing && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" icon={Crosshair} onClick={focus}>
              Show on map
            </Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={Link2} onClick={() => setConnecting((c) => !c)} aria-expanded={connecting}>
              Connect
            </Button>
            {!hub && (
              <span className="ml-auto">
                <ConfirmButton
                  onConfirm={() => {
                    deleteNode(id);
                    closeInspector();
                  }}
                />
              </span>
            )}
          </div>
        )}
        {connecting && <ConnectForm id={id} onDone={() => setConnecting(false)} />}
      </div>

      {node?.category === 'question' && <QuestionStatusSection id={id} />}

      <PanelSection title="Connected to" count={semantic.length + (hub ? 0 : structural.length)}>
        {semantic.length === 0 && structural.length === 0 ? (
          <Muted>No connections yet. Use Connect, or drag from the dot on a node in the graph.</Muted>
        ) : (
          <div className="space-y-2.5">
            {!hub && structural.length > 0 && (
              <RelationGroup label="Part of" relation="part_of">
                {structural.map((l) => (
                  <NodeChip key={l.otherId} id={l.otherId} />
                ))}
              </RelationGroup>
            )}
            {[...byRelation.entries()].map(([k, list]) => {
              const [dir, rel] = k.split(':') as ['in' | 'out', RelationType];
              const meta = RELATION_META[rel];
              const label = dir === 'out' ? meta.label : inverseLabel(rel);
              return (
                <RelationGroup key={k} label={label} relation={rel}>
                  {list.map((l) => (
                    <NodeChip key={l.otherId + k} id={l.otherId} />
                  ))}
                </RelationGroup>
              );
            })}
          </div>
        )}
      </PanelSection>

      {hub && (
        <PanelSection title="In this domain" count={structural.length}>
          {structural.length ? (
            <div className="flex flex-wrap gap-1.5">
              {structural.map((l) => (
                <NodeChip key={l.otherId} id={l.otherId} />
              ))}
            </div>
          ) : (
            <Muted>Nothing here yet. Capture a {key === 'goals' ? 'goal' : key === 'projects' ? 'project' : key === 'habits' ? 'habit' : 'note'} or add an item from the Orbit toolbar.</Muted>
          )}
        </PanelSection>
      )}

      <PanelSection title="Evidence" count={records.length + experiences.length + evidence.decisions.length}>
        {records.length === 0 ? (
          <Muted>{hub ? 'No entries touch this domain yet.' : 'No entries are linked to this node yet. Link one from an entry’s panel, or accept an analysis suggestion.'}</Muted>
        ) : (
          <ul className="-mx-1.5">
            {records.slice(0, 6).map((e) => (
              <RecordRow key={e.id} kind="entry" id={e.id} />
            ))}
          </ul>
        )}
        {records.length > 6 && <p className="mt-1 text-[11.5px] text-ink-3">+{records.length - 6} more in the Journal</p>}
      </PanelSection>

      <PanelSection title="Patterns" count={patterns.length}>
        {patterns.length ? (
          <ul className="-mx-1.5">
            {patterns.map((p) => (
              <PatternRow key={p.id} id={p.id} />
            ))}
          </ul>
        ) : (
          <Muted>No active pattern involves this {hub ? 'domain' : 'node'}.</Muted>
        )}
      </PanelSection>

      {goals.length > 0 && (
        <PanelSection title="Goals" count={goals.length}>
          <div className="flex flex-wrap gap-1.5">
            {goals.map((g) => (
              <NodeChip key={g} id={g} />
            ))}
          </div>
        </PanelSection>
      )}

      {decisions.length > 0 && (
        <PanelSection title="Recent decisions" count={decisions.length}>
          <ul className="-mx-1.5">
            {decisions.slice(0, 4).map((d) => (
              <RecordRow key={d.id} kind="decision" id={d.id} />
            ))}
          </ul>
        </PanelSection>
      )}

      {experiences.length > 0 && (
        <PanelSection title="Related experiences" count={experiences.length}>
          <ul className="-mx-1.5">
            {experiences.slice(0, 4).map((e) => (
              <RecordRow key={e.id} kind="entry" id={e.id} />
            ))}
          </ul>
        </PanelSection>
      )}

      {questions.length > 0 && (
        <PanelSection title="Open questions" count={questions.length}>
          <div className="flex flex-col items-start gap-1.5">
            {questions.map((q) => (
              <NodeChip key={q} id={q} />
            ))}
          </div>
        </PanelSection>
      )}

      {node && (
        <div className="border-t border-line px-4 py-3 text-[11.5px] text-ink-3">
          Added {formatDate(node.createdAt.slice(0, 10), { year: true })} · {node.origin === 'inferred' ? 'proposed by analysis' : 'written by you'}
        </div>
      )}
    </div>
  );
}

function inverseLabel(rel: RelationType): string {
  switch (rel) {
    case 'causes':
      return 'Caused by';
    case 'influences':
      return 'Influenced by';
    case 'supports':
      return 'Supported by';
    case 'conflicts':
      return 'Conflicts with';
    case 'contradicts':
      return 'Contradicted by';
    case 'derived_from':
      return 'Source of';
    case 'depends_on':
      return 'Required by';
    case 'examines':
      return 'Examined by';
    default:
      return RELATION_META[rel].label;
  }
}

function RelationGroup({ label, relation, children }: { label: string; relation: RelationType; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <RelationSwatch relation={relation} width={20} />
        <span className="text-[11.5px] text-ink-3">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-7">{children}</div>
    </div>
  );
}

function EditForm({ id, onSave, onDone }: { id: ID; onSave(label: string, summary: string): void; onDone(): void }) {
  const data = useAtlas((s) => s.data);
  const hub = isHubId(id);
  const node = data.nodes[id];
  const [label, setLabel] = useState(hub ? data.domains[hubKey(id)].statement : (node?.label ?? ''));
  const [summary, setSummary] = useState(hub ? data.domains[hubKey(id)].summary : (node?.summary ?? ''));
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (hub || label.trim()) onSave(label.trim(), summary.trim());
      }}
    >
      <label className="block">
        <span className="label">{hub ? 'Current state, one line' : 'Label'}</span>
        <input className="field mt-1" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
      <label className="block">
        <span className="label">{hub ? 'Summary' : 'Description'}</span>
        <textarea className="field mt-1 min-h-[72px] resize-y" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" icon={Check}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Keyboard- and touch-friendly alternative to dragging a connection on the canvas. */
function ConnectForm({ id, onDone }: { id: ID; onDone(): void }) {
  const data = useAtlas((s) => s.data);
  const addEdge = useAtlas((s) => s.addEdge);
  const [relation, setRelation] = useState<RelationType>('influences');
  const [target, setTarget] = useState('');
  const others = Object.values(data.nodes).filter((n) => n.id !== id);
  return (
    <form
      className="mt-3 space-y-2 rounded-[8px] border border-line bg-raised/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!target) return;
        addEdge(id, target, relation);
        setTarget('');
        onDone();
      }}
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <span className="text-[12px] text-ink-3">This</span>
        <select className="field" value={relation} onChange={(e) => setRelation(e.target.value as RelationType)} aria-label="Relationship">
          {SEMANTIC_RELATIONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.verb}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-ink-3">node</span>
        <select className="field" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target node" required>
          <option value="">Choose…</option>
          <optgroup label="Domains">
            {DOMAINS.filter((d) => hubId(d.key) !== id).map((d) => (
              <option key={d.key} value={hubId(d.key)}>
                {d.label}
              </option>
            ))}
          </optgroup>
          {DOMAINS.map((d) => {
            const list = others.filter((n) => n.domain === d.key);
            return list.length ? (
              <optgroup key={d.key} label={d.label}>
                {list.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
          {CATEGORIES.map((c) => {
            const list = others.filter((n) => n.category === c.key && !n.domain);
            return list.length ? (
              <optgroup key={c.key} label={CATEGORY_META[c.key].plural}>
                {list.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" icon={Plus} disabled={!target}>
          Add connection
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function QuestionStatusSection({ id }: { id: ID }) {
  const node = useAtlas((s) => s.data.nodes[id]);
  const updateNode = useAtlas((s) => s.updateNode);
  const [draft, setDraft] = useState(node?.resolution ?? '');
  if (!node) return null;
  return (
    <PanelSection title="Status">
      <Segmented<QuestionStatus>
        label="Question status"
        size="sm"
        value={node.status ?? 'open'}
        onChange={(status) => updateNode(id, { status })}
        options={(['open', 'exploring', 'resolved'] as const).map((s) => ({ value: s, label: QUESTION_STATUS_LABEL[s] }))}
      />
      {(node.status === 'resolved' || node.resolution) && (
        <label className="mt-2.5 block">
          <span className="label">What you concluded</span>
          <textarea
            className="field mt-1 min-h-[64px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== (node.resolution ?? '') && updateNode(id, { resolution: draft.trim() || undefined })}
            placeholder="A provisional answer, and what would change it."
          />
        </label>
      )}
    </PanelSection>
  );
}
