import { useState } from 'react';
import { resolveSource } from '../../domain/selectors';
import type { Evidence } from '../../domain/types';
import { useElementWidth } from '../../hooks/useElementWidth';
import { addDays, formatDate, formatMonth, parseISODate, useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { t } from '../../i18n';

const SUPPORT = 'var(--color-support)';
const COUNTER = 'var(--color-counter)';

/**
 * When each piece of evidence occurred, on two lanes: instances (for) and
 * counter-cases (against). Nothing is scored: the spread over time is what
 * tells an emerging regularity from a recurring or a fading one.
 */
export function EvidenceTimeline({ title, evidence }: { title: string; evidence: Evidence[] }) {
  const today = useToday();
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const points = evidence
    .map((e) => ({ e, src: resolveSource(data, e.source) }))
    .filter((p) => p.src.date)
    .sort((a, b) => a.src.date!.localeCompare(b.src.date!));
  if (!points.length) return <p className="text-[12.5px] text-ink-3">{t('No dated evidence yet.')}</p>;

  const start = addDays(points[0].src.date!.slice(0, 8) + '01', -1);
  const end = today;
  const t0 = parseISODate(start).getTime();
  const t1 = Math.max(parseISODate(end).getTime(), t0 + 86_400_000 * 30);
  const padL = 64;
  const padR = 12;
  const x = (d: string) => padL + ((parseISODate(d).getTime() - t0) / (t1 - t0)) * (width - padL - padR);

  const laneSup = 14;
  const laneCnt = laneSup + 26;
  const axisY = laneCnt + 20;
  const height = axisY + 18;

  const months: string[] = [];
  const cursor = parseISODate(start);
  cursor.setUTCDate(1);
  while (cursor.getTime() <= t1) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const step = Math.ceil(months.length / Math.max(2, Math.floor((width - padL) / 70)));

  const hovered = points.find((p) => p.e.id === hover);

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={t('Evidence timeline for {title}: {n} pieces of evidence', { title, n: points.length })}>
        {/* lanes */}
        <text x={0} y={laneSup + 3.5} className="fill-ink-3 font-mono text-[11px] tracking-wider">
          {t('FOR')}
        </text>
        <text x={0} y={laneCnt + 3.5} className="fill-ink-3 font-mono text-[11px] tracking-wider">
          {t('AGAINST')}
        </text>
        <line x1={padL} x2={width - padR} y1={laneSup} y2={laneSup} stroke="rgb(236 232 223 / 0.06)" />
        <line x1={padL} x2={width - padR} y1={laneCnt} y2={laneCnt} stroke="rgb(236 232 223 / 0.06)" />
        {points.map(({ e, src }) => {
          const cx = x(src.date!);
          const cy = e.stance === 'supports' ? laneSup : laneCnt;
          const r = e.kind === 'intervention' ? 6 : 4.5;
          return (
            <g
              key={e.id}
              onMouseEnter={() => setHover(e.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => open({ kind: e.source.kind, id: e.source.id })}
              className="cursor-pointer"
            >
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={e.stance === 'supports' ? SUPPORT : 'var(--color-canvas)'}
                stroke={e.stance === 'supports' ? 'var(--color-canvas)' : COUNTER}
                strokeWidth={e.stance === 'supports' ? 2 : 1.75}
              />
              {hover === e.id && <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke="var(--color-ink)" strokeWidth="1" />}
            </g>
          );
        })}

        {/* axis */}
        {months.map((m, i) =>
          i % step === 0 ? (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={axisY - 4} y2={axisY} stroke="rgb(236 232 223 / 0.18)" />
              <text x={x(m)} y={axisY + 12} textAnchor="middle" className="fill-ink-3 font-mono text-[11px]">
                {formatMonth(m).split(' ')[0]}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 w-[260px] rounded-[2px] border border-line-strong bg-overlay px-2.5 py-2 shadow-xl"
          style={{ left: Math.min(width - 270, Math.max(0, x(hovered.src.date!) - 130)), top: (hovered.e.stance === 'supports' ? laneSup : laneCnt) + 14 }}
        >
          <div className="num text-[11px] text-ink-3">
            {hovered.src.code} · {formatDate(hovered.src.date)} · {hovered.e.stance === 'supports' ? t('supports') : t('counters')}
          </div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink">“{hovered.e.excerpt}”</div>
        </div>
      )}
    </div>
  );
}
