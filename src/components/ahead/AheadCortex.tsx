import { ArrowRight, Check, Pencil, Rows3 } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { currentAction, pathCode } from '../../domain/selectors';
import type { StrategicPath } from '../../domain/types';
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery';
import { t, tn } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { adoptExperimentDraft, commitDirection } from '../../state/operations';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import {
  arcD,
  BAND_LABEL,
  BANDS,
  brain,
  brainReach,
  cortexGeo,
  cortexItems,
  graticule,
  KIND_LABEL,
  layoutCortex,
  nerves,
  polar,
  type Band,
  type CortexItem,
  type CortexKind,
  type Nerve,
  type PlacedItem,
  type Trunk,
} from './cortex';

type Pick = { kind: 'path'; id: string } | { kind: 'item'; key: string } | { kind: 'nerve'; key: string } | { kind: 'band'; band: Band } | null;

/** The reading panel's width on a wide screen, kept clear of the plate. */
const ROOM = 372;

/** A mark for an answer, drawn round (0, 0). */
function Glyph({ kind, item, size = 1 }: { kind: CortexKind; item?: Partial<CortexItem>; size?: number }) {
  const warn = item?.warn ? 'g-warn' : '';
  const s = (n: number) => n * size;
  switch (kind) {
    case 'requirement':
      return <rect x={s(-3.2)} y={s(-3.2)} width={s(6.4)} height={s(6.4)} className="g-fill" />;
    case 'dependency':
      return <rect x={s(-3.2)} y={s(-3.2)} width={s(6.4)} height={s(6.4)} className="g-line" />;
    case 'capital':
      return <path d={`M0 ${s(-4.6)}L${s(4.6)} 0L0 ${s(4.6)}L${s(-4.6)} 0Z`} className="g-fill" />;
    case 'time':
      return (
        <>
          <circle r={s(4.2)} className="g-line" />
          <path d={`M0 0V${s(-3)}M0 0L${s(2.2)} ${s(1.3)}`} className="g-line" />
        </>
      );
    case 'skill':
      return item?.skill === 'have' ? (
        <circle r={s(3.7)} className="g-fill" />
      ) : item?.skill === 'developing' ? (
        <>
          <circle r={s(3.7)} className="g-line" />
          <path d={`M0 ${s(-3.7)}A${s(3.7)} ${s(3.7)} 0 0 1 0 ${s(3.7)}Z`} className="g-fill" />
        </>
      ) : (
        <circle r={s(3.7)} className="g-line g-warn" />
      );
    case 'risk':
      return <path d={`M0 ${s(-4.8)}L${s(4.3)} ${s(3.3)}H${s(-4.3)}Z`} className="g-line" />;
    case 'tradeoff':
      return <path d={`M0 ${s(-4.6)}L${s(4.6)} 0L0 ${s(4.6)}L${s(-4.6)} 0Z`} className="g-line" />;
    case 'cost':
      return <path d={`M${s(-3.5)} ${s(-3.5)}L${s(3.5)} ${s(3.5)}M${s(3.5)} ${s(-3.5)}L${s(-3.5)} ${s(3.5)}`} className="g-line" />;
    case 'unknown':
      return (
        <>
          <circle r={s(4.3)} className="g-line g-dots" />
          <circle r={s(1)} className="g-fill" />
        </>
      );
    case 'assumption':
      return (
        <>
          <circle r={s(4.6)} className={cn('g-line', warn)} style={{ strokeDasharray: item?.dash, opacity: item?.opacity }} />
          <circle r={s(1.7)} className={cn('g-fill', warn)} />
        </>
      );
    case 'test':
    case 'idea':
      return (
        <>
          <circle r={s(3.6)} className={cn('g-line', kind === 'idea' && 'g-dots')} />
          <path
            d={`M${s(-6.5)} 0H${s(-2)}M${s(2)} 0H${s(6.5)}M0 ${s(-6.5)}V${s(-2)}M0 ${s(2)}V${s(6.5)}`}
            className={cn('g-line', kind === 'idea' && 'g-dots')}
          />
        </>
      );
    case 'repeat':
      return (
        <>
          <circle cx={s(-2.5)} r={s(2.7)} className="g-line" />
          <circle cx={s(2.5)} r={s(2.7)} className="g-line" />
        </>
      );
  }
}

/** The key, as an anatomical plate has: each mark and what it is. */
const KEY: { kind: CortexKind; item?: Partial<CortexItem>; label: () => string }[] = [
  { kind: 'requirement', label: () => t('Requirement') },
  { kind: 'dependency', label: () => t('Dependency') },
  { kind: 'capital', label: () => t('Capital') },
  { kind: 'time', label: () => t('Time') },
  { kind: 'skill', item: { skill: 'have' }, label: () => t('Skill you have') },
  { kind: 'skill', item: { skill: 'developing' }, label: () => t('Developing') },
  { kind: 'skill', item: { skill: 'gap', warn: true }, label: () => t('Gap') },
  { kind: 'risk', label: () => t('Risk') },
  { kind: 'tradeoff', label: () => t('Trade-off') },
  { kind: 'cost', label: () => t('Opportunity cost') },
  { kind: 'unknown', label: () => t('Unknown') },
  { kind: 'assumption', label: () => t('Relies on') },
  { kind: 'test', label: () => t('Test') },
  { kind: 'repeat', label: () => t('Repeat in play') },
];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Where an option's name goes: by its nerve's end, kept on the plate (`room` wide) whatever its length. */
function labelAt(tr: Trunk, width: number, room: number, lift: number): [number, number] {
  let [x, y] = tr.label;
  if (tr.anchor === 'end') x = Math.max(x, width + 14);
  else if (tr.anchor === 'start') x = Math.min(x, room - width - 14);
  else x = Math.min(Math.max(x, width / 2 + 14), room - width / 2 - 14);
  return [x, Math.max(y + lift, 30)];
}

/**
 * Ahead, drawn as a nervous system (see cortex.ts). Point at a nerve to see
 * how its option answers each band; point at a band's name to compare all of
 * them on it; click a mark to read it, and act on it, in the panel.
 */
export function AheadCortex({
  paths,
  onEditPath,
  onEditState,
  onCompare,
}: {
  paths: StrategicPath[];
  onEditPath(id: string): void;
  onEditState(): void;
  onCompare(): void;
}) {
  const data = useAtlas((s) => s.data);
  const busy = useUI((s) => s.busy);
  const openEntity = useUI((s) => s.openEntity);
  const wide = useIsDesktop();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const id = `cx${useId().replace(/[^\w]/g, '')}`;
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Pick>(null);
  const [sel, setSel] = useState<Pick>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const nav = data.navigation;
  const state = data.currentState;

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === Math.round(r.width) && s.h === Math.round(r.height) ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const g = useMemo(() => (size.w ? cortexGeo(size.w, size.h, wide ? ROOM : 0) : null), [size, wide]);
  const items = useMemo(() => new Map(paths.map((p) => [p.id, cortexItems(data, p)])), [data, paths]);
  const plate = useMemo(() => {
    if (!g) return null;
    const { trunks, placed } = layoutCortex(g, paths, items);
    return { trunks, placed, brain: brain(g), nerves: nerves(g, state.constraints, state.assets), grid: graticule(g) };
  }, [g, paths, items, state.constraints, state.assets]);

  const byKey = useMemo(() => new Map(plate?.placed.map((p) => [p.key, p]) ?? []), [plate]);
  const nerveByKey = useMemo(() => new Map(plate?.nerves.map((n) => [n.key, n]) ?? []), [plate]);
  const pathById = useMemo(() => new Map(paths.map((p) => [p.id, p])), [paths]);

  // What is lit: the option pointed at or picked, or the one a picked mark belongs to.
  const show = hover ?? sel;
  const litPath = show?.kind === 'path' ? show.id : show?.kind === 'item' ? byKey.get(show.key)?.pathId : undefined;
  const litBand = show?.kind === 'band' ? show.band : undefined;
  const litItem = show?.kind === 'item' ? byKey.get(show.key) : undefined;
  const litNerve = show?.kind === 'nerve' ? nerveByKey.get(show.key) : undefined;
  const counts = (pathId: string, band: Band) => (items.get(pathId) ?? []).filter((i) => i.band === band).length;
  // The bands' names fit on the horizon only when the bands are wide enough; else the key carries them.
  // Band names sit under the horizon only when the longest one (about 7.7px a letter) fits its band.
  const named = Boolean(g && !g.compact && g.r[1] - g.r[0] >= Math.max(...BANDS.map((b) => BAND_LABEL[b]().length)) * 7.7 + 2);

  const pick = (p: Pick) => {
    setSel(p);
    setConfirm(null);
  };

  return (
    <div className="ahead-stage">
      <div
        ref={stage}
        className="ahead-plate"
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).tagName === 'svg') pick(null);
        }}
      >
        {g && plate && (
          <svg
            className="cortex"
            width={g.w}
            height={g.h}
            data-focus={litPath || litBand ? '' : undefined}
            role="img"
            aria-label={t('Your options as nerves growing from where you are')}
          >
            <defs>
              <clipPath id={`${id}-grow`}>
                <circle cx={g.cx} cy={g.cy} r={reduced ? Math.hypot(g.w, g.h) : g.r[0]}>
                  {!reduced && (
                    <animate
                      attributeName="r"
                      from={g.r[0]}
                      to={Math.hypot(g.w, g.h)}
                      dur="2.2s"
                      fill="freeze"
                      calcMode="spline"
                      keyTimes="0;1"
                      keySplines="0.25 0.6 0.2 1"
                    />
                  )}
                </circle>
              </clipPath>
            </defs>

            {/* The plate's furniture: its title, and registration marks at its corners. */}
            <g className="cortex-furniture" aria-hidden>
              <text x={18} y={26} className="cortex-plate">
                {t('Plate · Ahead').toUpperCase()}
              </text>
              <text x={18} y={40} className="cortex-plate is-sub">
                {t('What could happen from here · not ranked').toUpperCase()}
              </text>
              <path
                d={[
                  [10, 10],
                  [g.w - (wide ? ROOM : 0) - 10, 10],
                  [10, g.h - 10],
                  [g.w - (wide ? ROOM : 0) - 10, g.h - 10],
                ]
                  .map(([x, y]) => `M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}`)
                  .join('')}
                className="cortex-register"
              />
            </g>

            {/* The dome: its bands, the rays out from the brain, the measured rim and the horizon. */}
            <g className="cortex-grid" clipPath={`url(#${id}-grow)`}>
              {BANDS.map((b, i) => (
                <path
                  key={b}
                  d={`${arcD(g, g.r[i], -g.open, g.open)}L${polar(g, g.r[i + 1], g.open).join(' ')}${arcD(g, g.r[i + 1], g.open, -g.open).replace(/^M[^A]+/, '')}Z`}
                  className={cn('cortex-band', i % 2 === 1 && 'is-odd', litBand === b && 'is-lit')}
                />
              ))}
              <path d={plate.grid.rays} className="cortex-rays" />
              {g.r.map((rr, i) => (
                <path key={i} d={arcD(g, rr, -g.open, g.open)} className={cn('cortex-arc', i === 4 && 'is-rim')} />
              ))}
              <path d={plate.grid.ticks} className="cortex-ticks" />
              <path d={`M${g.cx - g.r[4] - 14} ${g.cy}H${g.cx - g.r[0]}M${g.cx + g.r[0]} ${g.cy}H${g.cx + g.r[4] + 14}`} className="cortex-horizon" />
              {BANDS.map((b, i) => {
                const mid = (g.r[i] + g.r[i + 1]) / 2;
                return (
                  <g key={b}>
                    <path d={`M${g.cx - mid} ${g.cy - 4}V${g.cy + 4}M${g.cx + mid} ${g.cy - 4}V${g.cy + 4}`} className="cortex-horizon" />
                    <text x={g.cx + mid} y={g.cy + 16} textAnchor="middle" className="cortex-numeral">
                      {['I', 'II', 'III', 'IV'][i]}
                    </text>
                    <text
                      x={g.cx - mid}
                      y={g.cy + 17}
                      textAnchor="middle"
                      className={cn(named ? 'cortex-band-name' : 'cortex-numeral', litBand === b && 'is-lit')}
                      onPointerEnter={() => setHover({ kind: 'band', band: b })}
                      onPointerLeave={() => setHover(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        pick(sel?.kind === 'band' && sel.band === b ? null : { kind: 'band', band: b });
                      }}
                    >
                      {named ? BAND_LABEL[b]().toUpperCase() : ['I', 'II', 'III', 'IV'][i]}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* The options: a nerve each, its answers branching off it. */}
            <g clipPath={`url(#${id}-grow)`}>
              {plate.trunks.map((tr) => {
                const p = pathById.get(tr.pathId)!;
                const chosen = nav?.pathId === p.id;
                const mine = plate.placed.filter((it) => it.pathId === p.id);
                const on = litPath === p.id;
                return (
                  <g
                    key={p.id}
                    className={cn('cortex-path', chosen && 'is-chosen', on && 'is-on')}
                    onPointerEnter={() => setHover({ kind: 'path', id: p.id })}
                    onPointerLeave={() => setHover(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      pick({ kind: 'path', id: p.id });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick({ kind: 'path', id: p.id });
                      }
                    }}
                    onFocus={() => setHover({ kind: 'path', id: p.id })}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${pathCode(p.code)}: ${p.title}${chosen ? ` · ${t('What you chose')}` : ''}`}
                  >
                    <path d={tr.d} className="cortex-hit" />
                    <path d={tr.d} className="cortex-trunk" />
                    <path d={tr.ticks} className="cortex-trunk-ticks" />
                    <path d={mine.map((m) => m.twig).join('')} className="cortex-twig" />
                    <path d={mine.map((m) => m.fringe).join('')} className="cortex-fringe" />
                    <path d={tr.arbor} className="cortex-arbor" />
                    {!reduced &&
                      (chosen ? [0, 1.2, 2.4] : [(p.code.charCodeAt(0) % 5) * 1.3]).map((b) => (
                        <circle key={b} r={chosen ? 2 : 1.5} className="cortex-pulse">
                          <animateMotion dur={chosen ? '3.6s' : '7s'} begin={`${b}s`} repeatCount="indefinite" path={tr.d} />
                        </circle>
                      ))}
                    {mine.map((it) => (
                      <ItemMark
                        key={it.key}
                        item={it}
                        lit={litItem?.key === it.key || (sel?.kind === 'item' && sel.key === it.key)}
                        focusable={sel?.kind === 'path' && sel.id === p.id}
                        onEnter={() => setHover({ kind: 'item', key: it.key })}
                        onLeave={() => setHover(null)}
                        onPick={() => pick({ kind: 'item', key: it.key })}
                      />
                    ))}
                    {g.compact ? (
                      <g transform={`translate(${tr.label[0].toFixed(1)} ${tr.label[1].toFixed(1)})`}>
                        <circle r={9} className="cortex-letter-disc" />
                        <text y={3.5} textAnchor="middle" className="cortex-letter">
                          {p.code}
                        </text>
                      </g>
                    ) : (
                      (() => {
                        const code = `${pathCode(p.code).toUpperCase()}${chosen ? ` · ${t('What you chose').toUpperCase()}` : ''}`;
                        const title = clip(p.title, 30);
                        const [x, y] = labelAt(tr, Math.max(code.length * 7.6, title.length * 8.4), g.w - (wide ? ROOM : 0), tr.anchor === 'middle' ? -12 : 0);
                        return (
                          <>
                            <text x={x} y={y - 9} textAnchor={tr.anchor} className="cortex-code">
                              {code}
                            </text>
                            <text x={x} y={y + 9} textAnchor={tr.anchor} className="cortex-title">
                              {title}
                            </text>
                          </>
                        );
                      })()
                    )}
                  </g>
                );
              })}
            </g>

            {/* Where you are: the brain, and below it the spine with what holds you and what carries you. */}
            <g
              className={cn('cortex-self', (sel === null || hover?.kind === 'nerve' || sel?.kind === 'nerve') && 'is-lit')}
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
            >
              <path d={plate.brain.stem} className="cortex-stem" />
              <path d={`M${g.cx - 2} ${g.spine[0]}V${g.spine[1]}M${g.cx + 2} ${g.spine[0]}V${g.spine[1]}`} className="cortex-stem" />
              <path
                d={Array.from({ length: Math.max(0, Math.floor((g.spine[1] - g.spine[0]) / 11)) }, (_, k) => {
                  const y = g.spine[0] + 6 + k * 11;
                  return `M${g.cx - 6} ${y}H${g.cx + 6}`;
                }).join('')}
                className="cortex-vertebrae"
              />
              {plate.brain.outline.map((d, i) => (
                <path key={i} d={d} className="cortex-brain" />
              ))}
              {plate.brain.cortex.map((d, i) => (
                <path key={i} d={d} className="cortex-grey" />
              ))}
              <path d={plate.brain.sulci} className="cortex-sulci" />
              <path d={plate.brain.callosum} className="cortex-callosum" />
              {[...plate.brain.ventricles, ...plate.brain.thalami].map((d, i) => (
                <path key={i} d={d} className="cortex-ventricle" />
              ))}
              <path d={plate.brain.fissure} className="cortex-fissure" />
              {/* The roots: each option grows from you, through the brain. */}
              <path
                d={plate.trunks
                  .map((tr) => {
                    const [x, y] = polar(g, brainReach(g, tr.angle) * 0.96, tr.angle);
                    return `M${plate.brain.you[0].toFixed(1)} ${plate.brain.you[1].toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}`;
                  })
                  .join('')}
                className="cortex-roots"
              />
              <circle cx={plate.brain.you[0]} cy={plate.brain.you[1]} r={3.2} className="cortex-you" />
              <circle cx={plate.brain.you[0]} cy={plate.brain.you[1]} r={8} className="cortex-you-ring" />
              {!g.compact && (
                <>
                  <path
                    d={`M${plate.brain.you[0] - 4} ${plate.brain.you[1] + 3}L${g.cx - g.bw * 0.62} ${g.cy + g.bh * 0.78}H${g.cx - g.bw * 1.06}`}
                    className="cortex-leader"
                  />
                  <text x={g.cx - g.bw * 1.06 - 6} y={g.cy + g.bh * 0.78 + 3} textAnchor="end" className="cortex-caption is-you">
                    {t('You are here').toUpperCase()}
                  </text>
                </>
              )}
              {(['constraint', 'asset'] as const).map((side) => {
                const list = plate.nerves.filter((n) => n.side === side);
                if (!list.length) return null;
                return (
                  <text
                    key={side}
                    x={g.cx + (side === 'constraint' ? -14 : 14)}
                    y={g.spine[0] + 6}
                    textAnchor={side === 'constraint' ? 'end' : 'start'}
                    className="cortex-caption"
                  >
                    {(side === 'constraint' ? t('Holds you') : t('Carries you')).toUpperCase()} · {list.length}
                  </text>
                );
              })}
              {plate.nerves.map((n) => (
                <NerveMark
                  key={n.key}
                  nerve={n}
                  lit={litNerve?.key === n.key}
                  onEnter={() => setHover({ kind: 'nerve', key: n.key })}
                  onLeave={() => setHover(null)}
                  onPick={() => pick({ kind: 'nerve', key: n.key })}
                />
              ))}
            </g>

            {/* Counts where a lit option crosses each band, or every option on a lit band. */}
            <g className="cortex-notes" aria-hidden>
              {plate.trunks.flatMap((tr) =>
                BANDS.map((b, i) => {
                  if (g.compact || (!(litPath === tr.pathId && !litItem) && litBand !== b)) return null;
                  const [x, y] = tr.crossings[i];
                  const n = counts(tr.pathId, b);
                  const side = tr.angle < 0 ? -1 : 1;
                  return (
                    <g key={`${tr.pathId}${b}`} transform={`translate(${x + side * 10} ${y})`}>
                      <text textAnchor={side < 0 ? 'end' : 'start'} y={3.5} className="cortex-count">
                        {n ? `${BAND_LABEL[b]().toUpperCase()} ${n}` : `${BAND_LABEL[b]().toUpperCase()} —`}
                      </text>
                    </g>
                  );
                }),
              )}
              {(litItem ?? null) && <Annotation item={litItem!} cx={g.cx} />}
              {litNerve && <NerveNote nerve={litNerve} cx={g.cx} />}
            </g>
          </svg>
        )}
      </div>

      {g?.compact && (
        <div className="ahead-options">
          {paths.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick({ kind: 'path', id: p.id })}
              className={cn('ahead-option', nav?.pathId === p.id && 'is-chosen', sel?.kind === 'path' && sel.id === p.id && 'is-on')}
            >
              <span className="ahead-option-letter">{p.code}</span>
              <span className="truncate">{p.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* The reading panel: what is picked, or where you are. */}
      <aside className="ahead-panel" aria-live="polite">
        {sel?.kind === 'item' && byKey.get(sel.key) ? (
          <ItemPanel
            item={byKey.get(sel.key)!}
            path={pathById.get(byKey.get(sel.key)!.pathId)!}
            onPath={(pid) => pick({ kind: 'path', id: pid })}
            onEditPath={onEditPath}
            onOpen={(ref) => openEntity(ref)}
          />
        ) : sel?.kind === 'path' && pathById.get(sel.id) ? (
          <PathPanel
            path={pathById.get(sel.id)!}
            chosen={nav?.pathId === sel.id}
            since={nav?.pathId === sel.id ? nav.committedAt : undefined}
            counts={(b) => counts(sel.id, b)}
            gaps={(items.get(sel.id) ?? []).filter((i) => i.warn).length}
            confirming={confirm === sel.id}
            busy={busy[`commit:${sel.id}`]}
            hasPlan={Boolean(nav)}
            onConfirm={() => setConfirm(sel.id)}
            onCancel={() => setConfirm(null)}
            onChoose={async () => {
              await commitDirection(sel.id);
              setConfirm(null);
              navigate('navigation');
            }}
            onEdit={() => onEditPath(sel.id)}
            onCompare={onCompare}
          />
        ) : sel?.kind === 'nerve' && nerveByKey.get(sel.key) ? (
          <Section label={nerveByKey.get(sel.key)!.side === 'constraint' ? t('Holds you · a constraint') : t('Carries you · an asset')}>
            <p className="mt-2 text-[14px] leading-snug text-ink">{nerveByKey.get(sel.key)!.text}</p>
            <div className="mt-4 flex gap-1.5">
              <Button size="sm" icon={Pencil} onClick={onEditState}>
                {t('Edit where you are')}
              </Button>
            </div>
          </Section>
        ) : sel?.kind === 'band' ? (
          <BandPanel band={sel.band} paths={paths} counts={counts} onPath={(pid) => pick({ kind: 'path', id: pid })} />
        ) : (
          <Section label={t('You are here')}>
            <p className="display mt-1.5 text-[17px] leading-[1.2] text-ink">{state.position || t('Where are you starting from?')}</p>
            {state.summary && <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{state.summary}</p>}
            {nav && data.paths[nav.pathId] && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="label">{t('What you chose')}</div>
                <button type="button" className="mt-1 text-left text-[13px] text-ink hover:underline" onClick={() => pick({ kind: 'path', id: nav.pathId })}>
                  {pathCode(data.paths[nav.pathId].code)} · {data.paths[nav.pathId].title}
                </button>
                {currentAction(nav) && (
                  <p className="mt-1 text-[12px] text-ink-3">
                    {t('Next step')}: <span className="text-ink-2">{currentAction(nav)!.title}</span>
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {nav && (
                <Button size="sm" variant="primary" icon={ArrowRight} onClick={() => navigate('navigation')}>
                  {t('Open the plan')}
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={Pencil} onClick={onEditState}>
                {t('Edit where you are')}
              </Button>
            </div>
            <p className="mt-4 font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-ink-3 uppercase">
              {t('Point at a nerve to read its option · at a band to compare them · click a mark to open it')}
            </p>
          </Section>
        )}
      </aside>

      {/* The key. */}
      <div className="ahead-key" aria-hidden>
        <div className="label mb-1.5">{t('Key')}</div>
        {!named && (
          <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {BANDS.map((b, i) => (
              <span key={b}>
                {['I', 'II', 'III', 'IV'][i]} {BAND_LABEL[b]()}
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            { cls: 'is-option', label: t('An option') },
            { cls: 'is-chosen', label: t('What you chose') },
          ].map((l) => (
            <div key={l.cls} className="flex items-center gap-2">
              <svg width={14} height={14} viewBox="-7 -7 14 14" className={cn('cortex-key-line shrink-0', l.cls)}>
                <path d="M-7 0H7" />
              </svg>
              <span className="min-w-0 leading-snug">{l.label}</span>
            </div>
          ))}
          {KEY.map((k, i) => (
            <div key={i} className="flex items-center gap-2">
              <svg width={14} height={14} viewBox="-7 -7 14 14" className="cortex-key-glyph shrink-0 overflow-visible">
                <Glyph kind={k.kind} item={k.item} size={0.9} />
              </svg>
              <span className="min-w-0 leading-snug">{k.label()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemMark({
  item,
  lit,
  focusable,
  onEnter,
  onLeave,
  onPick,
}: {
  item: PlacedItem;
  lit: boolean;
  focusable: boolean;
  onEnter(): void;
  onLeave(): void;
  onPick(): void;
}) {
  return (
    <g
      transform={`translate(${item.x.toFixed(1)} ${item.y.toFixed(1)})`}
      className={cn('cortex-mark', lit && 'is-lit', item.warn && 'is-warn')}
      onPointerEnter={(e) => {
        e.stopPropagation();
        onEnter();
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        onLeave();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onPick();
        }
      }}
      tabIndex={focusable ? 0 : -1}
      role="button"
      aria-label={`${KIND_LABEL[item.kind]()}: ${item.text}`}
    >
      <circle r={10} className="cortex-mark-hit" />
      <circle r={9} className="cortex-mark-halo" />
      <Glyph kind={item.kind} item={item} />
    </g>
  );
}

function NerveMark({ nerve, lit, onEnter, onLeave, onPick }: { nerve: Nerve; lit: boolean; onEnter(): void; onLeave(): void; onPick(): void }) {
  const [x, y] = nerve.end;
  return (
    <g
      className={cn('cortex-nerve', nerve.side === 'asset' ? 'is-asset' : 'is-constraint', lit && 'is-lit')}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
    >
      <path d={nerve.d} className="cortex-hit" />
      <path d={nerve.d} className="cortex-nerve-line" />
      {nerve.side === 'constraint' ? (
        <path d={`M${x} ${y - 5}V${y + 5}M${x - 3} ${y}H${x}`} className="cortex-nerve-end" />
      ) : (
        <>
          <circle cx={x} cy={y} r={2.6} className="cortex-nerve-dot" />
          <circle cx={x} cy={y} r={5.2} className="cortex-nerve-end" />
        </>
      )}
    </g>
  );
}

/** A mark's note on the plate: a leader line out from it, its number, kind and words. */
function Annotation({ item, cx }: { item: PlacedItem; cx: number }) {
  const side = item.x >= cx ? 1 : -1;
  const a = (item.angle * Math.PI) / 180;
  const [ex, ey] = [item.x + Math.sin(a) * 16, item.y - Math.cos(a) * 16];
  const tx = ex + side * 14;
  const text = clip(item.text, 54);
  const w = Math.max(text.length * 6.3, 120);
  return (
    <g className="cortex-annotation">
      <path d={`M${item.x} ${item.y}L${ex} ${ey}H${tx}`} className="cortex-leader" />
      <rect x={side > 0 ? tx + 2 : tx - w - 8} y={ey - 22} width={w + 6} height={34} rx={1} className="cortex-annotation-bg" />
      <text x={tx + side * 5} y={ey - 9} textAnchor={side > 0 ? 'start' : 'end'} className="cortex-annotation-meta">
        {item.index} · {KIND_LABEL[item.kind]().toUpperCase()}
        {item.status ? ` · ${item.status.toUpperCase()}` : ''}
      </text>
      <text x={tx + side * 5} y={ey + 6} textAnchor={side > 0 ? 'start' : 'end'} className="cortex-annotation-text">
        {text}
      </text>
    </g>
  );
}

function NerveNote({ nerve, cx }: { nerve: Nerve; cx: number }) {
  const side = nerve.end[0] >= cx ? 1 : -1;
  const [x, y] = nerve.end;
  const text = clip(nerve.text, 44);
  const w = Math.max(text.length * 6.3, 90);
  return (
    <g className="cortex-annotation">
      <rect x={side > 0 ? x + 10 : x - w - 16} y={y - 21} width={w + 6} height={32} rx={1} className="cortex-annotation-bg" />
      <text x={x + side * 13} y={y - 8} textAnchor={side > 0 ? 'start' : 'end'} className="cortex-annotation-meta">
        {(nerve.side === 'constraint' ? t('Holds you') : t('Carries you')).toUpperCase()}
      </text>
      <text x={x + side * 13} y={y + 6} textAnchor={side > 0 ? 'start' : 'end'} className="cortex-annotation-text">
        {text}
      </text>
    </g>
  );
}

function Section({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function ItemPanel({
  item,
  path,
  onPath,
  onEditPath,
  onOpen,
}: {
  item: PlacedItem;
  path: StrategicPath;
  onPath(id: string): void;
  onEditPath(id: string): void;
  onOpen(ref: NonNullable<CortexItem['ref']>): void;
}) {
  return (
    <Section
      label={
        <>
          {item.index} · {BAND_LABEL[item.band]()} · {KIND_LABEL[item.kind]()}
        </>
      }
    >
      <p className="mt-2 text-[14px] leading-snug text-ink">{item.text}</p>
      {item.status && (
        <p className={cn('mt-1.5 font-mono text-[10.5px] tracking-[0.1em] uppercase', item.warn ? 'text-accent' : 'text-ink-3')}>{item.status}</p>
      )}
      <button type="button" className="mt-3 text-left text-[12px] text-ink-3 hover:text-ink" onClick={() => onPath(path.id)}>
        {pathCode(path.code)} · {path.title}
      </button>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {item.ref && (
          <Button size="sm" icon={ArrowRight} onClick={() => onOpen(item.ref!)}>
            {t('Open')}
          </Button>
        )}
        {item.kind === 'idea' && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              const id = adoptExperimentDraft(
                {
                  title: item.text,
                  hypothesis: t('Trying “{idea}” will reduce an unknown in {path}.', { idea: item.text.toLowerCase(), path: pathCode(path.code) }),
                  design: item.text,
                  durationDays: 30,
                  prediction: '',
                  criteria: '',
                  measures: [],
                },
                { pathId: path.id },
              );
              useAtlas.getState().updatePath(path.id, { proposedExperiments: path.proposedExperiments.filter((x) => x !== item.text) });
              useUI.getState().openEntity({ kind: 'experiment', id });
            }}
          >
            {t('Design it')}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEditPath(path.id)}>
          {t('Edit this option')}
        </Button>
      </div>
    </Section>
  );
}

function PathPanel({
  path,
  chosen,
  since,
  counts,
  gaps,
  confirming,
  busy,
  hasPlan,
  onConfirm,
  onCancel,
  onChoose,
  onEdit,
  onCompare,
}: {
  path: StrategicPath;
  chosen: boolean;
  since?: string;
  counts(b: Band): number;
  gaps: number;
  confirming: boolean;
  busy?: boolean;
  hasPlan: boolean;
  onConfirm(): void;
  onCancel(): void;
  onChoose(): void;
  onEdit(): void;
  onCompare(): void;
}) {
  return (
    <Section
      label={
        <span className="flex items-center gap-2">
          {pathCode(path.code)}
          {chosen && since && (
            <span className="rounded-[2px] border border-accent/40 px-1.5 text-accent normal-case tracking-normal">
              {t('What you chose · since {date}', { date: formatDate(since) })}
            </span>
          )}
        </span>
      }
    >
      <h3 className="display mt-1.5 text-[20px] leading-[1.15] text-ink">{path.title}</h3>
      {path.objective && <p className="mt-1.5 text-[13px] leading-snug text-ink">{path.objective}</p>}
      {path.summary && <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{path.summary}</p>}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-3 text-[12.5px]">
        {path.capital && (
          <>
            <dt className="label pt-[2px]">{t('Capital')}</dt>
            <dd className="text-ink-2">{path.capital}</dd>
          </>
        )}
        {path.time && (
          <>
            <dt className="label pt-[2px]">{t('Time')}</dt>
            <dd className="text-ink-2">{path.time}</dd>
          </>
        )}
      </dl>
      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-line pt-3">
        {BANDS.map((b, i) => (
          <div key={b}>
            <div className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3 uppercase">
              {['I', 'II', 'III', 'IV'][i]} {BAND_LABEL[b]()}
            </div>
            <div className="num mt-0.5 text-[17px] text-ink">{counts(b)}</div>
          </div>
        ))}
      </div>
      {gaps > 0 && (
        <p className="mt-2 text-[12px] text-accent">
          {tn(
            gaps,
            'One mark wants attention: a gap, or a reason the exceptions outweigh.',
            '{n} marks want attention: gaps, or reasons the exceptions outweigh.',
          )}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {chosen ? (
          <Button size="sm" variant="primary" icon={ArrowRight} onClick={() => navigate('navigation')}>
            {t('Open my plan')}
          </Button>
        ) : confirming ? (
          <div className="w-full space-y-2">
            <p className="text-[12px] text-ink-2">
              {hasPlan
                ? t('This replaces your current navigation plan with a draft for this path.')
                : t('A draft navigation plan will be created for you to edit.')}
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="primary" loading={busy} onClick={onChoose}>
                {t('Choose {code}', { code: pathCode(path.code) })}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                {t('Cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" icon={Check} onClick={onConfirm}>
            {t('Choose as direction')}
          </Button>
        )}
        {!confirming && (
          <>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>
              {t('Edit')}
            </Button>
            <Button size="sm" variant="ghost" icon={Rows3} onClick={onCompare}>
              {t('Compare in detail')}
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}

function BandPanel({ band, paths, counts, onPath }: { band: Band; paths: StrategicPath[]; counts(id: string, b: Band): number; onPath(id: string): void }) {
  const max = Math.max(1, ...paths.map((p) => counts(p.id, band)));
  return (
    <Section label={`${['I', 'II', 'III', 'IV'][BANDS.indexOf(band)]} · ${BAND_LABEL[band]()}`}>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">
        {{
          needs: () => t('What each option needs: requirements, what it depends on, capital and time.'),
          skills: () => t('The skills each option takes, and where you stand on each.'),
          costs: () => t('What each option risks, trades away and rules out.'),
          unknowns: () => t('What is not known yet: open questions, the reasons it relies on, tests, and repeats in play.'),
        }[band]()}
      </p>
      <ul className="mt-3 space-y-2 border-t border-line pt-3">
        {paths.map((p) => (
          <li key={p.id}>
            <button type="button" className="group w-full text-left" onClick={() => onPath(p.id)}>
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-ink-2 group-hover:text-ink">
                  {pathCode(p.code)} · {p.title}
                </span>
                <span className="num text-ink">{counts(p.id, band)}</span>
              </div>
              <div className="mt-1 h-[2px] bg-ink/[0.08]">
                <div className="h-full bg-ink/60" style={{ width: `${(counts(p.id, band) / max) * 100}%` }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-3">{t('More marks is not better or worse: it is how much there is to read.')}</p>
    </Section>
  );
}
