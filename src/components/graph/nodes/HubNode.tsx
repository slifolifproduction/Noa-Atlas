import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { hash01, HOP_MS, useMotion, useWave } from '../../../graph/motion';
import { useSpaceNode } from '../../../graph/space';
import type { HubNode } from '../../../graph/types';
import { useLabelScale } from '../../../hooks/useZoom';
import { cn } from '../../../lib/cn';
import { AreaGlyph } from '../AreaGlyph';
import { NodeHandles } from './Handles';
import { tn } from '../../../i18n';

/** Dial spacing in the hub's 0–100 viewBox: a mark every 10°, and the four cardinal marks. */
const DIAL_STEP = (2 * Math.PI * 55.5) / 36;
const DIAL_QUARTER = (2 * Math.PI * 57) / 4;

/**
 * The person at the centre, or an area's marker on the rim of its sector. The
 * outer arc shows how much recent writing touched it. An area with nothing
 * written about it lately is drawn as uncharted: terra incognita.
 */
export const HubNodeView = memo(function HubNodeView({ id, data, selected }: NodeProps<HubNode>) {
  const motion = useMotion();
  const living = motion.living && !motion.reduced;
  const wave = useWave(living, (w) => w.origin === id || w.reached.includes(id));
  const strength = wave ? (wave.origin === id ? 1 : wave.strength) : 0;
  // On phones the system is drawn smaller so it fits the width without crowding.
  const size = data.compact ? (data.center ? 84 : 58) : data.center ? 108 : 78;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const arc = Math.max(0.04, data.activity) * circ;
  const scale = useLabelScale(0.95, 2.2);
  const spaceRef = useSpaceNode(id);
  return (
    <div
      ref={spaceRef}
      className={cn('node-body hub-body group relative', data.center && 'is-center')}
      style={{ width: size, height: size, ['--phase' as string]: `${-(hash01(id) * 9).toFixed(2)}s`, ['--hub-color' as string]: data.color }}
    >
      {/* Breathing halo: a slow, composited opacity cycle on a soft outer ring. */}
      {living && <div className="hub-breath" aria-hidden />}
      <svg className="absolute inset-0 overflow-visible" viewBox="0 0 100 100" aria-hidden>
        {living && (
          <>
            {wave && (
              <circle
                key={wave.at}
                className="hub-ripple"
                cx="50"
                cy="50"
                r="50"
                fill="none"
                stroke={data.color}
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
                style={{ ['--ripple' as string]: String(0.55 * strength), animationDelay: wave.origin === id ? '0ms' : `${HOP_MS}ms` }}
              />
            )}
          </>
        )}
        <circle
          className="hub-ring"
          cx="50"
          cy="50"
          r="49"
          fill="var(--color-surface)"
          stroke={data.color}
          strokeOpacity={selected ? 0.95 : data.matched ? 0.9 : data.quiet ? 0.3 : 0.42}
          strokeWidth="1.25"
          strokeDasharray={data.quiet ? '3 4' : undefined}
          vectorEffect="non-scaling-stroke"
        />
        {/* The dial: a degree scale around the hub, with the four cardinal marks longer. */}
        <circle cx="50" cy="50" r="55.5" fill="none" stroke={data.color} strokeOpacity="0.38" strokeWidth="3" strokeDasharray={`0.55 ${DIAL_STEP - 0.55}`} />
        <circle
          cx="50"
          cy="50"
          r="57"
          fill="none"
          stroke={data.color}
          strokeOpacity="0.7"
          strokeWidth="6"
          strokeDasharray={`0.8 ${DIAL_QUARTER - 0.8}`}
          transform="rotate(-90.5 50 50)"
        />
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(236 232 223 / 0.05)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {data.activityCount > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={data.color}
            strokeOpacity="0.85"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ}`}
            transform="rotate(-90 50 50)"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <AreaGlyph area={data.area} size={Math.round(size * (data.center ? 0.36 : 0.44))} color={data.color} strokeWidth={data.center ? 1.1 : 1.25} />
      </div>
      {data.patternCount > 0 && (
        <span
          className="num absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-line-strong bg-raised px-1 text-[11px] text-ink"
          title={tn(data.patternCount, '{n} active repeat involves this area', '{n} active repeats involve this area')}
        >
          {data.patternCount}
        </span>
      )}
      {/* A leader from the dial to the label, as on a chart. */}
      <span
        className="pointer-events-none absolute left-1/2 w-px"
        style={{ background: data.color, opacity: 0.45, height: 9, ...(data.labelSide === 'bottom' ? { top: size + 4 } : { bottom: size + 4 }) }}
        aria-hidden
      />
      <div
        className="node-label halo pointer-events-none absolute left-1/2 w-max max-w-[170px] -translate-x-1/2 text-center"
        style={
          data.labelSide === 'bottom'
            ? { top: size + 15, transform: `scale(${scale})`, transformOrigin: 'top center' }
            : { bottom: size + 15, transform: `scale(${scale})`, transformOrigin: 'bottom center' }
        }
      >
        {/* The name only: what an area holds is one click away, so the map stays quiet. */}
        <div className="label text-ink!" style={{ letterSpacing: data.compact ? '0.08em' : '0.16em' }}>
          {data.label}
          {data.hiddenCount > 0 && (
            <span
              className="num ml-1.5 tracking-normal text-ink-3"
              title={tn(data.hiddenCount, '{n} more inside: choose the area to open it', '{n} more inside: choose the area to open it')}
            >
              +{data.hiddenCount}
            </span>
          )}
        </div>
      </div>
      <NodeHandles />
    </div>
  );
});
