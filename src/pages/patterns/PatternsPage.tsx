import { Check, ChevronDown, Plus, ScanSearch, X } from 'lucide-react';
import { PatternIcon } from '../../components/icons';
import { useMemo, useState } from 'react';
import { hrefFor } from '../../app/router';
import { KnowledgeTag, RegularityTag } from '../../components/evidence/Status';
import { EvidenceRow, StanceMark } from '../../components/evidence/EvidenceRow';
import { SourceLink } from '../../components/evidence/SourceLink';
import { ClaimRow, NodeChip } from '../../components/inspector/parts';
import { activeClaims, claimSentence, claimsTouching } from '../../domain/claims';
import { sharedWithRepeats } from '../../domain/ask';
import { AddReason } from '../../components/inspector/Ask';
import { PAGE_FRAME, PageHeader } from '../../components/shell/PageHeader';
import { Button, buttonClass, IconButton } from '../../components/ui/Button';
import { EmptyState, Section, Segmented, ToggleChip } from '../../components/ui/primitives';
import { EXPERIMENT_STATUS_LABEL, PATTERN_KIND_LABEL, STATUS_META } from '../../domain/constants';
import {
  decisionCode,
  entryCode,
  experimentCode,
  pathCode,
  patternStats,
  patternTitle,
  patternsForNode,
  pendingSuggestions,
  resolveSource,
  sortedPatterns,
} from '../../domain/selectors';
import type { ClaimStatus, ID, Pattern, PatternVerdict, SourceRef, Stance } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { excerpt } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';
import { scanAllEntries } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { DecisionRepeats } from './DecisionRepeats';
import { Almanac } from '../../components/repeats/Almanac';
import { DescribePatternModal } from './DescribePatternModal';
import { FocusBanner, useFocusFilter } from '../../components/shell/Focus';
import { focusElements, focusGraphId } from '../../domain/ask';
import { t, tn } from '../../i18n';

/**
 * Repeats: things that keep happening, drawn from your notes and decisions,
 * as an almanac of the year that turns (see Almanac), and under it the full
 * record of the one you read. With something in focus, only what involves it.
 */
export function PatternsPage({ patternId }: { patternId?: string }) {
  const data = useAtlas((s) => s.data);
  const busyScan = useUI((s) => s.busy.scan);
  const { focus, on, setOn } = useFocusFilter();
  const involved = useMemo(() => {
    if (!focus) return null;
    const ids = focusElements(data, focus);
    const hub = focusGraphId(focus);
    return new Set([...ids, ...(hub ? [hub] : [])].flatMap((id) => patternsForNode(data, id).map((p) => p.id)));
  }, [data, focus]);
  const allLive = sortedPatterns(data);
  const live = on && involved ? allLive.filter((p) => involved.has(p.id)) : allLive;
  const dismissed = Object.values(data.patterns).filter((p) => p.setAside && (!on || !involved || involved.has(p.id)));
  const selected = (patternId && data.patterns[patternId]) || live[0];
  const pending = pendingSuggestions(data).filter((p) => p.suggestion.type === 'pattern_evidence');

  const [describing, setDescribing] = useState(false);
  const empty = live.length === 0 && dismissed.length === 0;

  const scan = async () => {
    const n = await scanAllEntries();
    toast(n ? tn(n, '{n} suggestion for you to confirm.', '{n} suggestions for you to confirm.') : t('Nothing new found.'), { tone: 'success' });
  };

  return (
    <div className={PAGE_FRAME}>
      <PageHeader
        view="patterns"
        help="patterns"
        description={t(
          'Something like this has happened before: what keeps coming back in your notes and decisions, with every time it happened and the exceptions.',
        )}
        actions={
          <>
            <Button icon={Plus} onClick={() => setDescribing(true)}>
              {t('Describe one you suspect')}
            </Button>
            <Button variant="ghost" icon={ScanSearch} onClick={scan} loading={busyScan} disabled={empty}>
              {t('Look again')}
            </Button>
          </>
        }
      />
      {describing && <DescribePatternModal onClose={() => setDescribing(false)} />}

      {empty ? (
        <EmptyState
          icon={PatternIcon}
          title={t('Nothing repeats yet')}
          className="mt-6"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={Plus} onClick={() => useUI.getState().openCapture('journal')}>
                {t('Write a note')}
              </Button>
              <a href={hrefFor('timeline', 'decisions')} className={buttonClass('secondary')}>
                {t('Log a decision')}
              </a>
              <Button variant="ghost" onClick={() => setDescribing(true)}>
                {t('Describe one you suspect')}
              </Button>
            </div>
          }
        >
          {t(
            'A repeat shows up when several notes or decisions point the same way: something sets it off, you respond, and something follows. Write a handful of notes (plain facts work best) and it appears here, with the passages it rests on. Nothing counts until you say it rings true.',
          )}
        </EmptyState>
      ) : (
        <>
          <FocusBanner focus={focus} on={on} setOn={setOn} shown={live.length} total={allLive.length} className="mt-5" />
          {on && involved && live.length === 0 && dismissed.length === 0 && (
            <p className="mt-4 text-[13px] text-ink-3">
              {t('Nothing that repeats involves this yet. A repeat shows once something similar happens in separate weeks.')}
            </p>
          )}
          <Almanac
            patterns={live}
            selected={selected}
            schedule={
              <nav aria-label={t('Repeats')}>
                <div className="label mb-2">
                  {t('Keeps coming back')} · {live.length}
                </div>
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
                    <div className="label mt-5 mb-2">
                      {t('Put aside by you')} · {dismissed.length}
                    </div>
                    <ul className="space-y-1">
                      {dismissed.map((p) => (
                        <PatternListItem key={p.id} pattern={p} active={selected?.id === p.id} pendingCount={0} />
                      ))}
                    </ul>
                  </>
                )}
              </nav>
            }
          />
          {selected && (
            <div className="mt-8">
              <PatternDetail key={selected.id} pattern={selected} />
            </div>
          )}
        </>
      )}
      <DecisionRepeats />
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
          p.setAside && 'opacity-60',
        )}
      >
        <div className="flex items-center gap-2">
          <RegularityTag regularity={stats.regularity} />
          {pendingCount > 0 && (
            <span className="badge ml-auto" title={t('Notes that might belong here, waiting for a yes or no')}>
              {t('{n} to confirm', { n: pendingCount })}
            </span>
          )}
        </div>
        <div className="mt-1 text-[13px] leading-snug text-ink">{patternTitle(p)}</div>
      </a>
    </li>
  );
}

function PatternDetail({ pattern: p }: { pattern: Pattern }) {
  const data = useAtlas((s) => s.data);
  const setAside = useAtlas((s) => s.setPatternAside);
  const removeEvidence = useAtlas((s) => s.removePatternEvidence);
  const stats = patternStats(data, p);
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<'all' | Stance>('all');
  const sorted = [...p.evidence].sort((a, b) => (resolveSource(data, b.source).date ?? '').localeCompare(resolveSource(data, a.source).date ?? ''));
  const evidence = all ? sorted.filter((e) => filter === 'all' || e.stance === filter) : sorted.slice(0, 3);
  const log = data.modelLog
    .filter((l) => l.patternId === p.id)
    .slice()
    .reverse();
  const times = tn(stats.instances, '{n} time', '{n} times');
  const weeks = tn(stats.episodes, '{n} separate week', '{n} separate weeks');
  const summary =
    stats.instances === 0
      ? stats.frequency
      : stats.firstObserved === stats.lastObserved
        ? t('Happened once, on {date}.', { date: formatDate(stats.firstObserved, { year: true }) })
        : t('Happened {times} in {weeks}, first on {first} and last on {last}.', {
            times,
            weeks,
            first: formatDate(stats.firstObserved, { year: true }),
            last: formatDate(stats.lastObserved, { year: true }),
          });

  return (
    <article className="min-w-0" aria-labelledby="pattern-title">
      {/* What it is, in a line. */}
      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="label text-ink-2!">{PATTERN_KIND_LABEL[p.kind]}</span>
          <KnowledgeTag kind="observed" />
          <span className="ml-auto">
            <RegularityTag regularity={stats.regularity} />
          </span>
        </div>
        <h2 id="pattern-title" className="display mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[26px] text-ink">
          {p.steps.map((step, i) => (
            <span key={step.label} className="flex items-center gap-3">
              {i > 0 && <span className="font-mono text-[12px] tracking-[0.08em] text-ink-3">{t('then')}</span>}
              <span>{step.label}</span>
            </span>
          ))}
        </h2>
        <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-2">
          {summary}
          {stats.counter > 0 && ` ${tn(stats.counter, '{n} exception', '{n} exceptions')}.`}
        </p>
        {stats.counter === 0 && (
          <p className="mt-1 text-[12.5px] text-ink-3">{t('No exceptions recorded yet. That usually means none has been looked for, not that none exists.')}</p>
        )}
        {p.setAside && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-[2px] border border-dashed border-line-strong px-3 py-2 text-[12.5px] text-ink-2">
            {p.setAside.note
              ? t('You set this repeat aside: “{note}” It no longer informs options or the overview, and stays here for reference.', { note: p.setAside.note })
              : t('You set this repeat aside. It no longer informs options or the overview, and stays here for reference.')}
            <Button size="sm" variant="ghost" onClick={() => setAside(p.id, false)}>
              {t('Restore repeat')}
            </Button>
          </p>
        )}
      </header>

      <div className="mt-7 space-y-7">
        {/* The moments: the latest few, all of them on asking. */}
        <Section
          title={`${t('The moments')} · ${p.evidence.length}`}
          aside={
            all ? (
              <Segmented<'all' | Stance>
                label={t('Filter evidence')}
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('All') },
                  { value: 'supports', label: t('Times {n}', { n: stats.instances }) },
                  { value: 'counters', label: t('Exceptions {n}', { n: stats.counter }) },
                ]}
              />
            ) : undefined
          }
        >
          <PendingEvidence patternId={p.id} />
          <ul className="divide-y divide-line">
            {evidence.map((e) => (
              <EvidenceRow key={e.id} evidence={e} onRemove={() => removeEvidence(p.id, e.id)} />
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.evidence.length > 3 && (
              <Button size="sm" variant="ghost" icon={ChevronDown} onClick={() => setAll((v) => !v)} className={cn(all && '[&_svg]:rotate-180')}>
                {all ? t('Show fewer') : t('Show all {n}', { n: p.evidence.length })}
              </Button>
            )}
            <AddEvidence pattern={p} />
          </div>
        </Section>

        <Assessment pattern={p} />

        {/* Everything else, folded away until asked for. */}
        <details className="pattern-more group">
          <summary className="tap flex cursor-pointer list-none items-center justify-between">
            <span className="label text-ink-2!">{t('Full details')}</span>
            <ChevronDown size={14} className="text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-6 space-y-7">
            <Explanations pattern={p} />

            <Section title={t('What it might mean for your options')}>
              {p.implications.length ? (
                <ul className="space-y-2.5">
                  {p.implications.map((im) => (
                    <li key={im.id}>
                      <p className="text-[13.5px] text-ink">{im.statement}</p>
                      {im.pathIds.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {im.pathIds.map((pid) =>
                            data.paths[pid] ? (
                              <a key={pid} href="#/paths" className="tap rounded-[2px] border border-line px-1.5 py-px text-[12px] text-ink-2 hover:text-ink">
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
                <p className="text-[13px] text-ink-3">{t('No implications recorded.')}</p>
              )}
            </Section>

            <PatternExperiments pattern={p} />

            {p.nodeIds.length > 0 && (
              <Section title={t('Involves')}>
                <div className="flex flex-wrap gap-1.5">
                  {p.nodeIds.map((n) => (
                    <NodeChip key={n} id={n} />
                  ))}
                </div>
              </Section>
            )}

            <Section title={t('How it changed')}>
              {log.length ? (
                <ol className="space-y-2">
                  {log.map((l) => (
                    <li key={l.id} className="grid grid-cols-[88px_1fr_auto] items-baseline gap-3 text-[12.5px]">
                      <span className="num text-ink-3">{formatDate(l.at, { year: true })}</span>
                      <span className="text-ink-2">{l.summary}</span>
                      {l.after !== undefined && (
                        <span className="text-[11.5px] text-ink-2">
                          {l.before !== undefined ? `${statusWord(l.before)} → ` : ''}
                          {statusWord(l.after)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] text-ink-3">{t('No recorded changes.')}</p>
              )}
            </Section>

            {(p.cues.supports.length > 0 || p.cues.counters.length > 0) && (
              <Section title={t('How the analyzer looks for evidence')}>
                <div className="grid gap-3 text-[12.5px] sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-ink-3">{t('Phrases that suggest support')}</div>
                    <div className="flex flex-wrap gap-1">
                      {p.cues.supports.map((c) => (
                        <code key={c} className="rounded-[2px] bg-ink/[0.05] px-1.5 py-px font-mono text-[11.5px] text-ink-2">
                          {c}
                        </code>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-ink-3">{t('Phrases that suggest counter-evidence')}</div>
                    <div className="flex flex-wrap gap-1">
                      {p.cues.counters.map((c) => (
                        <code key={c} className="rounded-[2px] bg-ink/[0.05] px-1.5 py-px font-mono text-[11.5px] text-ink-2">
                          {c}
                        </code>
                      ))}
                    </div>
                  </div>
                  <p className="text-ink-3 sm:col-span-2">{t('Matches are only ever proposed. Nothing becomes evidence until you accept it.')}</p>
                </div>
              </Section>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}

/** Log entries store statuses by key; show them in words. */
const statusWord = (s: string) => STATUS_META[s as ClaimStatus]?.label ?? s;

/**
 * Why it may happen: the claims offered as explanations. A pattern only says
 * what keeps happening; each explanation is a claim with its own evidence.
 */
function Explanations({ pattern: p }: { pattern: Pattern }) {
  const data = useAtlas((s) => s.data);
  const toggle = useAtlas((s) => s.toggleExplanation);
  const [adding, setAdding] = useState(false);
  const candidates = useMemo(() => {
    const ids = new Set<ID>();
    const involved = [...p.nodeIds, ...p.steps.flatMap((x) => (x.elementId ? [x.elementId] : []))];
    for (const n of involved) for (const c of claimsTouching(data, n)) if (c.state === 'adopted' && !p.explainedBy.includes(c.id)) ids.add(c.id);
    return [...ids];
  }, [data, p]);
  return (
    <Section
      title={t('Why it may happen')}
      aside={
        candidates.length > 0 && (
          <Button size="sm" variant="ghost" icon={adding ? X : Plus} onClick={() => setAdding(!adding)}>
            {adding ? t('Done') : t('Add an explanation')}
          </Button>
        )
      }
    >
      <p className="mb-2 text-[12px] text-ink-3">
        {t(
          'A repeat says what keeps happening, one step then the next. Why each step follows the last is a possible reason, the same one Causes shows, checked against the same weeks.',
        )}
      </p>
      <StepReasons pattern={p} />
      <div className="mt-3 mb-1 text-[11.5px] text-ink-3">{t('Reasons for the repeat as a whole')}</div>
      {p.explainedBy.length ? (
        <ul className="-mx-1.5">
          {p.explainedBy.map((c) => (
            <li key={c} className="flex items-start">
              <ul className="min-w-0 flex-1">
                <ClaimRow id={c} />
              </ul>
              <IconButton icon={X} size="sm" label={t('Remove')} onClick={() => toggle(p.id, c)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">{t('No explanation attached yet.')}</p>
      )}
      {adding && (
        <ul className="mt-1.5">
          {candidates.map((c) => (
            <li key={c}>
              <button
                type="button"
                className="flex w-full items-start gap-1.5 py-[3px] text-left text-[12.5px] text-ink-2 hover:text-ink"
                onClick={() => toggle(p.id, c)}
              >
                <Plus size={12} className="mt-[3px] shrink-0" aria-hidden />
                {claimSentence(data, data.claims[c]!)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Each step and the next, with the possible reasons between them: shared with Causes, never a copy. */
function StepReasons({ pattern: p }: { pattern: Pattern }) {
  const data = useAtlas((s) => s.data);
  const [adding, setAdding] = useState<number | null>(null);
  const pairs = p.steps.slice(1).map((step, i) => ({ i, a: p.steps[i], b: step }));
  if (!pairs.length) return null;
  const linked = pairs.filter((x) => x.a.elementId && x.b.elementId && data.nodes[x.a.elementId] && data.nodes[x.b.elementId]);
  if (!linked.length) return <p className="text-[12.5px] text-ink-3">{t('Link the steps to things on your map to ask why each one follows the last.')}</p>;
  return (
    <ul className="space-y-2.5">
      {linked.map(({ i, a, b }) => {
        const from = a.elementId!;
        const to = b.elementId!;
        const reasons = activeClaims(data).filter((c) => c.to === to && (c.from === from || c.with.includes(from)));
        return (
          <li key={i} className="rounded-[2px] border border-line px-3 py-2">
            <div className="text-[12px] text-ink-3">{t('{a}, then {b}', { a: a.label, b: b.label })}</div>
            {reasons.length ? (
              <ul className="-mx-1.5 mt-0.5">
                {reasons.map((c) => {
                  const shared = sharedWithRepeats(data, c).find((x) => x.pattern.id === p.id)?.weeks ?? 0;
                  return (
                    <li key={c.id}>
                      <ul>
                        <ClaimRow id={c.id} />
                      </ul>
                      {shared > 0 && (
                        <p className="px-1.5 text-[11px] text-ink-3">
                          {tn(
                            shared,
                            'Shares {n} episode with this repeat: the same time, not a second confirmation.',
                            'Shares {n} episodes with this repeat: the same times, not a second confirmation.',
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : adding === i ? (
              <div className="mt-1.5">
                <AddReason to={to} area={data.nodes[to]!.area} initial={data.nodes[from]!.label} onDone={() => setAdding(null)} />
              </div>
            ) : (
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                {t('No possible reason for this step yet.')}{' '}
                <button type="button" className="tap text-accent hover:underline" onClick={() => setAdding(i)}>
                  {t('Add one')}
                </button>
              </p>
            )}
          </li>
        );
      })}
    </ul>
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
        <span className="text-[12.5px] text-ink">{t('Proposed by analysis · review before it counts')}</span>
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
                    {s.stance === 'supports' ? t('may support') : t('may counter')} · {s.reason}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-ink-2">“{s.excerpt}”</p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <IconButton icon={Check} size="sm" label={t('Accept as evidence')} onClick={() => resolve(entry.id, s.id, true)} />
                <IconButton icon={X} size="sm" label={t('Dismiss')} onClick={() => resolve(entry.id, s.id, false)} />
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
  const addEvidence = useAtlas((s) => s.addPatternEvidence);
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
        {t('Add evidence')}
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
        <select className="field" value={source} onChange={(e) => pick(e.target.value)} aria-label={t('Record')} required>
          <option value="">{t('Choose an entry or decision…')}</option>
          <optgroup label={t('Entries')}>
            {entries.map((e) => (
              <option key={e.id} value={`entry:${e.id}`}>
                {entryCode(e.seq)} · {e.title}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('Decisions')}>
            {decisions.map((d) => (
              <option key={d.id} value={`decision:${d.id}`}>
                {decisionCode(d.seq)} · {d.title}
              </option>
            ))}
          </optgroup>
        </select>
        <Segmented<Stance>
          label={t('Stance')}
          value={stance}
          onChange={setStance}
          options={[
            { value: 'supports', label: t('Instance') },
            { value: 'counters', label: t('Counter-case') },
          ]}
        />
      </div>
      <textarea
        className="field min-h-[56px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('The exact passage that bears on this repeat')}
        aria-label={t('Excerpt')}
        required
      />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit">
          {t('Add evidence')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

function PatternExperiments({ pattern }: { pattern: Pattern }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const linked = useMemo(
    () => Object.values(data.experiments).filter((x) => x.patternIds.includes(pattern.id) || (x.claimId && pattern.explainedBy.includes(x.claimId))),
    [data.experiments, pattern.id, pattern.explainedBy],
  );
  return (
    <Section title={t('Tests')}>
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
        <p className="text-[13px] text-ink-3">
          {t('Nothing tests this yet. Tests check the reasons that explain a repeat: open one of them and choose “Design a test”.')}
        </p>
      )}
    </Section>
  );
}

function Assessment({ pattern }: { pattern: Pattern }) {
  const assess = useAtlas((s) => s.assessPattern);
  const setAside = useAtlas((s) => s.setPatternAside);
  const [note, setNote] = useState(pattern.userAssessment?.note ?? '');
  const current = pattern.userAssessment?.verdict;
  const options: { value: PatternVerdict; label: string }[] = [
    { value: 'resonates', label: t('It rings true') },
    { value: 'partial', label: t('Partly') },
    { value: 'inaccurate', label: t('Not really') },
  ];
  return (
    <Section title={t('Does this ring true?')}>
      <p className="mb-2.5 text-[13px] text-ink-2">{t('Your view is kept beside what your notes show and never changes it. You can also put it aside.')}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <ToggleChip key={o.value} on={current === o.value} onClick={() => assess(pattern.id, o.value, note)} className="px-2.5 py-1 text-[12.5px]">
            {o.label}
          </ToggleChip>
        ))}
        {pattern.setAside ? (
          <Button size="sm" variant="ghost" onClick={() => setAside(pattern.id, false)}>
            {t('Restore repeat')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setAside(pattern.id, true, note.trim() || undefined)}>
            {t('Put aside')}
          </Button>
        )}
      </div>
      {/* A note, once there is a view to note. */}
      {current && (
        <textarea
          className="field mt-2.5 min-h-[56px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (pattern.userAssessment?.note ?? '') && assess(pattern.id, current, note)}
          placeholder={t('What does it miss? (optional)')}
          aria-label={t('Assessment note')}
        />
      )}
      {pattern.userAssessment && (
        <p className="mt-1.5 text-[11.5px] text-ink-3">{t('Last assessed {date}', { date: formatDate(pattern.userAssessment.at, { year: true }) })}</p>
      )}
    </Section>
  );
}
