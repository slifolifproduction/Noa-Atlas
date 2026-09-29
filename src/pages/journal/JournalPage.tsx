import { BookOpen, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CAPTURE_ICONS } from '../../components/icons';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/primitives';
import { CAPTURE_KINDS, DOMAIN_META, DOMAINS } from '../../domain/constants';
import { entryCode, patternCode, sortedEntries, usagesOfSource } from '../../domain/selectors';
import type { DomainKey, EntryKind } from '../../domain/types';
import { formatDate, formatMonth } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';

const ENTRY_KINDS = CAPTURE_KINDS.filter((k) => k.key !== 'decision');

export function JournalPage() {
  const data = useAtlas((s) => s.data);
  const openCapture = useUI((s) => s.openCapture);
  const openEntity = useUI((s) => s.openEntity);
  const top = useUI((s) => s.inspector[s.inspector.length - 1]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<EntryKind | 'all'>('all');
  const [domain, setDomain] = useState<DomainKey | 'all'>('all');
  const [review, setReview] = useState(false);

  const all = sortedEntries(data);
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (e) =>
        (kind === 'all' || e.kind === kind) &&
        (domain === 'all' || e.domains.includes(domain)) &&
        (!review || e.analysis?.suggestions.some((s) => s.state === 'pending')) &&
        (!q || `${e.title} ${e.content} ${e.tags.join(' ')}`.toLowerCase().includes(q)),
    );
  }, [all, kind, domain, review, query]);
  const reviewCount = all.filter((e) => e.analysis?.suggestions.some((s) => s.state === 'pending')).length;

  const months = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), e]);
  }
  const filtered = query || kind !== 'all' || domain !== 'all' || review;

  return (
    <div className="mx-auto max-w-[980px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        view="journal"
        help="journal"
        description="Everything you have written. A note becomes evidence once you connect it to something or accept one of its suggestions."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openCapture('journal')} kbd="N">
            Write a note
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-[2px] border border-line bg-surface px-2.5 focus-within:border-accent/50 sm:max-w-[280px]">
          <Search size={13} className="text-ink-3" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries and tags"
            aria-label="Search entries"
            className="w-full bg-transparent text-[12.5px] placeholder:text-ink-3 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-ink-3 hover:text-ink">
              <X size={12} aria-hidden />
            </button>
          )}
        </div>
        <select className="field h-8 w-auto py-0" value={kind} onChange={(e) => setKind(e.target.value as EntryKind | 'all')} aria-label="Type">
          <option value="all">All types</option>
          {ENTRY_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <select className="field h-8 w-auto py-0" value={domain} onChange={(e) => setDomain(e.target.value as DomainKey | 'all')} aria-label="Domain">
          <option value="all">All domains</option>
          {DOMAINS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={review}
          onClick={() => setReview(!review)}
          className={cn(
            'h-8 rounded-[2px] border px-2.5 text-[12.5px]',
            review ? 'border-accent/45 bg-accent-dim text-ink' : 'border-line text-ink-2 hover:border-line-strong',
          )}
        >
          Needs review <span className="num ml-1 text-ink-3">{reviewCount}</span>
        </button>
        <span className="num ml-auto text-[11.5px] text-ink-3">
          {entries.length} of {all.length}
        </span>
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No entries yet"
          className="mt-6"
          action={
            <Button variant="primary" icon={Plus} onClick={() => openCapture('journal')}>
              Write the first entry
            </Button>
          }
        >
          Start with something that happened this week and how you responded. Plain facts are more useful than conclusions; the analysis layer looks for
          recurring shapes across entries.
        </EmptyState>
      ) : entries.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-ink-3">{filtered ? 'No entries match these filters.' : 'Nothing here.'}</p>
      ) : (
        <div className="mt-5">
          {[...months.entries()].map(([month, list]) => (
            <section key={month} className="mb-6">
              <h2 className="label sticky top-0 z-[1] -mx-2 mb-1 bg-canvas/95 px-2 py-2 backdrop-blur">
                {formatMonth(`${month}-01`)} <span className="num ml-1 text-ink-3/70">{list.length}</span>
              </h2>
              <ul className="divide-y divide-line border-y border-line">
                {list.map((e) => {
                  const Icon = CAPTURE_ICONS[e.kind];
                  const usages = usagesOfSource(data, { kind: 'entry', id: e.id });
                  const pending = e.analysis?.suggestions.filter((s) => s.state === 'pending').length ?? 0;
                  const active = top?.kind === 'entry' && top.id === e.id;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => openEntity({ kind: 'entry', id: e.id })}
                        className={cn(
                          'grid w-full grid-cols-[52px_minmax(0,1fr)] gap-3 px-2 py-3 text-left transition-colors sm:grid-cols-[64px_minmax(0,1fr)_auto]',
                          active ? 'bg-raised' : 'hover:bg-surface',
                        )}
                      >
                        <div className="pt-0.5">
                          <div className="num text-[12px] text-ink-2">{formatDate(e.date)}</div>
                          <div className="num mt-0.5 text-[10.5px] text-ink-3">{entryCode(e.seq).replace('Entry ', '')}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon size={13} className="shrink-0 text-ink-3" aria-hidden />
                            <span className="display truncate text-[21px] leading-[1.15] text-ink">{e.title}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-2">{e.content}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {e.domains.map((d) => (
                              <span key={d} className="flex items-center gap-1 text-[11px] text-ink-3">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOMAIN_META[d].color }} aria-hidden />
                                {DOMAIN_META[d].label}
                              </span>
                            ))}
                            {e.tags.slice(0, 3).map((t) => (
                              <span key={t} className="num text-[11px] text-ink-3">
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="col-span-2 flex flex-wrap items-start gap-1.5 sm:col-span-1 sm:max-w-[190px] sm:justify-end">
                          {usages.map(({ pattern, evidence }) => (
                            <span
                              key={pattern.id}
                              className="num rounded-[2px] border px-1.5 py-px text-[10.5px]"
                              style={{
                                borderColor: evidence.stance === 'supports' ? 'rgb(116 198 154 / 0.35)' : 'rgb(232 162 92 / 0.4)',
                                color: evidence.stance === 'supports' ? 'var(--color-support)' : 'var(--color-counter)',
                              }}
                              title={`${evidence.stance === 'supports' ? 'Supports' : 'Counters'} ${patternCode(pattern.code)}`}
                            >
                              {evidence.stance === 'supports' ? '+' : '−'} P{String(pattern.code).padStart(2, '0')}
                            </span>
                          ))}
                          {pending > 0 && <span className="rounded-full bg-accent-dim px-1.5 text-[10.5px] text-accent">{pending} to review</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
