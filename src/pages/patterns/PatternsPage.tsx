import { ArrowLeft, ArrowRight, Check, ChevronDown, Plus, ScanSearch, X } from 'lucide-react';
import { ExperimentIcon, PatternIcon } from '../../components/icons';
import { useMemo, useState } from 'react';
import type { ExperimentDraft } from '../../ai/types';
import { hrefFor, navigate } from '../../app/router';
import { ConfidenceMeter, EstimateTag } from '../../components/evidence/Confidence';
import { EvidenceRow, StanceMark } from '../../components/evidence/EvidenceRow';
import { EvidenceTimeline } from '../../components/evidence/EvidenceTimeline';
import { SourceLink } from '../../components/evidence/SourceLink';
import { NodeChip } from '../../components/inspector/parts';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button, buttonClass, IconButton } from '../../components/ui/Button';
import { EmptyState, Label, Section, Segmented, ToggleChip } from '../../components/ui/primitives';
import { CONFIDENCE_EXPLAINER, pct } from '../../domain/confidence';
import { EXPERIMENT_STATUS_LABEL, PATTERN_KIND_LABEL, PATTERN_STATUS_LABEL } from '../../domain/constants';
import {
  decisionCode,
  entryCode,
  experimentCode,
  pathCode,
  patternCode,
  patternStats,
  pendingSuggestions,
  resolveSource,
  sortedPatterns,
} from '../../domain/selectors';
import type { ID, Pattern, PatternStatus, PatternVerdict, SourceRef, Stance } from '../../domain/types';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { excerpt } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';
import { adoptExperimentDraft, proposeExperiments, scanAllEntries } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { DescribePatternModal } from './DescribePatternModal';

export function PatternsPage({ patternId }: { patternId?: string }) {
  const data = useAtlas((s) => s.data);
  const busyScan = useUI((s) => s.busy.scan);
  const isDesktop = useIsDesktop();
  const live = sortedPatterns(data);
  const dismissed = Object.values(data.patterns).filter((p) => p.status === 'dismissed');
  const selected = (patternId && data.patterns[patternId]) || (isDesktop ? live[0] : undefined);
  const pending = pendingSuggestions(data).filter((p) => p.suggestion.type === 'pattern_evidence');

  const [describing, setDescribing] = useState(false);
  const empty = live.length === 0 && dismissed.length === 0;

  const scan = async () => {
    const n = await scanAllEntries();
    toast(n ? `${n} suggestion${n === 1 ? '' : 's'} waiting for review.` : 'No new suggestions found.', { tone: 'success' });
  };

  const showList = isDesktop || !patternId;
  return (
    <div className="mx-auto max-w-[1320px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        view="patterns"
        help="patterns"
        description="Things that keep happening in your notes, each with the evidence for and against it. Observed, never diagnosed."
        actions={
          <>
            <Button variant="ghost" icon={Plus} onClick={() => setDescribing(true)}>
              Describe a pattern
            </Button>
            <Button icon={ScanSearch} onClick={scan} loading={busyScan} disabled={empty}>
              Look for evidence
            </Button>
          </>
        }
      />
      {describing && <DescribePatternModal onClose={() => setDescribing(false)} />}

      {empty ? (
        <EmptyState
          icon={PatternIcon}
          title="No patterns yet"
          className="mt-6"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={Plus} onClick={() => useUI.getState().openCapture('journal')}>
                Capture an entry
              </Button>
              <a href={hrefFor('decisions')} className={buttonClass('secondary')}>
                Open the decision log
              </a>
              <Button variant="ghost" onClick={() => setDescribing(true)}>
                Describe one you suspect
              </Button>
            </div>
          }
        >
          A pattern is proposed when several entries or decisions point the same way: a trigger, a behaviour that follows it, and a consequence. Capture a
          handful of entries (plain facts work best), log decisions with what you were optimising for, then scan. Every proposal shows the passages it rests on,
          and nothing counts until you accept it.
        </EmptyState>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {showList && (
            <nav aria-label="Patterns" className="lg:sticky lg:top-0 lg:self-start">
              <>
                <div className="label mb-2">In the model · {live.length}</div>
                <ul className="space-y-1">
                  {live.map((p) => (
                    <PatternListItem
                      key={p.id}
                      pattern={p}
                      active={selected?.id === p.id}
                      pendingCount={pending.filter((x) => x.suggestion.type === 'pattern_evidence' && x.suggestion.patternId === p.id).length}
                    />
                  ))}
                </ul>
                {dismissed.length > 0 && (
                  <>
                    <div className="label mt-5 mb-2">Dismissed by you · {dismissed.length}</div>
                    <ul className="space-y-1">
                      {dismissed.map((p) => (
                        <PatternListItem key={p.id} pattern={p} active={selected?.id === p.id} pendingCount={0} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            </nav>
          )}
          {selected && (isDesktop || patternId) ? (
            <div>
              {!isDesktop && (
                <Button size="sm" variant="ghost" icon={ArrowLeft} className="mb-3" onClick={() => navigate('patterns')}>
                  All patterns
                </Button>
              )}
              <PatternDetail key={selected.id} pattern={selected} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PatternListItem({ pattern: p, active, pendingCount }: { pattern: Pattern; active: boolean; pendingCount: number }) {
  const data = useAtlas((s) => s.data);
  const stats = patternStats(data, p);
  return (
    <li>
      <a
        href={`#/patterns/${p.id}`}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'block rounded-[2px] border px-3 py-2.5 transition-colors',
          active ? 'border-line-strong bg-raised' : 'border-transparent hover:border-line hover:bg-surface',
          p.status === 'dismissed' && 'opacity-60',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="label">{patternCode(p.code)}</span>
          {p.status !== 'active' && <span className="rounded-[2px] border border-line px-1 text-[11px] text-ink-3">{PATTERN_STATUS_LABEL[p.status]}</span>}
          {pendingCount > 0 && (
            <span className="ml-auto rounded-full bg-accent-dim px-1.5 text-[10.5px] text-accent" title="Evidence suggestions waiting for review">
              {pendingCount} to review
            </span>
          )}
        </div>
        <div className="mt-1 text-[13px] leading-snug text-ink">{p.chain.join(' → ')}</div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="h-[3px] flex-1 rounded-full bg-ink/[0.07]">
            <div className="h-full rounded-full bg-ink-2" style={{ width: pct(stats.confidence) }} />
          </div>
          <span className="num text-[11.5px] text-ink-2">{pct(stats.confidence)}</span>
          <span className="num text-[11px] text-ink-3" title={`${stats.supportCount} supporting, ${stats.counterCount} counter`}>
            {stats.supportCount}/{stats.counterCount}
          </span>
        </div>
      </a>
    </li>
  );
}

function PatternDetail({ pattern: p }: { pattern: Pattern }) {
  const data = useAtlas((s) => s.data);
  const setStatus = useAtlas((s) => s.setPatternStatus);
  const removeEvidence = useAtlas((s) => s.removeEvidence);
  const stats = patternStats(data, p);
  const [filter, setFilter] = useState<'all' | Stance>('all');
  const evidence = [...p.evidence]
    .filter((e) => filter === 'all' || e.stance === filter)
    .sort((a, b) => (resolveSource(data, b.source).date ?? '').localeCompare(resolveSource(data, a.source).date ?? ''));
  const log = data.modelLog
    .filter((l) => l.patternId === p.id)
    .slice()
    .reverse();

  return (
    <article className="min-w-0" aria-labelledby="pattern-title">
      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="label text-ink-2!">
            {patternCode(p.code)} · {PATTERN_KIND_LABEL[p.kind]} · Observed pattern
          </span>
          {p.status !== 'dismissed' && (
            <span className="ml-auto">
              <Segmented<PatternStatus>
                label="Status"
                size="sm"
                value={p.status}
                onChange={(s) => setStatus(p.id, s)}
                options={(['emerging', 'active', 'weakening'] as const).map((s) => ({ value: s, label: PATTERN_STATUS_LABEL[s] }))}
              />
            </span>
          )}
        </div>
        <h2 id="pattern-title" className="display mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[26px] text-ink">
          {p.chain.map((step, i) => (
            <span key={step} className="flex items-center gap-3">
              {i > 0 && <ArrowRight size={18} strokeWidth={1.3} className="text-accent" aria-hidden />}
              <span>{step}</span>
            </span>
          ))}
        </h2>
        <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-2">
          <span className="label mr-2">Observation</span>
          {p.observation}
        </p>
        {p.status === 'dismissed' && (
          <p className="mt-3 rounded-[2px] border border-dashed border-line-strong px-3 py-2 text-[12.5px] text-ink-2">
            You dismissed this pattern{p.userAssessment?.note ? `: “${p.userAssessment.note}”` : '.'} It no longer informs paths or the dashboard, and stays
            here for reference.
          </p>
        )}
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[2px] border border-line bg-line sm:grid-cols-5">
        <Stat label="Frequency" value={stats.frequency} />
        <div className="bg-surface px-3.5 py-3" title={CONFIDENCE_EXPLAINER}>
          <dt className="label">Confidence</dt>
          <dd className="mt-1">
            <ConfidenceMeter value={stats.confidence} size="sm" />
          </dd>
        </div>
        <Stat label="Evidence" value={`${stats.supportCount} for · ${stats.counterCount} against`} />
        <Stat label="First observed" value={formatDate(stats.firstObserved, { year: true })} mono />
        <Stat label="Last observed" value={formatDate(stats.lastObserved, { year: true })} mono className="col-span-2 sm:col-span-1" />
      </dl>

      <div className="mt-5 rounded-[2px] border border-line bg-surface px-4 pt-3.5 pb-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Label>Evidence over time</Label>
          <span className="flex items-center gap-3 text-[11.5px] text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-support" aria-hidden /> supports
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border-[1.5px] border-counter" aria-hidden /> counters
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-3 bg-ink-2" aria-hidden /> confidence
            </span>
            <span>larger dot = experiment (×2)</span>
          </span>
        </div>
        <EvidenceTimeline pattern={p} history={stats.history} />
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-[2px] border border-line bg-line md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <ChainColumn title="Triggers" items={p.triggers} />
        <ChainArrow />
        <ChainColumn title="Behaviour" items={p.behaviors} />
        <ChainArrow />
        <ChainColumn title="Consequence" items={p.consequences} />
      </div>

      <div className="mt-7 space-y-7">
        <Section
          title={`Evidence · ${p.evidence.length}`}
          aside={
            <Segmented<'all' | Stance>
              label="Filter evidence"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'supports', label: `For ${stats.supportCount}` },
                { value: 'counters', label: `Against ${stats.counterCount}` },
              ]}
            />
          }
        >
          <PendingEvidence patternId={p.id} />
          <ul className="divide-y divide-line">
            {evidence.map((e) => (
              <EvidenceRow key={e.id} evidence={e} onRemove={() => removeEvidence(p.id, e.id)} />
            ))}
          </ul>
          <AddEvidence pattern={p} />
        </Section>

        <Section title="Possible interpretations">
          <p className="mb-3 text-[12px] text-ink-3">
            Readings of the pattern, not conclusions about you. Estimates come from the analysis layer; confidence above comes only from evidence.
          </p>
          <ul className="space-y-3">
            {p.interpretations.map((i) => (
              <li key={i.id} className="rounded-[2px] border border-line px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] leading-snug text-ink">{i.statement}</p>
                  <EstimateTag value={i.confidence} />
                </div>
                {i.rationale && <p className="mt-1.5 text-[12.5px] text-ink-2">{i.rationale}</p>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Counter-evidence">
          {p.counterEvidence.length ? (
            <ul className="space-y-2.5">
              {p.counterEvidence.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <StanceMark stance="counters" />
                  <div>
                    <p className="text-[13.5px] text-ink">{c.statement}</p>
                    <div className="mt-0.5 flex flex-wrap gap-2">
                      {c.sources.map((s) => (
                        <SourceLink key={`${s.kind}:${s.id}`} source={s} showTitle />
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">
              No counter-evidence recorded yet. That usually means it has not been looked for, not that none exists. A counter-evidence experiment below can
              test it.
            </p>
          )}
        </Section>

        <Section title="Strategic implications">
          {p.implications.length ? (
            <ul className="space-y-2.5">
              {p.implications.map((im) => (
                <li key={im.id}>
                  <p className="text-[13.5px] text-ink">{im.statement}</p>
                  {im.pathIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {im.pathIds.map((pid) =>
                        data.paths[pid] ? (
                          <a key={pid} href="#/paths" className="rounded-[2px] border border-line px-1.5 py-px text-[12px] text-ink-2 hover:text-ink">
                            {pathCode(data.paths[pid].code)} · {data.paths[pid].title}
                          </a>
                        ) : null,
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">No implications recorded.</p>
          )}
        </Section>

        <PatternExperiments pattern={p} />

        {p.nodeIds.length > 0 && (
          <Section title="In the Mind graph">
            <div className="flex flex-wrap gap-1.5">
              {p.nodeIds.map((n) => (
                <NodeChip key={n} id={n} />
              ))}
            </div>
          </Section>
        )}

        <Assessment pattern={p} />

        <Section title="Model history">
          {log.length ? (
            <ol className="space-y-2">
              {log.map((l) => (
                <li key={l.id} className="grid grid-cols-[88px_1fr_auto] items-baseline gap-3 text-[12.5px]">
                  <span className="num text-ink-3">{formatDate(l.at.slice(0, 10), { year: true })}</span>
                  <span className="text-ink-2">{l.summary}</span>
                  {l.after !== undefined && (
                    <span className="num text-ink-2">
                      {l.before !== undefined ? `${pct(l.before)} → ` : ''}
                      {pct(l.after)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-ink-3">No recorded changes.</p>
          )}
        </Section>

        {(p.cues.supports.length > 0 || p.cues.counters.length > 0) && (
          <details className="group rounded-[2px] border border-line px-3.5 py-2.5">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="label">How the analyzer looks for evidence</span>
              <ChevronDown size={14} className="text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2.5 grid gap-3 text-[12.5px] sm:grid-cols-2">
              <div>
                <div className="mb-1 text-ink-3">Phrases that suggest support</div>
                <div className="flex flex-wrap gap-1">
                  {p.cues.supports.map((c) => (
                    <code key={c} className="rounded-[2px] bg-ink/[0.05] px-1.5 py-px font-mono text-[11.5px] text-ink-2">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-ink-3">Phrases that suggest counter-evidence</div>
                <div className="flex flex-wrap gap-1">
                  {p.cues.counters.map((c) => (
                    <code key={c} className="rounded-[2px] bg-ink/[0.05] px-1.5 py-px font-mono text-[11.5px] text-ink-2">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
              <p className="text-ink-3 sm:col-span-2">Matches are only ever proposed. Nothing becomes evidence until you accept it.</p>
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className={cn('bg-surface px-3.5 py-3', className)}>
      <dt className="label">{label}</dt>
      <dd className={cn('mt-1.5 text-ink', mono ? 'num text-[13px]' : 'display text-[17px] leading-[1.2]')}>{value}</dd>
    </div>
  );
}

function ChainColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="label mb-2">{title}</div>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i} className="text-[13px] leading-snug text-ink-2">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChainArrow() {
  return (
    <div className="hidden items-center justify-center bg-surface px-1 md:flex" aria-hidden>
      <ArrowRight size={14} className="text-ink-3" />
    </div>
  );
}

function PendingEvidence({ patternId }: { patternId: ID }) {
  const data = useAtlas((s) => s.data);
  const resolve = useAtlas((s) => s.resolveSuggestion);
  const items = pendingSuggestions(data).filter((x) => x.suggestion.type === 'pattern_evidence' && x.suggestion.patternId === patternId);
  if (!items.length) return null;
  return (
    <div className="ticks relative mb-3 rounded-[2px] border border-line-strong [--tick-color:var(--color-accent)]">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="atlas-live-dot h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        <span className="text-[12.5px] text-ink">Proposed by analysis · review before it counts</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map(({ entry, suggestion: s }) =>
          s.type === 'pattern_evidence' ? (
            <li key={s.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <StanceMark stance={s.stance} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <SourceLink source={{ kind: 'entry', id: entry.id }} />
                  <span className="text-[12px] text-ink-3">
                    {s.stance === 'supports' ? 'may support' : 'may counter'} · {s.reason}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-ink-2">“{s.excerpt}”</p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <IconButton icon={Check} size="sm" label="Accept as evidence" onClick={() => resolve(entry.id, s.id, true)} />
                <IconButton icon={X} size="sm" label="Dismiss" onClick={() => resolve(entry.id, s.id, false)} />
              </div>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

function AddEvidence({ pattern }: { pattern: Pattern }) {
  const data = useAtlas((s) => s.data);
  const addEvidence = useAtlas((s) => s.addEvidence);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [stance, setStance] = useState<Stance>('supports');
  const [text, setText] = useState('');
  const used = new Set(pattern.evidence.map((e) => `${e.source.kind}:${e.source.id}`));
  const entries = Object.values(data.entries)
    .filter((e) => !used.has(`entry:${e.id}`))
    .sort((a, b) => b.date.localeCompare(a.date));
  const decisions = Object.values(data.decisions)
    .filter((d) => !used.has(`decision:${d.id}`))
    .sort((a, b) => b.date.localeCompare(a.date));

  const pick = (value: string) => {
    setSource(value);
    const [kind, id] = value.split(':');
    const body = kind === 'entry' ? data.entries[id]?.content : data.decisions[id]?.chosenAction || data.decisions[id]?.context;
    setText(body ? excerpt(body, 180) : '');
  };

  if (!open)
    return (
      <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setOpen(true)}>
        Add evidence
      </Button>
    );
  return (
    <form
      className="mt-3 space-y-2.5 rounded-[2px] border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!source || !text.trim()) return;
        const [kind, id] = source.split(':') as [SourceRef['kind'], string];
        addEvidence(pattern.id, { source: { kind, id }, stance, excerpt: text.trim(), addedBy: 'user' });
        setOpen(false);
        setSource('');
        setText('');
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select className="field" value={source} onChange={(e) => pick(e.target.value)} aria-label="Record" required>
          <option value="">Choose an entry or decision…</option>
          <optgroup label="Entries">
            {entries.map((e) => (
              <option key={e.id} value={`entry:${e.id}`}>
                {entryCode(e.seq)} · {e.title}
              </option>
            ))}
          </optgroup>
          <optgroup label="Decisions">
            {decisions.map((d) => (
              <option key={d.id} value={`decision:${d.id}`}>
                {decisionCode(d.seq)} · {d.title}
              </option>
            ))}
          </optgroup>
        </select>
        <Segmented<Stance>
          label="Stance"
          value={stance}
          onChange={setStance}
          options={[
            { value: 'supports', label: 'Supports' },
            { value: 'counters', label: 'Counters' },
          ]}
        />
      </div>
      <textarea
        className="field min-h-[56px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="The exact passage that bears on this pattern"
        aria-label="Excerpt"
        required
      />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit">
          Add evidence
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PatternExperiments({ pattern }: { pattern: Pattern }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const busy = useUI((s) => s.busy[`propose:${pattern.id}`]);
  const [drafts, setDrafts] = useState<ExperimentDraft[] | null>(null);
  const linked = useMemo(
    () => Object.values(data.experiments).filter((x) => x.patternLinks.some((l) => l.patternId === pattern.id)),
    [data.experiments, pattern.id],
  );

  return (
    <Section
      title="Experiments"
      aside={
        pattern.status !== 'dismissed' && (
          <Button size="sm" variant="ghost" icon={ExperimentIcon} loading={busy} onClick={async () => setDrafts(await proposeExperiments(pattern.id))}>
            Suggest experiments
          </Button>
        )
      }
    >
      {linked.length ? (
        <ul className="space-y-1.5">
          {linked.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => open({ kind: 'experiment', id: x.id })}
                className="flex w-full items-baseline gap-3 rounded-[2px] px-1.5 py-1 text-left hover:bg-ink/[0.035]"
              >
                <span className="num w-12 shrink-0 text-[12px] text-ink-3">{experimentCode(x.code)}</span>
                <span className="min-w-0 flex-1 text-[13px] text-ink-2">{x.hypothesis}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3">{EXPERIMENT_STATUS_LABEL[x.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">No experiment tests this pattern yet.</p>
      )}
      {drafts && (
        <div className="mt-3 space-y-2">
          {drafts.map((d) => (
            <div key={d.title} className="rounded-[2px] border border-dashed border-line-strong px-3.5 py-3">
              <div className="label">Draft · {d.durationDays} days</div>
              <p className="mt-1 text-[13.5px] text-ink">{d.hypothesis}</p>
              <p className="mt-1 text-[12.5px] text-ink-2">{d.design}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const id = adoptExperimentDraft(d, { patternId: pattern.id });
                    setDrafts((ds) => ds?.filter((x) => x !== d) ?? null);
                    open({ kind: 'experiment', id });
                  }}
                >
                  Add as proposed experiment
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDrafts((ds) => ds?.filter((x) => x !== d) ?? null)}>
                  Discard
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Assessment({ pattern }: { pattern: Pattern }) {
  const assess = useAtlas((s) => s.assessPattern);
  const setStatus = useAtlas((s) => s.setPatternStatus);
  const [note, setNote] = useState(pattern.userAssessment?.note ?? '');
  const current = pattern.userAssessment?.verdict;
  const options: { value: PatternVerdict; label: string }[] = [
    { value: 'resonates', label: 'Matches my experience' },
    { value: 'partial', label: 'Partly' },
    { value: 'inaccurate', label: 'Not accurate' },
  ];
  return (
    <Section title="Your assessment">
      <p className="mb-2.5 text-[13px] text-ink-2">
        Does this match your experience? Your answer is recorded in the model history; “not accurate” dismisses the pattern.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <ToggleChip key={o.value} on={current === o.value} onClick={() => assess(pattern.id, o.value, note)} className="px-2.5 py-1 text-[12.5px]">
            {o.label}
          </ToggleChip>
        ))}
        {pattern.status === 'dismissed' && (
          <Button size="sm" variant="ghost" onClick={() => setStatus(pattern.id, 'emerging')}>
            Restore pattern
          </Button>
        )}
      </div>
      <textarea
        className="field mt-2.5 min-h-[56px]"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => current && note !== (pattern.userAssessment?.note ?? '') && assess(pattern.id, current, note)}
        placeholder="What does the analysis miss? (optional)"
        aria-label="Assessment note"
      />
      {pattern.userAssessment && (
        <p className="mt-1.5 text-[11.5px] text-ink-3">Last assessed {formatDate(pattern.userAssessment.at.slice(0, 10), { year: true })}</p>
      )}
    </Section>
  );
}
