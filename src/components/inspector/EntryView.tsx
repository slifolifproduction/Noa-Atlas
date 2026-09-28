import { Check, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { CAPTURE_KIND_LABEL, DOMAIN_META, ENERGY_LABELS, MOOD_LABELS } from '../../domain/constants';
import { entryCode, patternCode, usagesOfSource } from '../../domain/selectors';
import type { AnalysisSuggestion, ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { analyzeEntry } from '../../state/operations';
import { useUI } from '../../state/uiStore';
import { StanceMark } from '../evidence/EvidenceRow';
import { CAPTURE_ICONS } from '../icons';
import { Button, IconButton } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Chip } from '../ui/primitives';
import { Muted, NodeChip, PanelSection } from './parts';

export function EntryView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const entry = data.entries[id];
  const updateEntry = useAtlas((s) => s.updateEntry);
  const deleteEntry = useAtlas((s) => s.deleteEntry);
  const openCapture = useUI((s) => s.openCapture);
  const back = useUI((s) => s.back);
  const open = useUI((s) => s.openEntity);
  const busy = useUI((s) => s.busy[`entry:${id}`]);
  const [linking, setLinking] = useState(false);
  if (!entry) return null;
  const Icon = CAPTURE_ICONS[entry.kind];
  const usages = usagesOfSource(data, { kind: 'entry', id });
  const ctx = entry.context;
  const analysis = entry.analysis;
  const pending = analysis?.suggestions.filter((s) => s.state === 'pending') ?? [];
  const resolved = analysis?.suggestions.filter((s) => s.state !== 'pending') ?? [];

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-ink-3" aria-hidden />
          <span className="label">
            {CAPTURE_KIND_LABEL[entry.kind]} · {entryCode(entry.seq)}
          </span>
          <span className="num ml-auto text-[11.5px] text-ink-3">{formatDate(entry.date, { year: true })}</span>
        </div>
        <h2 className="mt-2.5 text-[17px] leading-snug font-medium text-ink">{entry.title}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{entry.content}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.domains.map((d) => (
            <Chip key={d} color={DOMAIN_META[d].color}>
              {DOMAIN_META[d].label}
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
                <dt className="text-ink-3">Energy</dt>
                <dd className="text-ink-2">
                  {ENERGY_LABELS[String(ctx.energy)]} <span className="num text-ink-3">({ctx.energy}/5)</span>
                </dd>
              </>
            )}
            {ctx.mood !== undefined && (
              <>
                <dt className="text-ink-3">Mood</dt>
                <dd className="text-ink-2">{MOOD_LABELS[String(ctx.mood)]}</dd>
              </>
            )}
            {ctx.emotions?.length ? (
              <>
                <dt className="text-ink-3">Felt</dt>
                <dd className="text-ink-2">{ctx.emotions.join(', ')}</dd>
              </>
            ) : null}
            {ctx.setting && (
              <>
                <dt className="text-ink-3">Setting</dt>
                <dd className="text-ink-2">{ctx.setting}</dd>
              </>
            )}
          </dl>
        )}
        <div className="mt-3.5 flex items-center gap-1.5">
          <Button size="sm" icon={Pencil} onClick={() => openCapture(entry.kind, { kind: 'entry', id })}>
            Edit
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
        title="On the map"
        count={entry.nodeIds.length}
        aside={<IconButton icon={linking ? X : Plus} label={linking ? 'Cancel' : 'Link a node'} size="sm" onClick={() => setLinking(!linking)} />}
      >
        {linking && (
          <select
            className="field mb-2"
            autoFocus
            value=""
            aria-label="Link a node"
            onChange={(e) => {
              if (e.target.value) updateEntry(id, { nodeIds: [...entry.nodeIds, e.target.value] });
              setLinking(false);
            }}
          >
            <option value="">Choose a node…</option>
            {Object.values(data.nodes)
              .filter((n) => !entry.nodeIds.includes(n.id))
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
          </select>
        )}
        {entry.nodeIds.length ? (
          <div className="flex flex-wrap gap-1.5">
            {entry.nodeIds.map((n) => (
              <span key={n} className="group inline-flex items-center">
                <NodeChip id={n} />
                <button
                  type="button"
                  className="ml-0.5 rounded p-0.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
                  aria-label="Unlink"
                  title="Unlink"
                  onClick={() => updateEntry(id, { nodeIds: entry.nodeIds.filter((x) => x !== n) })}
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <Muted>Not linked to any node. Linked entries count as evidence for those nodes.</Muted>
        )}
      </PanelSection>

      <PanelSection title="Evidence in" count={usages.length}>
        {usages.length ? (
          <ul className="space-y-1.5">
            {usages.map(({ pattern, evidence }) => (
              <li key={pattern.id}>
                <button
                  type="button"
                  onClick={() => open({ kind: 'pattern', id: pattern.id })}
                  className="flex w-full items-start gap-2 rounded-[5px] px-1 py-1 text-left hover:bg-white/[0.035]"
                >
                  <StanceMark stance={evidence.stance} />
                  <span className="min-w-0">
                    <span className="label block">
                      {patternCode(pattern.code)} · {evidence.stance === 'supports' ? 'supports' : 'counters'}
                    </span>
                    <span className="block text-[13px] text-ink-2">{pattern.chain.join(' → ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Muted>Not cited by any pattern.</Muted>
        )}
      </PanelSection>

      <PanelSection
        title="Analysis"
        aside={
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} onClick={() => analyzeEntry(id)}>
            {analysis ? 'Re-run' : 'Analyse'}
          </Button>
        }
      >
        {!analysis ? (
          <Muted>Not analysed yet.</Muted>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[11.5px] text-ink-3">
                Observations · {analysis.provider} · {formatDate(analysis.generatedAt.slice(0, 10))}
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
                <Muted>Nothing specific enough to note.</Muted>
              )}
            </div>
            {pending.length > 0 && (
              <div>
                <div className="mb-1 text-[11.5px] text-ink-3">Suggestions for you to review</div>
                <ul className="divide-y divide-line rounded-[8px] border border-line">
                  {pending.map((s) => (
                    <SuggestionRow key={s.id} entryId={id} suggestion={s} />
                  ))}
                </ul>
              </div>
            )}
            {resolved.length > 0 && (
              <p className="text-[11.5px] text-ink-3">
                {resolved.filter((s) => s.state === 'accepted').length} accepted · {resolved.filter((s) => s.state === 'dismissed').length} dismissed
              </p>
            )}
          </div>
        )}
      </PanelSection>
    </div>
  );
}

function SuggestionRow({ entryId, suggestion: s }: { entryId: ID; suggestion: AnalysisSuggestion }) {
  const data = useAtlas((st) => st.data);
  const resolve = useAtlas((st) => st.resolveSuggestion);
  let title: React.ReactNode;
  if (s.type === 'pattern_evidence') {
    const p = data.patterns[s.patternId];
    title = (
      <>
        {s.stance === 'supports' ? 'May support' : 'May counter'}{' '}
        <span className="text-ink">{p ? `${patternCode(p.code)}: ${p.chain.join(' → ')}` : 'a pattern'}</span>
      </>
    );
  } else if (s.type === 'link_node') {
    title = (
      <>
        Link to <span className="text-ink">{data.nodes[s.nodeId]?.label ?? 'a node'}</span>
      </>
    );
  } else {
    title = (
      <>
        Also touches <span className="text-ink">{DOMAIN_META[s.domain].label}</span>
      </>
    );
  }
  return (
    <li className="flex items-start gap-2 px-2.5 py-2">
      {s.type === 'pattern_evidence' && <StanceMark stance={s.stance} />}
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] leading-snug text-ink-2">{title}</div>
        {s.type === 'pattern_evidence' && <div className="mt-0.5 text-[12px] text-ink-2 italic">“{s.excerpt}”</div>}
        <div className="mt-0.5 text-[11.5px] text-ink-3">{s.reason}</div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        <IconButton icon={Check} label="Accept" size="sm" onClick={() => resolve(entryId, s.id, true)} />
        <IconButton icon={X} label="Dismiss" size="sm" onClick={() => resolve(entryId, s.id, false)} />
      </div>
    </li>
  );
}
