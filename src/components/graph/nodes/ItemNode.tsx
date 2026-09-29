import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { hash01 } from '../../../graph/motion';
import type { ItemNode } from '../../../graph/types';
import { useLabelScale, useZoomLevel } from '../../../hooks/useZoom';
import { cn } from '../../../lib/cn';
import { NodeHandles } from './Handles';
import { NodeRipple } from './NodeRipple';

const ORIGIN = { bottom: 'top center', top: 'bottom center', right: 'left center', left: 'right center' } as const;

const SIDE_CLASS = {
  bottom: 'left-1/2 top-[calc(100%+6px)] -translate-x-1/2 text-center',
  top: 'left-1/2 bottom-[calc(100%+6px)] -translate-x-1/2 text-center',
  right: 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2 text-left',
  left: 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2 text-right',
} as const;

/** A satellite of a domain hub: a goal, a project, a skill, a person. */
export const ItemNodeView = memo(function ItemNodeView({ id, data, selected }: NodeProps<ItemNode>) {
  const phase = hash01(id);
  const zoom = useZoomLevel();
  const scale = useLabelScale(0.85, 1.35);
  // Semantic zoom: satellite labels appear once there is room for them.
  const quiet = zoom < 0.72 && !selected && !data.matched && !data.near;
  const fill = data.mark === 'gap' ? 'transparent' : data.mark === 'developing' ? `linear-gradient(90deg, ${data.color} 50%, transparent 50%)` : data.color;
  return (
    <div className="node-body group relative h-[24px] w-[24px]">
      {/* Micro-orbit: a sub-2px drift of the visual only; the node itself never moves. */}
      <div
        className="sat-drift absolute inset-0"
        style={{
          ['--drift-dur' as string]: `${16 + phase * 10}s`,
          ['--phase' as string]: `${-(phase * 26).toFixed(2)}s`,
          ['--drift-dir' as string]: phase > 0.5 ? 'normal' : 'reverse',
        }}
      >
        <div
          className={cn('sat-core absolute inset-0 rounded-full border bg-surface transition-shadow', data.origin === 'inferred' && 'border-dashed')}
          style={{
            borderColor: data.color,
            boxShadow: selected ? `0 0 12px 1px ${data.color}66` : data.matched ? `0 0 0 3px ${data.color}40` : undefined,
          }}
        />
        <div
          className="absolute inset-[6px] rounded-full"
          style={{ background: fill, border: data.mark === 'gap' ? `1px solid ${data.color}` : undefined, opacity: 0.9 }}
        />
      </div>
      <NodeRipple id={id} color={data.color} shape="circle" />
      <div
        className={cn(
          'node-label pointer-events-none absolute w-max max-w-[150px] text-[12px] leading-[1.3] transition-opacity',
          SIDE_CLASS[data.labelSide],
          selected ? 'text-ink' : 'text-ink-2',
          quiet && 'opacity-0 group-hover:opacity-100',
        )}
        style={{ transform: `scale(${scale})`, transformOrigin: ORIGIN[data.labelSide] }}
      >
        {data.label}
      </div>
      <NodeHandles />
    </div>
  );
});
