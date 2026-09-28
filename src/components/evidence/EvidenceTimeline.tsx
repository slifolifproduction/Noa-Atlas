import { useState } from 'react';
import { resolveSource } from '../../domain/selectors';
import type { Pattern } from '../../domain/types';
import { useElementWidth } from '../../hooks/useElementWidth';
import { addDays, formatDate, formatMonth, parseISODate, todayISO } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';

const SUPPORT = 'var(--color-support)';
const COUNTER = 'var(--color-counter)';

/**
 * When each piece of evidence occurred (two lanes: for and against), and how
 * the derived confidence moved as it accumulated. Two small charts on one
 * shared time axis rather than a dual-axis chart.
 */
export function EvidenceTimeline({ pattern, history }: { pattern: Pattern; history: { date: string; value: number; evidenceId: string }[] }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const points = pattern.evidence
    .map((e) => ({ e, src: resolveSource(data, e.source) }))
    .filter((p) => p.src.date)
    .sort((a, b) => a.src.date!.localeCompare(b.src.date!));
  if (!points.length) return <p className="text-[12.5px] text-ink-3">No dated evidence yet.</p>;

  const start = addDays(points[0].src.date!.slice(0, 8) + '01', -1);
  const end = todayISO();
  const t0 = parseISODate(start).getTime();
  const t1 = Math.max(parseISODate(end).getTime(), t0 + 86_400_000 * 30);
  const padL = 64;
  const padR = 12;
  const x = (d: string) => padL + ((parseISODate(d).getTime() - t0) / (t1 - t0)) * (width - padL - padR);

  const confTop = 8;
  const confH = 56;
  const laneSup = confTop + confH + 26;
  const laneCnt = laneSup + 26;
  const axisY = laneCnt + 20;
  const height = axisY + 18;
  const yConf = (v: number) => confTop + (1 - v) * confH;

  const months: string[] = [];
  const cursor = parseISODate(start);
  cursor.setDate(1);
  while (cursor.getTime() <= t1) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const step = Math.ceil(months.length / Math.max(2, Math.floor((width - padL) / 70)));

  const line = history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${x(h.date).toFixed(1)} ${yConf(h.value).toFixed(1)}`).join(' ');
  const hovered = points.find((p) => p.e.id === hover);
  const last = history[history.length - 1];

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={`Evidence timeline for ${pattern.title}: ${points.length} pieces of evidence`}>
        {/* confidence band */}
        <line x1={padL} x2={width - padR} y1={yConf(0.5)} y2={yConf(0.5)} stroke="rgb(255 255 255 / 0.12)" strokeDasharray="3 4" />
        <text x={padL - 6} y={yConf(0.5) + 3} textAnchor="end" className="fill-ink-3 font-mono text-[9.5px]">50%</text>
        <text x={padL - 6} y={yConf(1) + 7} textAnchor="end" className="fill-ink-3 font-mono text-[9.5px]">100%</text>
        {history.length > 0 && (
          <>
            <path d={`${line} L ${x(end)} ${yConf(last.value)}`} fill="none" stroke="var(--color-ink-2)" strokeWidth="2" strokeLinejoin="round" />
            <circle cx={x(end)} cy={yConf(last.value)} r="3" fill="var(--color-ink)" />
          </>
        )}

        {/* lanes */}
        <text x={0} y={laneSup + 3.5} className="fill-ink-3 font-mono text-[10px] tracking-wider">FOR</text>
        <text x={0} y={laneCnt + 3.5} className="fill-ink-3 font-mono text-[10px] tracking-wider">AGAINST</text>
        <line x1={padL} x2={width - padR} y1={laneSup} y2={laneSup} stroke="rgb(255 255 255 / 0.06)" />
        <line x1={padL} x2={width - padR} y1={laneCnt} y2={laneCnt} stroke="rgb(255 255 255 / 0.06)" />
        {points.map(({ e, src }) => {
          const cx = x(src.date!);
          const cy = e.stance === 'supports' ? laneSup : laneCnt;
          const r = e.weight > 1 ? 6 : 4.5;
          return (
            <g key={e.id} onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)} onClick={() => open({ kind: e.source.kind, id: e.source.id })} className="cursor-pointer">
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
              <line x1={x(m)} x2={x(m)} y1={axisY - 4} y2={axisY} stroke="rgb(255 255 255 / 0.18)" />
              <text x={x(m)} y={axisY + 12} textAnchor="middle" className="fill-ink-3 font-mono text-[10px]">
                {formatMonth(m).split(' ')[0]}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 w-[260px] rounded-[7px] border border-line-strong bg-overlay px-2.5 py-2 shadow-xl"
          style={{ left: Math.min(width - 270, Math.max(0, x(hovered.src.date!) - 130)), top: (hovered.e.stance === 'supports' ? laneSup : laneCnt) + 14 }}
        >
          <div className="num text-[11px] text-ink-3">
            {hovered.src.code} · {formatDate(hovered.src.date)} · {hovered.e.stance === 'supports' ? 'supports' : 'counters'}
            {hovered.e.weight > 1 ? ` · ×${hovered.e.weight}` : ''}
          </div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink">“{hovered.e.excerpt}”</div>
        </div>
      )}
    </div>
  );
}
