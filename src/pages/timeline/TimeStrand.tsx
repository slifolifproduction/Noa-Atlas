import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatDate, parseISODate, useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { FullOnly } from '../../components/ui/Detail';
import { locale, t, tn } from '../../i18n';
import { strandModel, type StrandDecision, type StrandModel } from './strand';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const H = 236;
/** The strand's axis, and half its width in the busiest week. */
const CY = 90;
const SPREAD = 30;
/** The energy band, 1 (bottom) to 5 (top). */
const E_TOP = 172;
const E_H = 32;
const AXIS = 216;
const PAD_L = 14;
const PAD_R = 58;
const FILAMENTS = 6;
const AMP = [1, 0.78, 0.94, 0.66, 0.86, 0.58];
/** One twist of the braid, in pixels. */
const TWIST = 150;

interface Branch {
  key: string;
  decision: StrandDecision;
  d: string;
  from: number;
  end: { x: number; y: number };
}

function geometry(m: StrandModel, width: number) {
  const t0 = parseISODate(m.start).getTime();
  const t1 = Math.max(parseISODate(m.today).getTime(), t0 + 4 * WEEK);
  const inner = Math.max(80, width - PAD_L - PAD_R);
  const x = (date: string) => PAD_L + ((parseISODate(date).getTime() - t0) / (t1 - t0)) * inner;
  const weekW = (WEEK / (t1 - t0)) * inner;
  const now = x(m.today);
  const centre = (i: number) => Math.min(now, x(m.weeks[i].week) + weekW / 2);
  const points = m.weeks.map((w, i) => ({ x: centre(i), v: w.load / m.maxLoad }));
  const share = (px: number) => {
    if (px <= points[0].x) return points[0].v;
    const last = points[points.length - 1];
    if (px >= last.x) return last.v;
    let i = 0;
    while (points[i + 1].x < px) i++;
    const f = (px - points[i].x) / Math.max(1e-6, points[i + 1].x - points[i].x);
    return points[i].v + (points[i + 1].v - points[i].v) * ((1 - Math.cos(Math.PI * f)) / 2);
  };
  const spread = (px: number) => 1.2 + SPREAD * share(px);
  const xs: number[] = [];
  for (let px = PAD_L; px < now; px += 3) xs.push(px);
  xs.push(now);
  const widths = xs.map(spread);
  const envelope = `${xs.map((px, i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${(CY - widths[i]).toFixed(1)}`).join('')}${xs
    .map((_, j) => {
      const i = xs.length - 1 - j;
      return `L${xs[i].toFixed(1)} ${(CY + widths[i]).toFixed(1)}`;
    })
    .join('')}Z`;
  const filament = (k: number, phase: number) =>
    xs
      .map((px, i) => {
        const y = CY + widths[i] * 0.9 * AMP[k] * Math.sin((px / TWIST) * Math.PI * 2 + (k * Math.PI * 2) / FILAMENTS + phase);
        return `${i ? 'L' : 'M'}${px.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join('');
  const ey = (v: number) => E_TOP + (1 - (v - 1) / 4) * E_H;
  const weekAt = (px: number) => Math.max(0, Math.min(m.weeks.length - 1, Math.floor(((px - PAD_L) / inner) * ((t1 - t0) / WEEK))));
  // What a week holds as drawn: its energy readings, its decisions and its notes, each where its day is. The cursor
  // stands on them (the week's last reading, else its last decision, else its last note), so it meets what it reads;
  // a week with nothing in it is read at its middle.
  const inWeek = (i: number) => {
    const from = m.weeks[i].week;
    const to = m.weeks[i + 1]?.week ?? '9999-12-31';
    return (d: string) => d >= from && d < to;
  };
  const held = (i: number) => {
    const at = inWeek(i);
    return {
      readings: m.energy.filter((r) => at(r.date)),
      decisions: m.decisions.filter((d) => at(d.date)),
      notes: m.notes.filter(at),
    };
  };
  const anchor = (i: number) => {
    const h = held(i);
    const last = (days: string[]) => days.reduce((a, d) => (d > a ? d : a), '');
    const day = last(h.readings.map((r) => r.date)) || last(h.decisions.map((d) => d.date)) || last(h.notes);
    return day ? Math.min(now, x(day)) : centre(i);
  };

  // Decisions branch off the strand: one dashed branch per option not taken, fading as it goes.
  const branches: Branch[] = [];
  m.decisions.forEach((dec, k) => {
    const from = x(dec.date);
    const reach = Math.max(36, Math.min(118, width - 10 - from));
    dec.notTaken.slice(0, 4).forEach((_, j) => {
      const dir = (k + j) % 2 === 0 ? -1 : 1;
      const lift = Math.min(dir < 0 ? CY - 14 : E_TOP - 16 - CY, spread(from) + 18 + 14 * Math.floor(j / 2));
      const end = { x: from + reach, y: CY + dir * lift };
      branches.push({
        key: `${dec.id}:${j}`,
        decision: dec,
        from,
        end,
        d: `M${from.toFixed(1)} ${CY} C${(from + reach * 0.32).toFixed(1)} ${CY} ${(from + reach * 0.42).toFixed(1)} ${end.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      });
    });
  });

  // Month marks along the bottom, far enough apart to read.
  const months: { x: number; label: string }[] = [];
  const short = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: 'short' });
  const withYear = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: 'short', year: 'numeric' });
  const d = parseISODate(m.start);
  for (let y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1; ; mo++) {
    if (mo > 11) [y, mo] = [y + 1, 0];
    const iso = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    if (iso > m.today) break;
    const px = x(iso);
    if (months.length && px - months[months.length - 1].x < 36) continue;
    months.push({ x: px, label: (mo === 0 || !months.length ? withYear : short).format(parseISODate(iso)) });
  }

  const busiest = m.weeks.reduce((b, w, i) => (w.load > m.weeks[b].load ? i : b), 0);
  return { x, weekW, now, centre, spread, envelope, filament, ey, weekAt, held, anchor, branches, months, busiest };
}

/**
 * Time as one strand, like a timeline seen from outside it: its width is how
 * many commitments were active each week, each note a spark on it, each
 * decision a knot with the options not taken branching off and fading, and
 * below it the energy you recorded. It braids slowly and a light runs along
 * it toward now. Point at a week to read it; choose it to go there in the
 * list. Counted, side by side: nothing here says what affects what.
 */
export function TimeStrand({ onJump }: { onJump(month: string): void }) {
  const data = useAtlas((s) => s.data);
  const openEntity = useUI((s) => s.openEntity);
  const today = useToday();
  const model = useMemo(() => strandModel(data, today), [data, today]);
  const [wrap, width] = useElementWidth<HTMLDivElement>(900);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [cursor, setCursor] = useState<number | null>(null);
  const geo = useMemo(() => (model ? geometry(model, width) : null), [model, width]);
  const threads = useRef<(SVGPathElement | null)[]>([]);
  /** Whether the last pointer was a mouse, and whether this tap only reads its week. */
  const mouse = useRef(true);
  const readOnly = useRef(false);
  const ids = useId().replace(/:/g, '');

  // The braid turns slowly while it is on screen.
  useEffect(() => {
    if (!geo || reduced) return;
    const el = wrap.current;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (el) io.observe(el);
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (!visible || document.hidden || now - last < 33) return;
      last = now;
      const phase = (now / 1000) * 0.55;
      threads.current.forEach((p, k) => p?.setAttribute('d', geo.filament(k, phase)));
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [geo, reduced, wrap]);

  if (!model || !geo) return null;
  const n = model.weeks.length;
  const shown = Math.min(cursor ?? n - 1, n - 1);
  const week = model.weeks[shown];
  // The cursor stands on what the week holds; the band behind it spans the whole week.
  const cx = geo.anchor(shown);
  const bandX = geo.x(week.week);
  const readings = geo.held(shown).readings;
  const busiest = model.weeks[geo.busiest];

  const toX = (e: { clientX: number; currentTarget: Element }) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  const jump = (i: number) => onJump(model.weeks[i].week.slice(0, 7));
  const onKey = (e: KeyboardEvent) => {
    const at = cursor ?? n - 1;
    const next = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next !== null) {
      e.preventDefault();
      setCursor(Math.max(0, Math.min(n - 1, next)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      jump(at);
    } else if (e.key === 'Escape' && cursor !== null) {
      e.stopPropagation();
      setCursor(null);
    }
  };

  return (
    <section className="time-strand ticks relative mt-6 overflow-hidden rounded-[2px] border border-line px-3 pt-3 pb-2.5">
      <div className="relative z-[1] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="tree-block is-inline">
          <span className="tree-block-main">
            <span className="tree-block-row is-head">{t('Plate · Time').toUpperCase()}</span>
            <span className="tree-block-row is-sub">{t('Load and energy, week by week').toUpperCase()}</span>
          </span>
        </h2>
        <FullOnly>
          <span className="text-[11px] text-ink-3">{t('Counted from lifespans and from what you recorded with each note. Side by side, not a finding.')}</span>
        </FullOnly>
      </div>

      {/* The readout: the week under the cursor, or this week. */}
      <div className="relative z-[1] mt-2 flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-ink-2" aria-live="polite">
        <span className={cursor === null ? 'text-accent' : 'text-ink'}>
          {cursor === null ? t('This week') : t('Week of {date}', { date: formatDate(week.week, { year: true }) })}
        </span>
        <span>
          <i className="strand-key strand-key-load" aria-hidden /> {tn(week.load, 'one commitment active', '{n} commitments active')}
        </span>
        <span>
          <i className="strand-key strand-key-energy" aria-hidden />{' '}
          {week.energy === undefined ? t('no energy reading') : t('energy {v} of 5', { v: Math.round(week.energy * 10) / 10 })}
        </span>
        <span>{week.notes ? tn(week.notes, 'one note', '{n} notes') : t('no notes')}</span>
        {week.decisions.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => openEntity({ kind: 'decision', id: d.id })}
            className="tap inline-flex max-w-full items-center gap-1.5 rounded-[2px] border border-line-strong px-1.5 py-px font-sans text-[12px] text-ink hover:border-ink-3"
          >
            <i className="strand-key strand-key-knot" aria-hidden />
            <span className="truncate">{d.title}</span>
            {d.notTaken.length > 0 && <span className="shrink-0 text-ink-3">· {tn(d.notTaken.length, '{n} branch not taken', '{n} branches not taken')}</span>}
          </button>
        ))}
      </div>

      <div
        ref={wrap}
        tabIndex={0}
        role="group"
        aria-label={t('Your timeline, week by week. Left and right arrows move between weeks; Enter goes to the week in the list.')}
        onKeyDown={onKey}
        className="relative z-[1] mt-1 rounded-[2px] outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
      >
        <svg
          width={width}
          height={H}
          className="block touch-pan-y select-none"
          aria-hidden
          onPointerMove={(e: ReactPointerEvent<SVGSVGElement>) => {
            if (e.pointerType === 'mouse' || e.buttons) setCursor(geo.weekAt(toX(e)));
          }}
          onPointerDown={(e) => {
            // With a finger, a tap on another week reads it first; tapping the week being read goes there.
            const at = geo.weekAt(toX(e));
            mouse.current = e.pointerType === 'mouse';
            readOnly.current = !mouse.current && at !== cursor;
            setCursor(at);
          }}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setCursor(null)}
          onClick={(e) => {
            if (!readOnly.current) jump(geo.weekAt(toX(e)));
          }}
        >
          <defs>
            <linearGradient id={`${ids}-ribbon`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'rgb(var(--gold))', stopOpacity: 0 }} />
              <stop offset="0.5" style={{ stopColor: 'rgb(var(--gold))', stopOpacity: 0.3 }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--gold))', stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={`${ids}-future`} gradientUnits="userSpaceOnUse" x1={geo.now} x2={width - 4} y1="0" y2="0">
              <stop offset="0" style={{ stopColor: 'rgb(var(--gold-hi))', stopOpacity: 0.5 }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--gold-hi))', stopOpacity: 0 }} />
            </linearGradient>
            {geo.branches.map((b) => (
              <linearGradient key={b.key} id={`${ids}-b${b.key.replace(/[^\w]/g, '')}`} gradientUnits="userSpaceOnUse" x1={b.from} x2={b.end.x} y1="0" y2="0">
                <stop offset="0" style={{ stopColor: 'rgb(var(--gold-hi))', stopOpacity: 0.85 }} />
                <stop offset="1" style={{ stopColor: 'rgb(var(--gold))', stopOpacity: 0.05 }} />
              </linearGradient>
            ))}
            <filter id={`${ids}-glow`} x="-10%" y="-200%" width="120%" height="500%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* A faint grid: one line per month. */}
          {geo.months.map((mo) => (
            <line key={`g${mo.x}`} x1={mo.x} x2={mo.x} y1={10} y2={AXIS} className="strand-grid" />
          ))}

          {/* The week under the cursor. */}
          <rect x={bandX} y={8} width={Math.max(3, geo.weekW)} height={AXIS - 8} className="strand-week" opacity={cursor === null ? 0 : 1} />

          <text x={PAD_L} y={CY - SPREAD - 24} className="strand-caption">
            {t('COMMITMENTS ACTIVE')}
          </text>
          <text x={PAD_L} y={E_TOP - 8} className="strand-caption">
            {t('ENERGY 1–5')}
          </text>

          <g className={reduced ? undefined : 'strand-write'}>
            {/* The future: not written yet. */}
            <line x1={geo.now} x2={width - 4} y1={CY} y2={CY} stroke={`url(#${ids}-future)`} strokeWidth="1" strokeDasharray="2 5" />
            <path d={geo.envelope} fill={`url(#${ids}-ribbon)`} />
            <line x1={PAD_L} x2={geo.now} y1={CY} y2={CY} className="strand-core-glow" filter={`url(#${ids}-glow)`} />
            {Array.from({ length: FILAMENTS }, (_, k) => (
              <path
                key={k}
                ref={(el) => {
                  threads.current[k] = el;
                }}
                d={geo.filament(k, 0)}
                className="strand-filament"
              />
            ))}
            <line x1={PAD_L} x2={geo.now} y1={CY} y2={CY} className="strand-core" />
            {!reduced && (
              <>
                <path d={`M${PAD_L} ${CY}H${geo.now}`} pathLength={1000} className="strand-pulse" />
                <path d={`M${PAD_L} ${CY}H${geo.now}`} pathLength={1000} className="strand-pulse strand-pulse-late" />
              </>
            )}

            {/* Notes: sparks on the strand. */}
            {model.notes.map((d, i) => (
              <circle key={`${d}${i}`} cx={geo.x(d)} cy={CY} r={1.7} className="strand-spark" />
            ))}

            {/* Decisions: the options not taken branch off and fade. */}
            {geo.branches.map((b) => (
              <g key={b.key}>
                <path d={b.d} stroke={`url(#${ids}-b${b.key.replace(/[^\w]/g, '')})`} className="strand-branch" />
                <circle cx={b.end.x} cy={b.end.y} r={2.2} className="strand-branch-end" />
              </g>
            ))}
            {model.decisions.map((d) => (
              <g
                key={d.id}
                transform={`translate(${geo.x(d.date).toFixed(1)} ${CY})`}
                className="strand-knot"
                onClick={(e) => {
                  // With a mouse a knot opens its decision; a finger reads the week, and the decision is in the readout.
                  if (!mouse.current) return;
                  e.stopPropagation();
                  openEntity({ kind: 'decision', id: d.id });
                }}
              >
                <circle r={13} className="fill-transparent" />
                <rect x={-4} y={-4} width={8} height={8} transform="rotate(45)" />
              </g>
            ))}

            {/* A direct label on the busiest week. */}
            {busiest.load > 0 && (
              <text x={geo.centre(geo.busiest)} y={CY - geo.spread(geo.centre(geo.busiest)) - 7} textAnchor="middle" className="strand-value">
                {t('max {n}', { n: busiest.load })}
              </text>
            )}
          </g>

          {/* Energy, as recorded. */}
          <line x1={PAD_L} x2={geo.now} y1={geo.ey(3)} y2={geo.ey(3)} className="strand-mid" />
          {model.energy.length > 1 && (
            <>
              <path
                d={model.energy.map((r, i) => `${i ? 'L' : 'M'}${geo.x(r.date).toFixed(1)} ${geo.ey(r.value).toFixed(1)}`).join('')}
                className="strand-energy-glow"
              />
              <path
                d={model.energy.map((r, i) => `${i ? 'L' : 'M'}${geo.x(r.date).toFixed(1)} ${geo.ey(r.value).toFixed(1)}`).join('')}
                className="strand-energy"
              />
            </>
          )}
          {model.energy.map((r, i) => (
            <circle key={`${r.date}${i}`} cx={geo.x(r.date)} cy={geo.ey(r.value)} r={2.6} className="strand-energy-dot" />
          ))}

          {/* Now. */}
          <line x1={geo.now} x2={geo.now} y1={CY - 44} y2={E_TOP + E_H} className="strand-now-line" />
          <circle cx={geo.now} cy={CY} r={3.6} className="strand-now" />
          {!reduced && <circle cx={geo.now} cy={CY} r={3.6} className="strand-now-ring" />}
          <text x={geo.now} y={CY - 50} textAnchor="middle" className="strand-now-label">
            {t('NOW')}
          </text>

          {/* The cursor. */}
          {cursor !== null && (
            <g className="strand-cursor">
              <line x1={cx} x2={cx} y1={10} y2={AXIS} />
              <path d={`M${cx - 7} ${CY - geo.spread(cx) - 6}h14M${cx - 7} ${CY + geo.spread(cx) + 6}h14`} />
              {readings.map((r, i) => (
                <circle key={`${r.date}${i}`} cx={geo.x(r.date)} cy={geo.ey(r.value)} r={5.5} className="strand-cursor-ring" />
              ))}
            </g>
          )}

          {/* Months. */}
          <line x1={PAD_L} x2={width - 4} y1={AXIS} y2={AXIS} className="strand-axis" />
          {geo.months.map((mo) => (
            <g key={`m${mo.x}`}>
              <line x1={mo.x} x2={mo.x} y1={AXIS} y2={AXIS + 4} className="strand-axis" />
              <text x={mo.x} y={AXIS + 15} className="strand-month">
                {mo.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="relative z-[1] mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
        <span>
          <i className="strand-key strand-key-load" aria-hidden /> {t('Width of the strand: commitments active that week')}
        </span>
        <span>
          <i className="strand-key strand-key-spark" aria-hidden /> {t('A note')}
        </span>
        <span>
          <i className="strand-key strand-key-knot" aria-hidden /> {t('A decision; dashed branches are the options not taken')}
        </span>
        <span>
          <i className="strand-key strand-key-energy" aria-hidden /> {t('Energy you recorded')}
        </span>
        <span className="text-ink-3/80">{t('Point at a week to read it; choose it to go there below.')}</span>
      </div>
    </section>
  );
}
