import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { CATEGORY_META } from '../../../domain/constants';
import type { MindNode } from '../../../graph/types';
import { cn } from '../../../lib/cn';
import { CATEGORY_ICONS } from '../../icons';
import { NodeHandles } from './Handles';
import { NodeRipple } from './NodeRipple';

/** A belief, assumption, fear, decision… Dashed borders mark untested or inferred content. */
export const MindNodeView = memo(function MindNodeView({ id, data, selected }: NodeProps<MindNode>) {
  const Icon = CATEGORY_ICONS[data.category];
  const dashed = data.origin === 'inferred' || data.category === 'assumption';
  const resolved = data.category === 'question' && data.status === 'resolved';
  return (
    <div
      className={cn(
        'node-body relative flex max-w-[228px] items-start gap-2 rounded-[7px] border bg-surface px-2.5 py-[7px] transition-shadow',
        dashed && 'border-dashed',
        resolved && 'opacity-60',
      )}
      style={{
        borderColor: selected ? 'var(--color-accent)' : `${data.color}${data.matched ? 'cc' : '66'}`,
        boxShadow: selected ? '0 0 0 3px rgb(125 211 232 / 0.16), 0 8px 24px -12px rgb(0 0 0 / 0.8)' : '0 6px 18px -14px rgb(0 0 0 / 0.9)',
      }}
      title={CATEGORY_META[data.category].label}
    >
      <div className="mind-glow" style={{ ['--glow' as string]: data.color }} aria-hidden />
      <NodeRipple id={id} color={data.color} shape="card" />
      <Icon size={13} strokeWidth={1.8} color={data.color} className="mt-[3px] shrink-0" aria-hidden />
      <span className="text-[12.5px] leading-[1.4] text-ink">{data.label}</span>
      {data.origin === 'inferred' && data.confidence !== undefined && (
        <span className="num mt-[2px] shrink-0 text-[10px] text-ink-3" title="Inferred by analysis; confidence in the inference">
          ~{Math.round(data.confidence * 100)}%
        </span>
      )}
      <NodeHandles />
    </div>
  );
});
