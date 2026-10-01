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
import { almanacOf, arc, BEZEL, MONTHS, PHASES, polar, RIM, RINGS, SKY, dateAt, type Mark, type Ring } from './almanac';

/**
 * The machine's beat: the year's disc moves on a week at every beat, quickly, a little past and back, as an
 * escapement lets a clock's wheel go, and holds for the rest of it. It turns backwards, so the needle reads the
 * year forwards.
 */
const BEAT_MS = 1400;
const MOVE_MS = 340;
/** The gears it drives: teeth round the disc's rim, and a pinion at the needle they turn. */
const RIM_TEETH = 180;
const PIN_TEETH = 14;
const PITCH = RIM[1] + 4;
const PIN_R = (PITCH * PIN_TEETH) / RIM_TEETH;
const PIN_Y = -(PITCH + PIN_R);
/** The space in the middle drifts on its own, slowly, as space does: it is not part of the machine. */
const SPACE_TURN = 900;
/** A mark that passes the comb lights for this long; a plucked tine rings for this long; what passed stays read out. */
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
/** Distant stars for the space in the middle: only a backdrop, made once, the same every time. */
function spaceStars() {
  let a = 0x2f6b9c1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 110 }, () => {
    const d = (SKY - 4) * Math.sqrt(r());
    const th = r() * Math.PI * 2;
    const big = r() < 0.08;
    return { x: Math.cos(th) * d, y: Math.sin(th) * d, r: big ? 1.4 + r() : 0.4 + r() * 0.8, o: big ? 0.85 : 0.2 + r() * 0.45, glow: big };
  });
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

type Hover = { kind: 'mark'; mark: Mark } | { kind: 'ring'; ring: Ring } | null;

/**
 * Repeats as an almanac that runs like a music box (see almanac.ts): round empty space, the phases of a repeat,
 * the months, and a ring for every repeat, on a disc that moves on a week at every beat under a comb that stays
 * put. Its toothed rim turns a pinion at the comb; each time a repeat happened plucks the comb's tine as it
 * passes, lights, and is read out: the year plays again and again, a repeat repeating.
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
  const bezel = useRef<SVGGElement>(null);
  const phases = useRef<SVGGElement>(null);
  const space = useRef<SVGGElement>(null);
  const pinion = useRef<SVGGElement>(null);
  const readDate = useRef<SVGTextElement>(null);
  const flashEls = useRef(new Map<string, SVGCircleElement>());
  const tineEls = useRef(new Map<string, SVGLineElement>());
  const stars = useMemo(spaceStars, []);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<[number, number]>([0, 0]);
  const [read, setRead] = useState<Mark | null>(null);
  // The needle starts a little before the first time anything repeated, so the year it plays has something in it.
  const firstMark = Math.min(...al.rings.flatMap((r) => r.marks.map((m) => m.angle)), al.today);
  const motion = useRef({ angle: -(firstMark - 6), space: 0, held: false });

  // The machine. At every beat the disc moves on a week (unless you are pointing at it), and everything it drives
  // moves with it: the pinion at the comb, faster and the other way; the bezel the other way; the phases a little
  // the same way. Each time a repeat happened plucks the comb's tine as it passes, lights, and is read out.
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
      bezel.current?.setAttribute('transform', `rotate(${(-m.angle * 1.5).toFixed(3)})`);
      phases.current?.setAttribute('transform', `rotate(${(m.angle * 0.3).toFixed(3)})`);
      space.current?.setAttribute('transform', `rotate(${m.space.toFixed(3)})`);
      pinion.current?.setAttribute(
        'transform',
        `translate(0 ${PIN_Y.toFixed(2)}) rotate(${((-m.angle * RIM_TEETH) / PIN_TEETH + 180 / PIN_TEETH).toFixed(3)})`,
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
      // A plucked tine rings: bent by the mark, then back and forth, dying away.
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

  // Fixed paths: the ticks round the rim and on the bezel, made once.
  const rimTicks = useMemo(() => {
    let d = '';
    for (let i = 0; i < al.window.days; i++) {
      const a = (i / al.window.days) * 360;
      const [x0, y0] = polar(a, RIM[0] + 4);
      const [x1, y1] = polar(a, RIM[0] + 8);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }, [al]);
  const weekTicks = useMemo(() => {
    let d = '';
    for (let i = 0; i < al.window.days; i++) {
      const date = dateAt(((i + 0.5) / al.window.days) * 360, al.window);
      if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) continue;
      const a = ((i + 0.5) / al.window.days) * 360;
      const [x0, y0] = polar(a, MONTHS[1] - 7);
      const [x1, y1] = polar(a, MONTHS[1]);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }, [al]);
  const bezelTicks = useMemo(() => {
    let d = '';
    for (let a = 0; a < 360; a += 3) {
      const [x0, y0] = polar(a, a % 30 === 0 ? BEZEL[0] + 12 : BEZEL[0] + 16);
      const [x1, y1] = polar(a, BEZEL[1]);
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }, []);
  const manyMonths = al.months.length > 18;
  const rimGear = useMemo(() => gear(RIM_TEETH, RIM[1], RIM[1] + 8), []);
  const pinGear = useMemo(() => gear(PIN_TEETH, PIN_R - 4, PIN_R + 4), []);

  // The phases of the selected repeat: what sets it off, what you do, what follows.
  const phaseText = [
    { word: t('Triggers'), text: selected?.triggers[0] },
    { word: t('Behaviour'), text: selected?.behaviors[0] },
    { word: t('Consequence'), text: selected?.consequences[0] },
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
              <path key={i} id={`al-month-${i}`} d={arc(mo.from, mo.to, (MONTHS[0] + MONTHS[1]) / 2 - 4)} />
            ))}
            {al.rings.map((r) => (
              <path key={r.patternId} id={`al-ring-${r.patternId}`} d={arc((r.span?.[0] ?? 0) + 1, (r.span?.[0] ?? 0) + 300, r.radius + 13)} />
            ))}
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <path id={`al-phase-${i}`} d={arc(i * 120 + 4, (i + 1) * 120 - 4, 216)} />
                <path id={`al-phase-text-${i}`} d={arc(i * 120 + 4, (i + 1) * 120 - 4, 194)} />
              </g>
            ))}
            <radialGradient id="al-sky" r="0.5" cx="0.5" cy="0.5">
              <stop offset="0" stopColor="#0a0c10" />
              <stop offset="1" stopColor="#020304" />
            </radialGradient>
            <radialGradient id="al-nebula" r="0.5" cx="0.5" cy="0.5">
              <stop offset="0" stopColor="rgb(150 170 210)" stopOpacity="0.07" />
              <stop offset="1" stopColor="rgb(150 170 210)" stopOpacity="0" />
            </radialGradient>
            <clipPath id="al-space-clip">
              <circle r={SKY - 1} />
            </clipPath>
          </defs>

          {/* In the middle, only space, drifting on its own. */}
          <g clipPath="url(#al-space-clip)" aria-hidden>
            <circle r={SKY} fill="url(#al-sky)" />
            <g ref={space}>
              <circle cx={-SKY * 0.3} cy={SKY * 0.2} r={SKY * 0.7} fill="url(#al-nebula)" />
              {stars.map((st, i) => (
                <g key={i}>
                  {st.glow && <circle cx={st.x} cy={st.y} r={st.r * 4} className="al-space-glow" />}
                  <circle cx={st.x} cy={st.y} r={st.r} opacity={st.o} className="al-space-star" />
                </g>
              ))}
            </g>
          </g>
          <circle r={SKY} className="al-sky" />

          {/* The dial's plate, round the space in the middle. */}
          <path
            d={`M${-RIM[1]} 0A${RIM[1]} ${RIM[1]} 0 1 0 ${RIM[1]} 0A${RIM[1]} ${RIM[1]} 0 1 0 ${-RIM[1]} 0ZM${-SKY} 0A${SKY} ${SKY} 0 1 1 ${SKY} 0A${SKY} ${SKY} 0 1 1 ${-SKY} 0Z`}
            fillRule="evenodd"
            className="al-plate"
          />

          {/* The year's disc: the months, the repeats, the toothed rim. */}
          <g ref={disc}>
            {/* The months, with a tick for every week, and today. */}
            <circle r={MONTHS[0]} className="al-rule" />
            <circle r={MONTHS[1]} className="al-rule" />
            <path d={weekTicks} className="al-tick" />
            {al.months.map((mo, i) => {
              const [x0, y0] = polar(mo.from, MONTHS[0]);
              const [x1, y1] = polar(mo.from, MONTHS[1]);
              const label = !manyMonths || ['01', '04', '07', '10'].includes(mo.first.slice(5, 7));
              const year = i === 0 || mo.first.slice(5, 7) === '01';
              return (
                <g key={mo.first}>
                  <line x1={x0} y1={y0} x2={x1} y2={y1} className="al-rule" />
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
              const [x0, y0] = polar(al.today, PHASES[1] + 2);
              const [x1, y1] = polar(al.today, RIM[1] + 6);
              const [tx, ty] = polar(al.today + 1.2, MONTHS[1] + 10);
              return (
                <g className="al-today">
                  <line x1={x0} y1={y0} x2={x1} y2={y1} />
                  <text x={tx} y={ty} transform={`rotate(${al.today} ${tx} ${ty})`}>
                    {t('Today').toUpperCase()}
                  </text>
                </g>
              );
            })()}

            {/* A ring for every repeat. */}
            {al.rings.map((r) => {
              const isSel = r.patternId === selected?.id;
              const lit = hover?.kind === 'ring' && hover.ring.patternId === r.patternId;
              const p = data.patterns[r.patternId];
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
                  {p && (
                    <text className="al-ring-title">
                      <textPath href={`#al-ring-${r.patternId}`}>{clip(`${patternCode(p.code)} · ${p.title}`, 72).toUpperCase()}</textPath>
                    </text>
                  )}
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
                        <circle cx={x} cy={y} r={5.2} className={mk.stance === 'supports' ? 'al-mark' : 'al-mark is-exception'} />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* The rim: a tick for every day, a longer one at every month, and the teeth that turn the pinion. */}
            <path d={rimGear} className="al-gear" />
            <path d={rimTicks} className="al-tick is-fine" />
            {al.months.map((mo) => {
              const [x0, y0] = polar(mo.from, RIM[0] - 2);
              const [x1, y1] = polar(mo.from, RIM[1]);
              return <line key={`rim-${mo.first}`} x1={x0} y1={y0} x2={x1} y2={y1} className="al-tick" />;
            })}
          </g>

          {/* The bezel: geared to the disc, turning the other way. */}
          <g ref={bezel} className="al-bezel">
            {[0, 3, 6, 9, 12].map((d) => (
              <circle key={d} r={BEZEL[0] + 1 + d} />
            ))}
            <path d={bezelTicks} />
          </g>

          {/* The phases of a repeat, geared to turn a little with the disc: what sets it off, what you do, what follows. No
              arrow back from what follows to what sets it off: a repeat is a chain; whether it closes a loop is a
              question for Causes. */}
          <g ref={phases} className="al-phases">
            <circle r={PHASES[0]} className="al-rule" />
            <circle r={PHASES[1]} className="al-rule" />
            {phaseText.map((ph, i) => {
              const [x0, y0] = polar(i * 120, PHASES[0]);
              const [x1, y1] = polar(i * 120, PHASES[1]);
              const [ax, ay] = polar(i * 120, 210);
              return (
                <g key={i}>
                  <line x1={x0} y1={y0} x2={x1} y2={y1} className="al-rule" />
                  {i > 0 && <path d="M-5 -6L3 0L-5 6" transform={`translate(${ax} ${ay}) rotate(${i * 120})`} className="al-arrow" />}
                  <text className="al-phase">
                    <textPath href={`#al-phase-${i}`} startOffset="50%" textAnchor="middle">
                      {ph.word.toUpperCase()}
                    </textPath>
                  </text>
                  {ph.text && (
                    <text className="al-phase-text">
                      <textPath href={`#al-phase-text-${i}`} startOffset="50%" textAnchor="middle">
                        {clip(ph.text, 58)}
                      </textPath>
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* The comb, which stays put: a line read across the year, a tine at every repeat's ring for the marks to
              pluck, and the pinion the rim turns. What it reads is set out either side of the pinion. */}
          <g className="al-needle" aria-hidden>
            <path d={`M-3 ${-SKY}L3 ${-SKY}L1.4 ${-RIM[1]}L-1.4 ${-RIM[1]}Z`} className="al-needle-band" />
            <line x1={0} y1={-SKY + 6} x2={0} y2={PIN_Y} />
            <line x1={-6} y1={-(RINGS[0] - 10)} x2={6} y2={-(RINGS[0] - 10)} />
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
          </div>
        )}
      </div>

      {/* Set out beside the wheel, as an almanac sets out its notes: what the selected repeat is, why it may happen,
          what it may mean for your options, and your view of it. Its full record is below. */}
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
