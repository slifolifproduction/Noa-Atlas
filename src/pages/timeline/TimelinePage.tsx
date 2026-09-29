import { Plus, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CAPTURE_ICONS, HISTORY_ICONS, PLACE_ICONS } from '../../components/icons';
import { NodeChip } from '../../components/inspector/parts';
import { FocusBanner, useFocusFilter } from '../../components/shell/Focus';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState, Segmented } from '../../components/ui/primitives';
import { momentsOf } from '../../domain/ask';
import { AREA_META, AREAS, MODE_LABEL, OCCURRENCE_KIND_LABEL } from '../../domain/constants';
import { activeCommitmentsByWeek, contextStates, historyItems, readingsOf, recordGaps, type HistoryItem } from '../../domain/history';
import type { AreaKey, AtlasData } from '../../domain/types';
import { useElementWidth } from '../../hooks/useElementWidth';
import { formatDate, formatMonth, parseISODate, useToday } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { t, tn } from '../../i18n';

type Show = 'all' | 'notes' | 'decisions' | 'happenings';

const SHOWS: Record<Show, (h: HistoryItem) => boolean> = {
  all: () => true,
  notes: (h) => h.kind === 'record',
  decisions: (h) => h.kind === 'decision',
  happenings: (h) => h.kind === 'event' || h.kind === 'action' || h.kind === 'experience' || h.kind === 'test',
};

const pendingIn = (data: AtlasData, h: HistoryItem) =>
  h.kind === 'record' ? (data.entries[h.ref.id]?.analysis?.suggestions.filter((s) => s.state === 'pending').length ?? 0) : 0;

function areasOf(data: AtlasData, h: HistoryItem): AreaKey[] {
  if (h.ref.kind === 'entry') return data.entries[h.ref.id]?.areas ?? [];
  if (h.ref.kind === 'decision') return data.decisions[h.ref.id]?.areas ?? [];
  return h.about.map((id) => data.nodes[id]?.area).filter((a): a is AreaKey => Boolean(a));
}

function searchText(data: AtlasData, h: HistoryItem): string {
  if (h.ref.kind === 'entry') {
    const e = data.entries[h.ref.id];
    if (e) return `${e.title} ${e.content} ${e.tags.join(' ')}`;
  }
  if (h.ref.kind === 'decision') {
    const d = data.decisions[h.ref.id];
    if (d) return `${d.title} ${d.context} ${d.chosenAction} ${d.options.map((o) => o.label).join(' ')}`;
  }
  return h.label;
}

/**
 * Time: what happened, when. Notes, what they describe, decisions (drawn as
 * forks, with the branches not taken) and tests on one line, newest first.
 * With something in focus, only the moments about it. Planned steps stay
 * apart, as planned; nothing here explains anything.
 */
export function TimelinePage({ preset }: { preset?: string }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const openCapture = useUI((s) => s.openCapture);
  const top = useUI((s) => s.inspector[s.inspector.length - 1]);
  const today = useToday();
  const initial: Show = preset === 'notes' || preset === 'decisions' ? preset : 'all';
  const [show, setShow] = useState<Show>(initial);
  useEffect(() => setShow(initial), [initial]);
  const { focus, on, setOn } = useFocusFilter();
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<AreaKey | 'all'>('all');
  const [review, setReview] = useState(false);
  const [landmarks, setLandmarks] = useState(false);

  const all = useMemo(() => historyItems(data, { records: true, planned: true, today }).filter((h) => h.kind !== 'reading'), [data, today]);
  const about = useMemo(() => (focus ? new Set(momentsOf(data, focus).map((h) => h.key)) : null), [data, focus]);
  const inFocus = useMemo(() => (on && about ? all.filter((h) => about.has(h.key)) : all), [all, about, on]);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inFocus.filter((h) => {
      if (!SHOWS[show](h)) return false;
      if (review && !pendingIn(data, h)) return false;
      if (landmarks && !h.landmark) return false;
      if (area !== 'all' && !areasOf(data, h).includes(area)) return false;
      if (q && !searchText(data, h).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inFocus, show, review, landmarks, area, query, data]);
  const count = (k: Show) => inFocus.filter((h) => h.mode === 'actual' && SHOWS[k](h)).length;
  const toReview = inFocus.filter((h) => pendingIn(data, h) > 0).length;
  const gaps = recordGaps(data, today);

  const planned = items.filter((h) => h.mode !== 'actual');
  const actual = items.filter((h) => h.mode === 'actual');
  const months = new Map<string, HistoryItem[]>();
  for (const h of actual) {
    const k = h.date.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), h]);
  }
  const quiet = show === 'all' && !on && !query && !review && area === 'all' && !landmarks;

  return (
    <div className="mx-auto max-w-[980px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        view="timeline"
        help="timeline"
        actions={
          <>
            <Button variant="primary" icon={Plus} onClick={() => openCapture('journal')} kbd="N">
              {t('Write a note')}
            </Button>
            <Button variant="ghost" icon={HISTORY_ICONS.decision} onClick={() => openCapture('decision')}>
              {t('Log a decision')}
            </Button>
          </>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={PLACE_ICONS.time}
          title={t('Nothing here yet')}
          className="mt-6"
          action={
            <Button variant="primary" icon={Plus} onClick={() => openCapture('journal')}>
              {t('Write the first note')}
            </Button>
          }
        >
          {t('Time fills from what you write: a few honest lines about something that happened, or a decision you made.')}
        </EmptyState>
      ) : (
        <>
          <FocusBanner
            focus={focus}
            on={on}
            setOn={setOn}
            shown={inFocus.filter((h) => h.mode === 'actual').length}
            total={all.filter((h) => h.mode === 'actual').length}
            className="mt-5"
          />

          {quiet && <LoadChart />}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Segmented<Show>
              label={t('Show')}
              size="sm"
              value={show}
              onChange={setShow}
              options={[
                { value: 'all', label: t('Everything') },
                { value: 'notes', label: `${t('Notes')} ${count('notes')}` },
                { value: 'decisions', label: `${t('Decisions')} ${count('decisions')}` },
                { value: 'happenings', label: `${t('What happened')} ${count('happenings')}` },
              ]}
            />
            <div className="flex h-8 min-w-[180px] flex-1 items-center gap-2 rounded-[2px] border border-line bg-surface px-2.5 focus-within:border-accent/50 sm:max-w-[240px]">
              <Search size={13} className="text-ink-3" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search what you wrote')}
                aria-label={t('Search what you wrote')}
                className="w-full bg-transparent text-[12.5px] placeholder:text-ink-3 focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label={t('Clear search')} className="text-ink-3 hover:text-ink">
                  <X size={12} aria-hidden />
                </button>
              )}
            </div>
            {toReview > 0 && (
              <button
                type="button"
                aria-pressed={review}
                onClick={() => setReview(!review)}
                className={cn(
                  'h-8 rounded-[2px] border px-2.5 text-[12.5px]',
                  review ? 'border-accent/45 bg-accent-dim text-ink' : 'border-line text-ink-2 hover:border-line-strong',
                )}
              >
                {t('To confirm')} <span className="num ml-1 text-ink-3">{toReview}</span>
              </button>
            )}
            <button
              type="button"
              aria-pressed={landmarks}
              onClick={() => setLandmarks(!landmarks)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-[2px] border px-2.5 text-[12.5px]',
                landmarks ? 'border-accent/45 bg-accent-dim text-ink' : 'border-line text-ink-2 hover:border-line-strong',
              )}
            >
              <Star size={12} aria-hidden />
              {t('Landmarks')}
            </button>
            <select className="field h-8 w-auto py-0" value={area} onChange={(e) => setArea(e.target.value as AreaKey | 'all')} aria-label={t('Area of life')}>
              <option value="all">{t('All areas')}</option>
              {AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {quiet && gaps.quietWeeks > 0 && (
            <p className="mt-3 text-[12px] text-ink-3">
              {tn(
                gaps.quietWeeks,
                '{n} week in this record has no notes. What was not written cannot show up here, so a gap is not the same as nothing happening.',
                '{n} weeks in this record have no notes. What was not written cannot show up here, so a gap is not the same as nothing happening.',
              )}
            </p>
          )}

          {planned.length > 0 && (show === 'all' || show === 'happenings') && (
            <section className="mt-6">
              <h2 className="label mb-1">{t('Ahead: planned, not yet history')}</h2>
              <ul className="divide-y divide-line border-y border-dashed border-line">
                {planned.map((h) => (
                  <Row key={h.key} item={h} active={false} onOpen={() => open(h.ref)} />
                ))}
              </ul>
            </section>
          )}

          <div className="mt-6">
            {[...months.entries()].map(([month, list]) => (
              <section key={month} className="mb-6">
                <h2 className="label sticky top-0 z-[1] -mx-2 mb-1 bg-canvas/95 px-2 py-2 backdrop-blur">
                  {formatMonth(`${month}-01`)} <span className="num ml-1 text-ink-3">{list.length}</span>
                </h2>
                <ul className="divide-y divide-line border-y border-line">
                  {list.map((h) => {
                    const active = top?.kind === h.ref.kind && top.id === h.ref.id;
                    const onOpen = () => open(h.ref);
                    return h.kind === 'record' ? (
                      <NoteRow key={h.key} item={h} active={active} onOpen={onOpen} />
                    ) : h.kind === 'decision' ? (
                      <ForkRow key={h.key} item={h} active={active} onOpen={onOpen} />
                    ) : (
                      <Row key={h.key} item={h} active={active} onOpen={onOpen} />
                    );
                  })}
                </ul>
              </section>
            ))}
            {actual.length === 0 && <p className="mt-10 text-center text-[13px] text-ink-3">{t('Nothing matches these filters.')}</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** A note: what you wrote, with the first lines of it and anything waiting for a yes or no. */
function NoteRow({ item: h, active, onOpen }: { item: HistoryItem; active: boolean; onOpen(): void }) {
  const e = useAtlas((s) => s.data.entries[h.ref.id]);
  const pending = e?.analysis?.suggestions.filter((s) => s.state === 'pending').length ?? 0;
  if (!e) return null;
  const Icon = CAPTURE_ICONS[e.kind];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn('grid w-full grid-cols-[64px_minmax(0,1fr)] gap-3 px-2 py-3 text-left transition-colors', active ? 'bg-raised' : 'hover:bg-surface')}
      >
        <div className="num pt-0.5 text-[12px] text-ink-2">{formatDate(e.date)}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={13} className="shrink-0 text-ink-3" aria-hidden />
            <span className="display min-w-0 flex-1 truncate text-[16px] leading-[1.2] text-ink">{e.title}</span>
            {pending > 0 && <span className="shrink-0 rounded-full bg-accent-dim px-1.5 text-[10.5px] text-accent">{t('{n} to confirm', { n: pending })}</span>}
          </div>
          <p className="mt-0.5 line-clamp-2 pl-[21px] text-[12.5px] leading-snug text-ink-2">{e.content}</p>
          {e.areas.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[21px]">
              {e.areas.map((d) => (
                <span key={d} className="flex items-center gap-1 text-[11px] text-ink-3">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: AREA_META[d].color }} aria-hidden />
                  {AREA_META[d].label}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

/** A decision as a fork: the branch you took, and the ones you did not, drawn dashed. */
function ForkRow({ item: h, active, onOpen }: { item: HistoryItem; active: boolean; onOpen(): void }) {
  const d = useAtlas((s) => s.data.decisions[h.ref.id]);
  const today = useToday();
  if (!d) return null;
  const Icon = HISTORY_ICONS.decision;
  const taken = d.options.find((o) => o.id === d.chosenOptionId);
  const others = d.options.filter((o) => o.id !== d.chosenOptionId);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn('grid w-full grid-cols-[64px_minmax(0,1fr)] gap-3 px-2 py-3 text-left transition-colors', active ? 'bg-raised' : 'hover:bg-surface')}
      >
        <div className="num pt-0.5 text-[12px] text-ink-2">{formatDate(d.date)}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={13} className="shrink-0 text-ink-3" aria-hidden />
            <span className="display min-w-0 flex-1 truncate text-[16px] leading-[1.2] text-ink">{d.title}</span>
            {d.outcomeRating === undefined && d.date < today && <span className="shrink-0 text-[10.5px] text-ink-3">{t('how did it go?')}</span>}
          </div>
          <div className="mt-1.5 ml-[6px] space-y-0.5 border-l border-line-strong pl-3">
            <div className="text-[12.5px] leading-snug text-ink-2">
              <span className="text-ink-3">{t('Took')}:</span> {taken?.label || d.chosenAction || '—'}
            </div>
            {others.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                <span>{tn(others.length, '{n} branch not taken', '{n} branches not taken')}:</span>
                {others.map((o) => (
                  <span key={o.id} className="rounded-[2px] border border-dashed border-line-strong px-1.5 py-px text-[11.5px] text-ink-3">
                    {o.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function Row({ item: h, active, onOpen }: { item: HistoryItem; active: boolean; onOpen(): void }) {
  const Icon = HISTORY_ICONS[h.kind];
  return (
    <li>
      <div className={cn('grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-2 py-2.5 transition-colors', active ? 'bg-raised' : 'hover:bg-surface')}>
        <div className="num pt-0.5 text-[12px] text-ink-2">
          {h.approx ? '~' : ''}
          {formatDate(h.date)}
          {h.until && <div className="text-[10.5px] text-ink-3">– {formatDate(h.until)}</div>}
        </div>
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="flex w-full items-start gap-2 text-left">
            <Icon size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
            <span className={cn('min-w-0 flex-1 text-[13.5px] leading-snug', h.mode === 'actual' ? 'text-ink hover:underline' : 'text-ink-2 italic')}>
              {h.label}
              {h.value !== undefined && <span className="num ml-1.5 text-[11.5px] text-ink-3">({h.value})</span>}
            </span>
            {h.landmark && <Star size={12} className="mt-[3px] shrink-0 text-accent" aria-label={t('Landmark')} />}
            <span className="shrink-0 font-mono text-[10px] tracking-wide text-ink-3 uppercase">
              {h.mode === 'actual' ? (OCCURRENCE_KIND_LABEL[h.kind as keyof typeof OCCURRENCE_KIND_LABEL] ?? '') : MODE_LABEL[h.mode]}
              {h.external ? ` · ${t('happened to you')}` : ''}
            </span>
          </button>
          {(h.about.length > 0 || h.instanceOf) && (
            <div className="mt-1 flex flex-wrap gap-1 pl-5">
              {[...(h.instanceOf ? [h.instanceOf] : []), ...h.about.filter((a) => a !== h.instanceOf)].slice(0, 4).map((id) => (
                <NodeChip key={id} id={id} className="py-0 text-[11.5px]" />
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Two computed series on one time axis: how many commitments were active each
 * week (counted from their lifespans) and energy as recorded with each note.
 * They are shown side by side, not as a correlation: whether one affects the
 * other is a claim, checked elsewhere.
 */
function LoadChart() {
  const data = useAtlas((s) => s.data);
  const today = useToday();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const weeks = useMemo(() => activeCommitmentsByWeek(data, today), [data, today]);
  const energyId = contextStates(data).energy;
  const energy = useMemo(() => (energyId ? readingsOf(data, energyId) : []), [data, energyId]);
  if (weeks.length < 3) return null;
  const t0 = parseISODate(weeks[0].week).getTime();
  const t1 = Math.max(parseISODate(today).getTime(), t0 + 86_400_000 * 28);
  const padL = 88;
  const padR = 8;
  const x = (d: string) => padL + ((parseISODate(d).getTime() - t0) / (t1 - t0)) * (width - padL - padR);
  const maxLoad = Math.max(...weeks.map((w) => w.count), 1);
  const barH = 44;
  const eTop = barH + 22;
  const eH = 36;
  const ey = (v: number) => eTop + (1 - (v - 1) / 4) * eH;
  const height = eTop + eH + 20;
  const bw = Math.max(2, ((width - padL - padR) / Math.max(1, weeks.length)) * 0.7);
  const energyVisible = energy.filter((r) => r.date >= weeks[0].week);
  const line = energyVisible.map((r, i) => `${i ? 'L' : 'M'} ${x(r.date).toFixed(1)} ${ey(r.value).toFixed(1)}`).join(' ');
  return (
    <section className="mt-6 rounded-[2px] border border-line px-3 pt-3 pb-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label">{t('Load and energy, week by week')}</h2>
        <span className="text-[11px] text-ink-3">{t('Counted from lifespans and from what you recorded with each note. Side by side, not a finding.')}</span>
      </div>
      <div ref={ref} className="mt-2">
        <svg width={width} height={height} role="img" aria-label={t('Active commitments per week, and energy readings')}>
          <text x={0} y={barH / 2 + 4} className="fill-ink-3 font-mono text-[10.5px] tracking-wider">
            {t('COMMITMENTS')}
          </text>
          {weeks.map((w) => (
            <rect
              key={w.week}
              x={x(w.week) - bw / 2}
              y={barH - (w.count / maxLoad) * barH}
              width={bw}
              height={(w.count / maxLoad) * barH}
              fill="var(--color-ink-3)"
              opacity={0.55}
            >
              <title>{t('Week of {date}: {n} active', { date: formatDate(w.week), n: w.count })}</title>
            </rect>
          ))}
          <text x={0} y={eTop + eH / 2 + 4} className="fill-ink-3 font-mono text-[10.5px] tracking-wider">
            {t('ENERGY')}
          </text>
          <line x1={padL} x2={width - padR} y1={ey(3)} y2={ey(3)} stroke="rgb(236 232 223 / 0.08)" strokeDasharray="3 4" />
          {energyVisible.length > 1 && <path d={line} fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinejoin="round" />}
          {energyVisible.map((r) => (
            <circle key={r.date + r.value} cx={x(r.date)} cy={ey(r.value)} r={2} fill="var(--color-ink)" />
          ))}
          <text x={padL} y={height - 4} className="fill-ink-3 font-mono text-[10.5px]">
            {formatMonth(weeks[0].week)}
          </text>
          <text x={width - padR} y={height - 4} textAnchor="end" className="fill-ink-3 font-mono text-[10.5px]">
            {formatMonth(today)}
          </text>
        </svg>
      </div>
    </section>
  );
}
