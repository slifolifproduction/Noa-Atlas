import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { claimSentence, claimStatus } from '../../domain/claims';
import { REGULARITY_LABEL, STATUS_META } from '../../domain/constants';
import { pathCode, patternCode, resolveSource } from '../../domain/selectors';
import type { Pattern } from '../../domain/types';
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatDate, formatMonthShort, useToday, weekStart } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { almanacOf, arc, BAND, dateAt, MAIN, polar, RIM, type Mark, type Ring } from './almanac';

/**
 * The machine's beat: the year moves on a week at every beat, quickly, a little past and back, as an escapement
 * lets a clock's wheel go, and holds for the rest of it. It turns backwards, so the comb reads the year forwards.
 */
const BEAT_MS = 1400;
const MOVE_MS = 340;
/** The toothed rim turns a pinion at the comb. */
const RIM_TEETH = 180;
const PIN_TEETH = 14;
const PITCH = RIM[1] + 4;
const PIN_R = (PITCH * PIN_TEETH) / RIM_TEETH;
const PIN_Y = -(PITCH + PIN_R);
/**
 * The workings inside: a gear for each phase of the repeat being read, each driving the next and none driving
 * the first again (a repeat is a chain; whether it closes a loop is for Causes to show). Teeth of one size, so
 * they mesh: a gear's radius is its teeth times the pitch over a full turn. Laid out round the axle, clear of it
 * and of the year's circle.
 */
const TOOTH = 14;
const PHASE_TEETH = [50, 40, 32];
const GEAR_R = PHASE_TEETH.map((n) => (n * TOOTH) / (2 * Math.PI));
/** How far the first gear turns for the year's every degree. */
const DRIVE = 2.2;
const add = (a: [number, number], b: [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]];
const GEAR_AT: [number, number][] = (() => {
  const g1 = polar(-3, 135);
  const g2 = add(g1, polar(207, GEAR_R[0] + GEAR_R[1]));
  const g3 = add(g2, polar(101, GEAR_R[1] + GEAR_R[2]));
  return [g1, g2, g3];
})();
/** Where each pair meets (degrees clockwise from the top, from the first of the pair), so their teeth can be set to mesh. */
const towards = (a: [number, number], b: [number, number]) => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90 + 360) % 360;
/** Which way each gear's callout leaves it (degrees clockwise from the top), into clear space. */
const CALLOUT = [-65, -140, 140];
const GEAR_PHASE: number[] = (() => {
  const pitch = PHASE_TEETH.map((n) => 360 / n);
  const a12 = towards(GEAR_AT[0], GEAR_AT[1]);
  const a23 = towards(GEAR_AT[1], GEAR_AT[2]);
  const p1 = a12;
  const p2 = a12 + 180 - pitch[1] / 2;
  const u = ((((a23 - p2) / pitch[1]) % 1) + 1) % 1;
  const p3 = a23 + 180 - (0.5 - u) * pitch[2];
  return [p1, p2, p3];
})();
/** The space inside the year's circle drifts on its own, slowly, as space does: it is not part of the machine. */
const SPACE_TURN = 900;
/** A bead that passes the comb lights for this long; a plucked tine rings for this long; what passed stays read out. */
const FLASH_MS = 1100;
const PLUCK_MS = 900;
const READ_MS = 3600;
/** Quick, a little past, and back: an escapement's step. */
const escape = (k: number) => {
  const c1 = 1.9;
  return 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
};
/** A gear's outline: `n` teeth between two radii, as SVG path data, centred on the origin. */
function gear(n: number, root: number, tip: number) {
  const pitch = 360 / n;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * pitch;
    const pts = [polar(a - pitch * 0.32, root), polar(a - pitch * 0.18, tip), polar(a + pitch * 0.18, tip), polar(a + pitch * 0.32, root)];
    d += pts.map(([x, y], j) => `${i === 0 && j === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  }
  return `${d}Z`;
}
/** Ticks round a circle, as SVG path data: `n` of them between two radii. */
function ticks(n: number, r0: number, r1: number) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    const [x0, y0] = polar(a, r0);
    const [x1, y1] = polar(a, r1);
    d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}
/** Distant stars for the space inside: only a backdrop, made once, the same every time. */
function spaceStars() {
  let a = 0x2f6b9c1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 150 }, () => {
    const d = (MAIN - 12) * Math.sqrt(r());
    const th = r() * Math.PI * 2;
    const big = r() < 0.06;
    return { x: Math.cos(th) * d, y: Math.sin(th) * d, r: big ? 1.3 + r() : 0.4 + r() * 0.7, o: big ? 0.6 : 0.12 + r() * 0.3, glow: big };
  });
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

type Hover = { kind: 'mark'; mark: Mark } | { kind: 'ring'; ring: Ring } | { kind: 'phase'; i: number } | null;

/**
 * Repeats as a mechanism, drawn like an engineer's drawing (see almanac.ts): the year's graduated circle, an arc of
 * beads outside it for every repeat, and inside, over empty space, the workings of the repeat being read: its
 * phases as gears, each driving the next. At every beat the year moves on a week; its toothed rim turns a pinion
 * at the comb, and the gears inside turn with it. Each time a repeat happened plucks the comb's tine as it passes,
 * lights, and is read out: the year plays again and again, a repeat repeating.
 */
export function Almanac({ patterns, selected, schedule }: { patterns: Pattern[]; selected?: Pattern; schedule: ReactNode }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const today = useToday();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const wide = useIsDesktop();
  const al = useMemo(() => almanacOf(data, patterns, today), [data, patterns, today]);
  const plateRef = useRef<HTMLDivElement>(null);
  const disc = useRef<SVGGElement>(null);
  const space = useRef<SVGGElement>(null);
  const pinion = useRef<SVGGElement>(null);
  const guide = useRef<SVGGElement>(null);
  const gears = useRef<(SVGGElement | null)[]>([]);
  const readDate = useRef<SVGTextElement>(null);
  const flashEls = useRef(new Map<string, SVGCircleElement>());
  const tineEls = useRef(new Map<string, SVGLineElement>());
  const stars = useMemo(spaceStars, []);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<[number, number]>([0, 0]);
  const [read, setRead] = useState<Mark | null>(null);
  // The comb starts a little before the first time anything repeated, so the year it plays has something in it.
  const firstMark = Math.min(...al.rings.flatMap((r) => r.marks.map((m) => m.angle)), al.today);
  const motion = useRef({ angle: -(firstMark - 6), space: 0, held: false });

  // The machine. At every beat the year moves on a week (unless you are pointing at it), and everything it drives
  // moves with it: the pinion at the comb, the gears inside, the guide circle outside. Each time a repeat happened
  // plucks the comb's tine as it passes, lights, and is read out.
  useEffect(() => {
    let raf = 0;
    const m = motion.current;
    const week = (7 / al.window.days) * 360;
    const readAt = (angle: number) => ((-angle % 360) + 360) % 360;
    let from = m.angle;
    let to = m.angle;
    let moveAt = -Infinity;
    let nextAt = performance.now() + 700;
    let settled = true;
    let last = performance.now();
    let prev = readAt(m.angle);
    const flashes = new Map<string, number>();
    const plucks = new Map<string, number>();
    const show = () => {
      if (readDate.current)
        readDate.current.textContent = t('Week of {date}', { date: formatDate(weekStart(dateAt(readAt(m.angle), al.window))) }).toUpperCase();
    };
    show();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;
      if (reduced) {
        m.angle = -al.today;
      } else {
        if (now >= nextAt) {
          if (m.held) nextAt = now + 200;
          else {
            from = m.angle;
            to = from - week;
            moveAt = now;
            nextAt = now + BEAT_MS;
            settled = false;
          }
        }
        const k = Math.min(1, (now - moveAt) / MOVE_MS);
        if (!settled) {
          m.angle = from + (to - from) * escape(k);
          if (k >= 1) {
            m.angle = to;
            settled = true;
            show();
          }
        }
        m.space += (dt / 1000) * (360 / SPACE_TURN);
      }
      disc.current?.setAttribute('transform', `rotate(${m.angle.toFixed(3)})`);
      space.current?.setAttribute('transform', `rotate(${m.space.toFixed(3)})`);
      guide.current?.setAttribute('transform', `rotate(${(-m.angle * 0.25).toFixed(3)})`);
      pinion.current?.setAttribute(
        'transform',
        `translate(0 ${PIN_Y.toFixed(2)}) rotate(${((-m.angle * RIM_TEETH) / PIN_TEETH + 180 / PIN_TEETH).toFixed(3)})`,
      );
      // The gears inside: the first driven by the year, each next one the other way, by their teeth.
      const turn1 = -m.angle * DRIVE;
      const turns = [turn1, (-turn1 * PHASE_TEETH[0]) / PHASE_TEETH[1], (turn1 * PHASE_TEETH[0]) / PHASE_TEETH[2]];
      gears.current.forEach((g, i) =>
        g?.setAttribute('transform', `translate(${GEAR_AT[i][0].toFixed(2)} ${GEAR_AT[i][1].toFixed(2)}) rotate(${(GEAR_PHASE[i] + turns[i]).toFixed(3)})`),
      );
      // What passed the comb this frame.
      const at = readAt(m.angle);
      if (!reduced && at !== prev) {
        const forward = (at - prev + 360) % 360 < 180;
        const [lo, hi] = forward ? [prev, at] : [at, prev];
        const crossed = (a: number) => (lo <= hi ? a > lo && a <= hi : a > lo || a <= hi);
        for (const r of al.rings)
          for (const mk of r.marks)
            if (crossed(mk.angle)) {
              flashes.set(mk.key, now);
              plucks.set(r.patternId, now);
              setRead(mk);
            }
      }
      prev = at;
      for (const [key, t0] of flashes) {
        const el = flashEls.current.get(key);
        const k = (now - t0) / FLASH_MS;
        if (!el || k >= 1) {
          el?.setAttribute('opacity', '0');
          flashes.delete(key);
          continue;
        }
        el.setAttribute('r', (6 + k * 16).toFixed(1));
        el.setAttribute('opacity', ((1 - k) * 0.9).toFixed(2));
      }
      // A plucked tine rings: bent by the bead, then back and forth, dying away.
      for (const [id, t0] of plucks) {
        const el = tineEls.current.get(id);
        const k = (now - t0) / PLUCK_MS;
        const r = al.rings.find((x) => x.patternId === id)?.radius ?? 0;
        if (!el || k >= 1) {
          el?.setAttribute('transform', `rotate(0 0 ${-r})`);
          el?.classList.remove('is-ringing');
          plucks.delete(id);
          continue;
        }
        el.classList.add('is-ringing');
        el.setAttribute('transform', `rotate(${(-24 * Math.exp(-k * 4.5) * Math.cos(k * Math.PI * 2 * 5)).toFixed(2)} 0 ${-r})`);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [al, reduced]);
  useEffect(() => {
    if (!read) return;
    const id = setTimeout(() => setRead(null), READ_MS);
    return () => clearTimeout(id);
  }, [read]);

  const point = (e: React.PointerEvent, h: Hover) => {
    const r = plateRef.current!.getBoundingClientRect();
    setTip([e.clientX - r.left, e.clientY - r.top]);
    setHover(h);
  };
  const choose = (id: string) => navigate('patterns', id);
  const readOut = read ? `${patternCode(data.patterns[read.patternId]?.code ?? 0)} · ${read.stance === 'supports' ? t('it happened') : t('an exception')}` : '';

  // Fixed paths, made once: the year's graduation (a tick a day, longer every week, longest every month), the
  // toothed rim, the pinion, and each phase gear.
  const band = useMemo(() => {
    let days = '';
    let weeks = '';
    for (let i = 0; i < al.window.days; i++) {
      const a = ((i + 0.5) / al.window.days) * 360;
      const monday = new Date(`${dateAt(a, al.window)}T12:00:00Z`).getUTCDay() === 1;
      const [x0, y0] = polar(a, monday ? BAND[0] : BAND[0] + 4);
      const [x1, y1] = polar(a, monday ? BAND[1] : BAND[0] + 12);
      const seg = `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
      if (monday) weeks += seg;
      else days += seg;
    }
    return { days, weeks };
  }, [al]);
  const rimGear = useMemo(() => gear(RIM_TEETH, RIM[1], RIM[1] + 8), []);
  const rimTicks = useMemo(() => ticks(72, RIM[0], RIM[0] + 5), []);
  const pinGear = useMemo(() => gear(PIN_TEETH, PIN_R - 4, PIN_R + 4), []);
  const phaseGears = useMemo(() => GEAR_R.map((r, i) => gear(PHASE_TEETH[i], r - 3.5, r + 3.5)), []);
  const manyMonths = al.months.length > 18;
  const sel = selected ? al.rings.find((r) => r.patternId === selected.id) : undefined;

  // The phases of the selected repeat, a gear each: what sets it off, what you do, what follows.
  const phases = [
    { word: t('Triggers'), items: selected?.triggers ?? [] },
    { word: t('Behaviour'), items: selected?.behaviors ?? [] },
    { word: t('Consequence'), items: selected?.consequences ?? [] },
  ];

  const claims = selected
    ? selected.explainedBy
        .map((id) => data.claims[id])
        .filter(Boolean)
        .slice(0, 2)
    : [];

  return (
    <div className="almanac-stage">
      <div className="almanac-side is-left">
        <div className="tree-block almanac-block" aria-hidden>
          <div className="tree-block-main">
            <div className="tree-block-row is-head">{t('Plate · Repeats').toUpperCase()}</div>
            <div className="tree-block-row is-sub">{t('The year, turning · every time it happened').toUpperCase()}</div>
          </div>
        </div>
        <div className="almanac-schedule">{schedule}</div>
        <p className="almanac-hint">{t('Point at the wheel to stop it · at a ring to read it · at a mark to open the note')}</p>
      </div>

      <div ref={plateRef} className={cn('almanac-plate', hover && 'is-pointing')}>
        <svg
          className="almanac-dial"
          viewBox="-500 -562 1000 1062"
          role="img"
          aria-label={t('Every time each repeat happened, on a year that turns')}
          onPointerEnter={() => {
            motion.current.held = true;
          }}
          onPointerLeave={() => {
            motion.current.held = false;
            setHover(null);
          }}
        >
          <defs>
            {al.months.map((mo, i) => (
              <path key={i} id={`al-month-${i}`} d={arc(mo.from, mo.to, BAND[1] + 9)} />
            ))}
            {sel && <path id="al-ring-title" d={arc((sel.span?.[0] ?? 0) + 1, (sel.span?.[0] ?? 0) + 300, sel.radius + 9)} />}
            <radialGradient id="al-sky" r="0.5" cx="0.5" cy="0.5">
              <stop offset="0" stopColor="#0a0c10" />
              <stop offset="1" stopColor="#030405" />
            </radialGradient>
            <clipPath id="al-space-clip">
              <circle r={MAIN - 1} />
            </clipPath>
          </defs>

          {/* Inside the year's circle, empty space, drifting on its own. */}
          <g clipPath="url(#al-space-clip)" aria-hidden>
            <circle r={MAIN} fill="url(#al-sky)" />
            <g ref={space}>
              {stars.map((st, i) => (
                <g key={i}>
                  {st.glow && <circle cx={st.x} cy={st.y} r={st.r * 4} className="al-space-glow" />}
                  <circle cx={st.x} cy={st.y} r={st.r} opacity={st.o} className="al-space-star" />
                </g>
              ))}
            </g>
          </g>

          {/* A guide circle outside it all, dashed, turning slowly the other way, as a drawing's construction does. */}
          <g ref={guide} aria-hidden>
            <circle r={492} className="al-guide" />
            {[38, 212].map((a) => {
              const [x, y] = polar(a, 492);
              return <circle key={a} cx={x} cy={y} r={3.2} className="al-node" />;
            })}
          </g>

          {/* The workings: a gear for each phase of the repeat being read, round the axle, each driving the next. */}
          <g className="al-works">
            {GEAR_AT.map(([x, y], i) => (
              <g key={`c${i}`} aria-hidden>
                <line x1={0} y1={0} x2={x} y2={y} className="al-construct" />
                <circle cx={x} cy={y} r={GEAR_R[i] + 18} className="al-construct" />
              </g>
            ))}
            {phases.map((ph, i) => {
              const r = GEAR_R[i];
              const [gx, gy] = GEAR_AT[i];
              const n = ph.items.length;
              // Its callout: out of the gear into the clear space inside the year's circle, then level.
              const [ux, uy] = polar(CALLOUT[i], 1);
              const [rx, ry] = [gx + ux * (r + 8), gy + uy * (r + 8)];
              const [lx, ly] = [gx + ux * (r + 24), gy + uy * (r + 24)];
              const side = ux < 0 ? -1 : 1;
              const ex = lx + side * 20;
              return (
                <g
                  key={i}
                  onPointerEnter={(e) => point(e, { kind: 'phase', i })}
                  onPointerMove={(e) => point(e, { kind: 'phase', i })}
                  onPointerLeave={() => setHover(null)}
                >
                  <g
                    ref={(el) => {
                      gears.current[i] = el;
                    }}
                    className="al-gear-phase"
                  >
                    <path d={phaseGears[i]} className="al-gear" />
                    <circle r={r - 14} className="al-rule" />
                    <circle r={r * 0.36} className="al-rule is-faint" />
                    <line x1={-(r - 14)} y1={0} x2={r - 14} y2={0} className="al-rule is-faint" />
                    <line x1={0} y1={-(r - 14)} x2={0} y2={r - 14} className="al-rule is-faint" />
                    {/* A spoke for every one written down for this phase. */}
                    {Array.from({ length: n }, (_, k) => {
                      const [sx, sy] = polar((k * 360) / Math.max(1, n) + 45, r * 0.68);
                      return (
                        <g key={k}>
                          <line x1={0} y1={0} x2={sx} y2={sy} className="al-spoke" />
                          <circle cx={sx} cy={sy} r={4.2} className="al-node" />
                        </g>
                      );
                    })}
                  </g>
                  <circle cx={gx} cy={gy} r={r} className="al-hit" />
                  <circle cx={gx} cy={gy} r={9} className="al-hub" />
                  <circle cx={gx} cy={gy} r={2.6} className="al-node" />
                  <path d={`M${rx} ${ry}L${lx} ${ly}L${ex} ${ly}`} className="al-leader" />
                  <circle cx={rx} cy={ry} r={2.4} className="al-node" />
                  <text x={ex + side * 5} y={ly + 3.5} textAnchor={side < 0 ? 'end' : 'start'} className="al-callout">
                    {ph.word.toUpperCase()}
                    {n > 0 ? ` · ${n}` : ''}
                  </text>
                </g>
              );
            })}
            {/* Arrows on the way from one phase to the next, where they mesh: none back from the last to the first. */}
            {[0, 1].map((i) => {
              const [a, b] = [GEAR_AT[i], GEAR_AT[i + 1]];
              const m = [a[0] + ((b[0] - a[0]) * GEAR_R[i]) / (GEAR_R[i] + GEAR_R[i + 1]), a[1] + ((b[1] - a[1]) * GEAR_R[i]) / (GEAR_R[i] + GEAR_R[i + 1])];
              const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
              return (
                <path
                  key={i}
                  d="M-6 -7L4 0L-6 7"
                  transform={`translate(${m[0].toFixed(1)} ${m[1].toFixed(1)}) rotate(${ang.toFixed(1)})`}
                  className="al-arrow"
                />
              );
            })}
            {/* The axle in the middle. */}
            <circle r={22} className="al-hub is-axle" />
            <circle r={34} className="al-construct" />
            <circle r={5} className="al-node" />
          </g>

          {/* The year: its graduated circle, the months, today, the arcs of beads, the toothed rim. */}
          <g ref={disc}>
            <circle r={MAIN} className="al-main" />
            <circle r={BAND[1]} className="al-rule" />
            <path d={band.days} className="al-tick is-fine" />
            <path d={band.weeks} className="al-tick" />
            {al.months.map((mo, i) => {
              const [x0, y0] = polar(mo.from, BAND[0] - 10);
              const [x1, y1] = polar(mo.from, BAND[1] + 2);
              const label = !manyMonths || ['01', '04', '07', '10'].includes(mo.first.slice(5, 7));
              const year = i === 0 || mo.first.slice(5, 7) === '01';
              return (
                <g key={mo.first}>
                  <line x1={x0} y1={y0} x2={x1} y2={y1} className="al-tick is-bold" />
                  {label && mo.to - mo.from > 14 && (
                    <text className="al-month">
                      <textPath href={`#al-month-${i}`} startOffset="50%" textAnchor="middle">
                        {formatMonthShort(mo.first, { year }).toUpperCase()}
                      </textPath>
                    </text>
                  )}
                </g>
              );
            })}
            {(() => {
              const [x0, y0] = polar(al.today, MAIN - 14);
              const [x1, y1] = polar(al.today, 492);
              const [cx, cy] = polar(al.today, 500);
              const [tx, ty] = polar(al.today + 1.4, 478);
              return (
                <g className="al-today">
                  <line x1={x0} y1={y0} x2={x1} y2={y1} />
                  <path d={`M${cx - 5} ${cy}L${cx + 5} ${cy}M${cx} ${cy - 5}L${cx} ${cy + 5}`} />
                  <text x={tx} y={ty} transform={`rotate(${al.today} ${tx} ${ty})`}>
                    {t('Today').toUpperCase()}
                  </text>
                </g>
              );
            })()}

            {/* An arc of beads for every repeat. */}
            {al.rings.map((r) => {
              const isSel = r.patternId === selected?.id;
              const lit = hover?.kind === 'ring' && hover.ring.patternId === r.patternId;
              return (
                <g key={r.patternId} className={cn('al-ring', `is-${r.regularity}`, isSel && 'is-selected', lit && 'is-lit')}>
                  <circle r={r.radius} className="al-track" />
                  <circle
                    r={r.radius}
                    className="al-ring-hit"
                    onPointerEnter={(e) => point(e, { kind: 'ring', ring: r })}
                    onPointerMove={(e) => point(e, { kind: 'ring', ring: r })}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => choose(r.patternId)}
                  />
                  {r.span && <path d={arc(r.span[0], r.span[1], r.radius)} className="al-span" />}
                  {r.since && <path d={arc(r.since[0], r.since[1], r.radius)} className="al-since" />}
                  {r.marks.map((mk) => {
                    const [x, y] = polar(mk.angle, r.radius);
                    return (
                      <g
                        key={mk.key}
                        onPointerEnter={(e) => point(e, { kind: 'mark', mark: mk })}
                        onPointerLeave={() => setHover(null)}
                        onClick={() => open(mk.source)}
                      >
                        <circle
                          cx={x}
                          cy={y}
                          r={6}
                          opacity={0}
                          className="al-flash"
                          ref={(el) => {
                            if (el) flashEls.current.set(mk.key, el);
                            else flashEls.current.delete(mk.key);
                          }}
                        />
                        <circle cx={x} cy={y} r={10} className="al-hit" />
                        <circle cx={x} cy={y} r={5.4} className={mk.stance === 'supports' ? 'al-mark' : 'al-mark is-exception'} />
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {sel && selected && (
              <text className="al-ring-title">
                <textPath href="#al-ring-title">{clip(`${patternCode(selected.code)} · ${selected.title}`, 72).toUpperCase()}</textPath>
              </text>
            )}

            <path d={rimGear} className="al-gear" />
            <path d={rimTicks} className="al-tick is-fine" />
          </g>

          {/* The comb, which stays put: a line read across the year, a tine at every arc of beads for them to pluck,
              and the pinion the rim turns. What it reads is set out either side of the pinion. */}
          <g className="al-needle" aria-hidden>
            <path d={`M-3 ${-MAIN}L3 ${-MAIN}L1.4 ${-RIM[1]}L-1.4 ${-RIM[1]}Z`} className="al-needle-band" />
            <line x1={0} y1={-MAIN + 16} x2={0} y2={PIN_Y} />
            <path d={`M-6 ${-MAIN + 16}L6 ${-MAIN + 16}`} />
            {al.rings.map((r) => (
              <line
                key={r.patternId}
                x1={0}
                y1={-r.radius}
                x2={17}
                y2={-r.radius - 4}
                className={cn('al-tine', r.patternId === selected?.id && 'is-selected')}
                ref={(el) => {
                  if (el) tineEls.current.set(r.patternId, el);
                  else tineEls.current.delete(r.patternId);
                }}
              />
            ))}
            <g ref={pinion} className="al-pinion">
              <path d={pinGear} className="al-gear" />
              <circle r={PIN_R - 9} className="al-rule" />
              {[0, 120, 240].map((a) => {
                const [x, y] = polar(a, PIN_R - 9);
                return <line key={a} x1={0} y1={0} x2={x} y2={y} className="al-rule" />;
              })}
            </g>
            <circle cy={PIN_Y} r={5} className="al-needle-head" />
            <text ref={readDate} x={-PIN_R - 16} y={PIN_Y + 5} textAnchor="end" className="al-read-date" />
            <text x={PIN_R + 16} y={PIN_Y + 5} textAnchor="start" className={cn('al-read', read?.stance === 'supports' && 'is-on')}>
              {readOut.toUpperCase()}
            </text>
          </g>
        </svg>

        {hover && (
          <div className="almanac-tip" style={{ transform: `translate(${tip[0] + 14}px, ${tip[1] + 14}px)` }}>
            {hover.kind === 'mark' && (
              <>
                <div className="almanac-tip-meta">
                  {formatDate(hover.mark.date, { year: true }).toUpperCase()} ·{' '}
                  {(hover.mark.stance === 'supports' ? t('it happened') : t('an exception')).toUpperCase()}
                </div>
                <div className="almanac-tip-title">{resolveSource(data, hover.mark.source).title}</div>
                <div className="almanac-tip-sub">
                  {resolveSource(data, hover.mark.source).code} · {patternCode(data.patterns[hover.mark.patternId]?.code ?? 0)}
                </div>
              </>
            )}
            {hover.kind === 'ring' && data.patterns[hover.ring.patternId] && (
              <>
                <div className="almanac-tip-meta">
                  {patternCode(data.patterns[hover.ring.patternId].code).toUpperCase()} · {REGULARITY_LABEL[hover.ring.regularity].toUpperCase()}
                </div>
                <div className="almanac-tip-title">{data.patterns[hover.ring.patternId].title}</div>
              </>
            )}
            {hover.kind === 'phase' && (
              <>
                <div className="almanac-tip-meta">{phases[hover.i].word.toUpperCase()}</div>
                {phases[hover.i].items.length ? (
                  <ul className="almanac-tip-list">
                    {phases[hover.i].items.map((x, k) => (
                      <li key={k}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="almanac-tip-sub">—</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Set out beside the wheel, as notes on a drawing: what the selected repeat is, why it may happen, what it may
          mean for your options, and your view of it. Its record is below. */}
      {selected && (
        <div className="almanac-side is-right">
          <section className="almanac-note">
            <h3 className="almanac-note-head">{t('What keeps happening')}</h3>
            <p>{clip(selected.observation, wide ? 260 : 400)}</p>
          </section>
          <section className="almanac-note">
            <h3 className="almanac-note-head">{t('Why it may happen')}</h3>
            {claims.length ? (
              <ul>
                {claims.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => open({ kind: 'claim', id: c.id })}>
                      {clip(claimSentence(data, c), 120)}
                    </button>
                    <span className="almanac-note-meta">{STATUS_META[claimStatus(data, c)].label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="is-dim">{t('No explanation attached yet.')}</p>
            )}
          </section>
          <section className="almanac-note">
            <h3 className="almanac-note-head">{t('What it might mean for your options')}</h3>
            {selected.implications.length ? (
              <ul>
                {selected.implications.slice(0, 2).map((im) => (
                  <li key={im.id}>
                    <span>{clip(im.statement, 120)}</span>
                    {im.pathIds.length > 0 && (
                      <span className="almanac-note-meta">
                        {im.pathIds
                          .map((pid) => (data.paths[pid] ? pathCode(data.paths[pid].code) : ''))
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="is-dim">{t('No implications recorded.')}</p>
            )}
          </section>
          <section className="almanac-note">
            <h3 className="almanac-note-head">{t('Does this ring true?')}</h3>
            <p className={cn(!selected.userAssessment && 'is-dim')}>
              {selected.userAssessment
                ? { resonates: t('It rings true'), partial: t('Partly'), inaccurate: t('Not really') }[selected.userAssessment.verdict]
                : t('Not said yet')}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
