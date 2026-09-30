import type { NodeProps } from '@xyflow/react';
import { memo, type CSSProperties } from 'react';
import { KIND_META } from '../../../domain/constants';
import { useSpaceNode } from '../../../graph/space';
import type { ItemNode } from '../../../graph/types';
import { useLabelScale, useZoomLevel } from '../../../hooks/useZoom';
import { t } from '../../../i18n';
import { cn } from '../../../lib/cn';
import { KIND_ICONS } from '../../icons';
import { NodeHandles } from './Handles';
import { NodeRipple } from './NodeRipple';

const ORIGIN = { bottom: 'top center', top: 'bottom center', right: 'left center', left: 'right center' } as const;

const SIDE_CLASS = {
  bottom: 'left-1/2 top-[calc(100%+6px)] -translate-x-1/2 text-center',
  top: 'left-1/2 bottom-[calc(100%+6px)] -translate-x-1/2 text-center',
  right: 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2 text-left',
  left: 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2 text-right',
} as const;

/**
 * An element of the map: a value, a belief, a commitment, a person… Its mark
 * says what kind it is, its colour which area it belongs to, its ring which
 * layer. A second ring marks an outcome of concern; a dashed edge, something
 * the analysis proposed and the person adopted.
 */
export const ItemNodeView = memo(function ItemNodeView({ id, data, selected }: NodeProps<ItemNode>) {
  const zoom = useZoomLevel();
  const scale = useLabelScale(0.85, 1.35);
  // Semantic zoom: labels appear once there is room for them.
  // A few meaningful things keep their name at any zoom.
  const quiet = zoom < 0.72 && !selected && !data.matched && !data.near && !data.salient;
  const Icon = KIND_ICONS[data.kind];
  const faded = data.ended || data.status === 'resolved';
  const spaceRef = useSpaceNode(id);
  return (
    <div
      ref={spaceRef}
      className={cn('node-body group relative h-[26px] w-[26px]', faded && 'opacity-50')}
      style={{ '--node-color': data.color } as CSSProperties}
      data-far={data.far ? '' : undefined}
      title={KIND_META[data.kind].label}
    >
      {/* Elements move in depth with the space engine (graph/space.ts); the body itself is still. */}
      <div className="item-mark absolute inset-0">
        {data.concern && (
          <div
            className="absolute -inset-[5px] rounded-full border"
            style={{ borderColor: data.color, opacity: 0.55 }}
            title={t('An outcome you want explained or changed')}
            aria-hidden
          />
        )}
        <div
          className={cn('sat-core absolute inset-0 rounded-full border bg-surface transition-shadow', data.origin === 'inferred' && 'border-dashed')}
          style={{
            borderColor: data.color,
            borderStyle: data.external ? 'dotted' : undefined,
            boxShadow: selected ? `0 0 12px 1px ${data.color}66` : data.matched ? `0 0 0 3px ${data.color}40` : undefined,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: data.level === 'gap' ? 0.5 : 0.95 }}>
          <Icon size={15} color={data.color} strokeWidth={1.6} aria-hidden />
        </div>
      </div>
      <NodeRipple id={id} color={data.color} shape="circle" />
      {/* On the helix the engine moves the name to the other side while the element is across the axis (data-flip). */}
      <div
        data-side={data.labelSide}
        className={cn(
          'node-label halo pointer-events-none absolute w-max max-w-[130px] text-[12px] leading-[1.3] transition-opacity',
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
