import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { HubNode } from '../../../graph/types';
import { useLabelScale } from '../../../hooks/useZoom';
import { cn } from '../../../lib/cn';
import { DOMAIN_ICONS } from '../../icons';
import { NodeHandles } from './Handles';

/** A life-domain hub. The outer arc shows how much recent writing touched it. */
export const HubNodeView = memo(function HubNodeView({ data, selected }: NodeProps<HubNode>) {
  const Icon = DOMAIN_ICONS[data.key];
  const size = data.center ? 108 : 78;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const arc = Math.max(0.04, data.activity) * circ;
  const scale = useLabelScale(0.95, 2.2);
  return (
    <div className="group relative" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 overflow-visible" viewBox="0 0 100 100" aria-hidden>
        {selected && (
          <circle cx="50" cy="50" r="56" fill="none" stroke="var(--color-accent)" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        <circle
          cx="50"
          cy="50"
          r="49"
          fill="var(--color-surface)"
          stroke={data.color}
          strokeOpacity={selected ? 0.95 : data.matched ? 0.9 : 0.42}
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
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
        <Icon size={data.center ? 26 : 19} strokeWidth={1.6} color={data.color} aria-hidden />
      </div>
      {data.patternCount > 0 && (
        <span
          className="num absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-line-strong bg-raised px-1 text-[10px] text-ink"
          title={`${data.patternCount} active pattern${data.patternCount === 1 ? '' : 's'} involve this domain`}
        >
          {data.patternCount}
        </span>
      )}
      <div
        className="pointer-events-none absolute left-1/2 w-max max-w-[160px] -translate-x-1/2 rounded-[5px] bg-canvas/75 px-1.5 py-0.5 text-center"
        style={
          data.labelSide === 'bottom'
            ? { top: size + 8, transform: `scale(${scale})`, transformOrigin: 'top center' }
            : { bottom: size + 8, transform: `scale(${scale})`, transformOrigin: 'bottom center' }
        }
      >
        <div className="label text-ink!" style={{ letterSpacing: '0.1em' }}>
          {data.label}
          {data.collapsed && data.itemCount > 0 && <span className="text-ink-3"> · +{data.itemCount}</span>}
        </div>
        {data.statement && (!data.compact || selected) && (
          <div className={cn('mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-ink-2', data.center && 'text-[13px] text-ink')}>{data.statement}</div>
        )}
      </div>
      <NodeHandles />
    </div>
  );
});
