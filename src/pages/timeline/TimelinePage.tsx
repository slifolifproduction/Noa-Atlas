import { Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HISTORY_ICONS, PLACE_ICONS } from '../../components/icons';
import { NodeChip } from '../../components/inspector/parts';
import { PageHeader } from '../../components/shell/PageHeader';
import { EmptyState } from '../../components/ui/primitives';
import { AREAS, MODE_LABEL, OCCURRENCE_KIND_LABEL } from '../../domain/constants';
import { activeCommitmentsByWeek, contextStates, historyItems, readingsOf, recordGaps, type HistoryItem, type HistoryKind } from '../../domain/history';
import type { AreaKey } from '../../domain/types';
import { useElementWidth } from '../../hooks/useElementWidth';
import { formatDate, formatMonth, parseISODate, useToday } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { t, tn } from '../../i18n';

const KIND_ORDER: HistoryKind[] = ['event', 'action', 'experience', 'decision', 'reading', 'test', 'record', 'step'];
const KIND_LABEL: Record<HistoryKind, () => string> = {
  event: () => t('Events'),
  action: () => t('Actions'),
  experience: () => t('Experiences'),
  decision: () => t('Decisions'),
  reading: () => t('Readings'),
  test: () => t('Tests'),
  record: () => t('Notes'),
  step: () => t('Planned steps'),
};

/**
 * History: what happened, when. Each item traces back to the note or decision
 * it was read from. Planned steps are shown apart, as planned, never as
 * history. Nothing here explains anything; it is what explanations are
 * checked against.
 */
export function TimelinePage() {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const top = useUI((s) => s.inspector[s.inspector.length - 1]);
  const today = useToday();
  const [hidden, setHidden] = useState<Set<HistoryKind>>(() => new Set(['record', 'reading']));
  const [area, setArea] = useState<AreaKey | 'all'>('all');
  const [landmarks, setLandmarks] = useState(false);

  const all = useMemo(() => historyItems(data, { records: true, planned: true, today }), [data, today]);
  const items = useMemo(
    () =>
      all.filter((h) => {
        if (hidden.has(h.kind)) return false;
        if (landmarks && !h.landmark) return false;
        if (area !== 'all' && !h.about.some((id) => data.nodes[id]?.area === area)) return false;
        return true;
      }),
    [all, hidden, landmarks, area, data.nodes],
  );
  const counts = useMemo(() => {
    const c = Object.fromEntries(KIND_ORDER.map((k) => [k, 0])) as Record<HistoryKind, number>;
    for (const h of all) c[h.kind]++;
    return c;
  }, [all]);
  const gaps = recordGaps(data, today);

  const planned = items.filter((h) => h.mode !== 'actual');
  const actual = items.filter((h) => h.mode === 'actual');
  const months = new Map<string, HistoryItem[]>();
  for (const h of actual) {
    const k = h.date.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), h]);
  }

  return (
    <div className="mx-auto max-w-[980px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader view="timeline" help="timeline" />

      {all.length === 0 ? (
        <EmptyState icon={PLACE_ICONS.history} title={t('Nothing on the timeline yet')} className="mt-6">
          {t('The timeline fills from your notes: when a note reports something that happened, accept it as an event, an action or an experience.')}
        </EmptyState>
      ) : (
        <>
          <LoadChart />

          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            {KIND_ORDER.filter((k) => counts[k] > 0).map((k) => {
              const on = !hidden.has(k);
              const Icon = HISTORY_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = new Set(hidden);
                    if (on) next.add(k);
                    else next.delete(k);
                    setHidden(next);
                  }}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-[2px] border px-2.5 text-[12.5px]',
                    on ? 'border-line-strong text-ink' : 'border-line text-ink-3 hover:text-ink-2',
                  )}
                >
                  <Icon size={12} aria-hidden />
                  {KIND_LABEL[k]()}
                  <span className="num text-[11px] text-ink-3">{counts[k]}</span>
                </button>
              );
            })}
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
              {t('Landmarks only')}
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

          {gaps.quietWeeks > 0 && (
            <p className="mt-3 text-[12px] text-ink-3">
              {tn(
                gaps.quietWeeks,
                '{n} week in this record has no notes. What was not written cannot show up here, so a gap is not the same as nothing happening.',
                '{n} weeks in this record have no notes. What was not written cannot show up here, so a gap is not the same as nothing happening.',
              )}
            </p>
          )}

          {planned.length > 0 && (
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
                  {list.map((h) => (
                    <Row key={h.key} item={h} active={top?.kind === h.ref.kind && top.id === h.ref.id} onOpen={() => open(h.ref)} />
                  ))}
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
