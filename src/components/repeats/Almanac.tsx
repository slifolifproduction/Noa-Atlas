import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { claimSentence, claimStatus } from '../../domain/claims';
import { AREA_META, REGULARITY_LABEL, STATUS_META } from '../../domain/constants';
import { pathCode, patternCode, resolveSource } from '../../domain/selectors';
import type { ID, Pattern } from '../../domain/types';
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery';
import { useSimple } from '../ui/Detail';
import { t, tn } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatDate, useToday } from '../../lib/dates';
import { forecastRepeat } from '../../ml/forecast';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { almanacOf, polar } from './almanac';
import { pathwaysOf, R, repeatColor, type Dot, type Pathways, type Sector, type Strand } from './pathways';

/** How long each time the repeat being read happened stays lit as they are played back, in order. */
const PLAY_MS = 2400;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** An arc round the ring as SVG path data, read upright: clockwise on the top half, the other way on the bottom. */
function labelArc(from: number, to: number, r: number) {
  const mid = (from + to) / 2;
  const flip = mid > 90 && mid < 270;
  const [a, b] = flip ? [to, from] : [from, to];
  const [x0, y0] = polar(a, r);
  const [x1, y1] = polar(b, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} ${flip ? 0 : 1} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function bandArc(from: number, to: number, r: number) {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** An area's name, cut to what fits along its own stretch of the ring, so neighbours never run into each other. */
function fit(name: string, s: Sector, out: number, size: number) {
  const room = (((s.to - s.from + 4) * Math.PI) / 180) * (R + out);
  // A monospaced letter with its tracking takes about 0.82 of the type size.
  const most = Math.max(3, Math.floor(room / (size * 0.82)));
  return name.length <= most ? name : `${name.slice(0, most - 1).trimEnd()}…`;
}

type Hover = { kind: 'dot'; dot: Dot } | { kind: 'strand'; strand: Strand } | { kind: 'sector'; sector: Sector } | null;

/**
 * One plate of pathways (see pathways.ts) for the repeat being read: the areas round the ring, a dot for every
 * element that took part, a strand for every time. The repeat being read is in its colour and the rest in gray;
 * its strands are drawn in as it is chosen, and each time it happened is played back in turn. Small, the same plate
 * is one of the multiples below, one per repeat.
 */
function Plate({
  pw,
  focus,
  color,
  small,
  playing,
  hover,
  onHover,
  labels,
}: {
  pw: Pathways;
  focus?: ID;
  color: string;
  small?: boolean;
  playing?: string;
  hover?: Hover;
  onHover?(h: Hover, e?: React.PointerEvent): void;
  /** The size area names are set at, in the plate's units (larger on a phone, where the plate is small). */
  labels?: number;
}) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const anchor = focus ? pw.anchors[focus] : undefined;
  const mine = (s: Strand) => s.patternId === focus;
  const involved = useMemo(() => new Set(pw.strands.filter((s) => s.patternId === focus).flatMap((s) => [s.from, s.to])), [pw, focus]);
  const lit = hover?.kind === 'dot' ? hover.dot.id : undefined;
  const touches = (s: Strand) => Boolean(lit && (s.from === lit || s.to === lit));
  const others = pw.strands.filter((s) => !mine(s));
  const own = pw.strands.filter(mine);
  const anchorArea = anchor ? data.nodes[anchor]?.area : undefined;
  const id = `pw${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <g className={cn('pw-plate', small && 'is-small')}>
      {/* The areas round the ring: a band each, the one the repeat starts from thick and in its colour. */}
      {pw.sectors.map((s) => {
        const home = s.area === anchorArea;
        return (
          <g
            key={s.area}
            onPointerEnter={onHover ? (e) => onHover({ kind: 'sector', sector: s }, e) : undefined}
            onPointerLeave={onHover ? () => onHover(null) : undefined}
            onClick={onHover ? () => open({ kind: 'area', id: s.area }) : undefined}
          >
            <path d={bandArc(s.from, s.to, R + 24)} className="pw-band" />
            {home && <path d={bandArc(s.from, s.to, R + 30)} className="pw-band is-home" style={{ stroke: color }} />}
            {!small && <path d={bandArc(s.from, s.to, R + 26)} className="pw-band-hit" />}
            {labels && (
              <>
                <path id={`${id}-${s.area}`} d={labelArc(s.from - 2, s.to + 2, R + (home ? 52 : 46))} fill="none" />
                <text className={cn('pw-area', home && 'is-home')} style={home ? { fill: color } : undefined}>
                  <textPath href={`#${id}-${s.area}`} startOffset="50%" textAnchor="middle">
                    {fit(AREA_META[s.area].label.toUpperCase(), s, home ? 52 : 46, labels)}
                  </textPath>
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* The strands: the other repeats in gray, under; its exceptions in gray; every time it happened in its colour, over. */}
      <g className="pw-strands is-others">
        {others.map((s) => (
          <path key={s.key} d={s.d} className={cn('pw-strand', touches(s) && 'is-touched')} />
        ))}
      </g>
      <g className="pw-strands is-own" key={focus}>
        {own.map((s, i) => (
          <path
            key={s.key}
            d={s.d}
            pathLength={1}
            className={cn('pw-strand', s.exception ? 'is-exception' : 'is-own', s.mark.key === playing && 'is-playing', touches(s) && 'is-touched')}
            style={{ stroke: s.exception ? undefined : color, animationDelay: `${Math.min(1400, i * 9)}ms` }}
          />
        ))}
        {onHover &&
          own.map((s) => (
            <path
              key={`h${s.key}`}
              d={s.d}
              className="pw-strand-hit"
              onPointerEnter={(e) => onHover({ kind: 'strand', strand: s }, e)}
              onPointerMove={(e) => onHover({ kind: 'strand', strand: s }, e)}
              onPointerLeave={() => onHover(null)}
              onClick={() => open(s.mark.source)}
            />
          ))}
      </g>

      {/* The dots: every element that took part, larger the more often; in colour when it is part of this repeat. */}
      {pw.dots.map((d) => {
        const [x, y] = polar(d.angle, R);
        const on = involved.has(d.id);
        const size = small ? d.size * 1.25 : d.size;
        return (
          <g
            key={d.id}
            onPointerEnter={onHover ? (e) => onHover({ kind: 'dot', dot: d }, e) : undefined}
            onPointerLeave={onHover ? () => onHover(null) : undefined}
            onClick={onHover ? () => open({ kind: 'node', id: d.id }) : undefined}
          >
            {d.id === anchor && <circle cx={x} cy={y} r={size + 5} className="pw-anchor" style={{ stroke: color }} />}
            <circle cx={x} cy={y} r={size} className={cn('pw-dot', on && 'is-on', lit === d.id && 'is-lit')} style={on ? { fill: color } : undefined} />
            {onHover && <circle cx={x} cy={y} r={Math.max(9, size + 3)} className="pw-hit" />}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Repeats as pathways (see pathways.ts): where each repeat runs through your life, every time it happened. The
 * repeat you choose is in its colour, its strands drawn in from what sets it off, and each time it happened lights
 * in turn, read out below; every repeat on its own is set out underneath, to compare, as small multiples.
 */
export function Almanac({ patterns, selected, schedule }: { patterns: Pattern[]; selected?: Pattern; schedule: ReactNode }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const today = useToday();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const wide = useIsDesktop();
  const narrow = useMediaQuery('(max-width: 639px)');
  const al = useMemo(() => almanacOf(data, patterns, today), [data, patterns, today]);
  const pw = useMemo(() => pathwaysOf(data, al, patterns), [data, al, patterns]);
  const plateRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<[number, number]>([0, 0]);
  const index = (id?: ID) => patterns.findIndex((p) => p.id === id);
  const color = repeatColor(index(selected?.id));

  // Each time the chosen repeat happened, in order, again and again: its strands light, and it is read out.
  const times = useMemo(() => {
    const ring = al.rings.find((r) => r.patternId === selected?.id);
    return (ring?.marks ?? []).filter((m) => pw.strands.some((s) => s.mark.key === m.key)).sort((a, b) => a.date.localeCompare(b.date));
  }, [al, pw, selected]);
  const [beat, setBeat] = useState(0);
  useEffect(() => setBeat(0), [selected?.id]);
  useEffect(() => {
    if (reduced || !times.length || hover) return;
    const id = setInterval(() => setBeat((b) => b + 1), PLAY_MS);
    return () => clearInterval(id);
  }, [reduced, times.length, hover]);
  const playing = !reduced && times.length ? times[beat % times.length] : undefined;

  const point = (h: Hover, e?: React.PointerEvent) => {
    if (e && plateRef.current) {
      const r = plateRef.current.getBoundingClientRect();
      setTip([e.clientX - r.left, e.clientY - r.top]);
    }
    setHover(h);
  };
  const choose = (id: string) => navigate('patterns', id);

  const claims = selected
    ? selected.explainedBy
        .map((id) => data.claims[id])
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const ring = al.rings.find((r) => r.patternId === selected?.id);
  const happened = ring?.marks.filter((m) => m.stance === 'supports').length ?? 0;
  const exceptions = ring?.marks.filter((m) => m.stance === 'counters').length ?? 0;
  const label = (id: ID) => data.nodes[id]?.label ?? '';
  const simple = useSimple();
  // When it may come next, from the gaps between every time it happened (a forecast: drawn dashed, never a time).
  const forecast = useMemo(() => {
    if (!selected) return undefined;
    const dates = selected.evidence.filter((e) => e.stance === 'supports').flatMap((e) => resolveSource(data, e.source).date ?? []);
    return forecastRepeat(dates, today);
  }, [data, selected, today]);
  const gap = !forecast
    ? ''
    : forecast.usual[0] === forecast.usual[1]
      ? tn(forecast.usual[0], '{n} day', '{n} days')
      : t('{a}–{b} days', { a: forecast.usual[0], b: forecast.usual[1] });

  return (
    <>
      <div className="almanac-stage">
        <div className="almanac-side is-left">
          <div className="tree-block almanac-block" aria-hidden>
            <div className="tree-block-main">
              <div className="tree-block-row is-head">{t('Plate · Repeats').toUpperCase()}</div>
              <div className="tree-block-row is-sub">{t('Pathways · what each repeat runs through').toUpperCase()}</div>
            </div>
          </div>
          <div className="almanac-schedule">{schedule}</div>
          {/* The key: what a colour, a gray, a size and a band mean. */}
          <ul className="pw-key">
            <li>
              <span className="pw-key-line" style={{ background: color }} />
              {t('A time it happened')}
            </li>
            <li>
              <span className="pw-key-line is-exception" />
              {t('A time it did not')}
            </li>
            <li>
              <span className="pw-key-line is-other" />
              {t('Other repeats')}
            </li>
            <li>
              <span className="pw-key-dot" />
              {t('Larger: took part more often')}
            </li>
          </ul>
          <p className="almanac-hint">{t('Point at a dot or a strand to read it · choose a repeat to follow its pathways')}</p>
        </div>

        <div ref={plateRef} className={cn('almanac-plate', hover && 'is-pointing')}>
          <svg
            className="almanac-dial"
            viewBox="-460 -460 920 920"
            role="img"
            aria-label={t('Where each repeat runs through the areas of your life, every time it happened')}
            onPointerLeave={() => setHover(null)}
          >
            <Plate pw={pw} focus={selected?.id} color={color} playing={playing?.key} hover={hover} onHover={point} labels={narrow ? 19 : 13} />
          </svg>

          {/* What is being played back: when, what the note is, and the repeat. */}
          {selected && (
            <div className="pw-readout" aria-live="off">
              <span className="pw-readout-code" style={{ color }}>
                {patternCode(selected.code).toUpperCase()}
              </span>
              <span className="pw-readout-count">
                {tn(happened, '{n} time', '{n} times')}
                {exceptions ? ` · ${tn(exceptions, '{n} exception', '{n} exceptions')}` : ''}
              </span>
              {playing && (
                <button type="button" className="pw-readout-now" onClick={() => open(playing.source)}>
                  {formatDate(playing.date, { year: true })} · {clip(resolveSource(data, playing.source).title, 56)}
                </button>
              )}
            </div>
          )}

          {hover && (
            <div className="almanac-tip" style={{ transform: `translate(${tip[0] + 14}px, ${tip[1] + 14}px)` }}>
              {hover.kind === 'strand' && (
                <>
                  <div className="almanac-tip-meta">
                    {formatDate(hover.strand.mark.date, { year: true }).toUpperCase()} ·{' '}
                    {(hover.strand.exception ? t('an exception') : t('it happened')).toUpperCase()}
                  </div>
                  <div className="almanac-tip-title">{resolveSource(data, hover.strand.mark.source).title}</div>
                  <div className="almanac-tip-sub">
                    {label(hover.strand.from)} → {label(hover.strand.to)}
                  </div>
                </>
              )}
              {hover.kind === 'dot' && (
                <>
                  <div className="almanac-tip-meta">
                    {AREA_META[hover.dot.area].label.toUpperCase()} · {tn(hover.dot.count, '{n} time', '{n} times').toUpperCase()}
                  </div>
                  <div className="almanac-tip-title">{label(hover.dot.id)}</div>
                  <div className="almanac-tip-sub">
                    {hover.dot.repeats
                      .map((pid) => data.patterns[pid])
                      .filter(Boolean)
                      .map((p) => patternCode(p.code))
                      .join(' · ')}
                  </div>
                </>
              )}
              {hover.kind === 'sector' && (
                <>
                  <div className="almanac-tip-meta">{AREA_META[hover.sector.area].label.toUpperCase()}</div>
                  <div className="almanac-tip-title">
                    {tn(pw.dots.filter((d) => d.area === hover.sector.area).length, '{n} element took part', '{n} elements took part')}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Set out beside the plate, as notes on a drawing: what the selected repeat is, why it may happen, what it may
            mean for your options, and your view of it. Its record is below. */}
        {selected && (
          <div className="almanac-side is-right">
            <section className="almanac-note">
              <h3 className="almanac-note-head">{t('What keeps happening')}</h3>
              <p>{clip(selected.observation, wide ? 260 : 400)}</p>
            </section>
            {forecast && !simple && (
              <section className="almanac-note is-forecast">
                <h3 className="almanac-note-head">{t('When it may come next')}</h3>
                <p>
                  {forecast.state === 'irregular'
                    ? t('Its gaps so far vary too much ({gap}) to say when it may come next.', { gap })
                    : forecast.state === 'ahead'
                      ? t('Between {from} and {to}, if it keeps its usual gap of {gap}.', { from: formatDate(forecast.from), to: formatDate(forecast.to), gap })
                      : forecast.state === 'due'
                        ? t('About now: its usual gap of {gap} since {last} has come round.', { gap, last: formatDate(forecast.last) })
                        : t('It has gone longer than its usual gap of {gap} since {last}: it may be fading, or not written down.', {
                            gap,
                            last: formatDate(forecast.last),
                          })}
                </p>
                <span className="almanac-note-meta">{t('A forecast from {n} gaps between times, not a time it happened', { n: forecast.gaps })}</span>
              </section>
            )}
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
            {!simple && (
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
            )}
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

      {/* Every repeat on its own, side by side: the same plate, one repeat in its colour each. */}
      {patterns.length > 1 && (
        <section className="pw-multiples" aria-label={t('Each repeat on its own')}>
          <h2 className="label">{t('Each repeat on its own')}</h2>
          <ul>
            {patterns.map((p, i) => {
              const r = al.rings.find((x) => x.patternId === p.id);
              const n = r?.marks.filter((m) => m.stance === 'supports').length ?? 0;
              return (
                <li key={p.id}>
                  <button type="button" className={cn('pw-multiple', p.id === selected?.id && 'is-selected')} onClick={() => choose(p.id)}>
                    <svg viewBox="-420 -420 840 840" aria-hidden>
                      <Plate pw={pw} focus={p.id} color={repeatColor(i)} small />
                    </svg>
                    <span className="pw-multiple-code" style={{ color: repeatColor(i) }}>
                      {patternCode(p.code).toUpperCase()} · {REGULARITY_LABEL[r?.regularity ?? 'emerging'].toUpperCase()}
                    </span>
                    <span className="pw-multiple-title">{p.title}</span>
                    <span className="pw-multiple-meta">{tn(n, '{n} time', '{n} times')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
