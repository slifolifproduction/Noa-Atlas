import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { CATEGORY_META } from '../../../domain/constants';
import { useSpaceNode } from '../../../graph/space';
import type { MindNode } from '../../../graph/types';
import { cn } from '../../../lib/cn';
import { NodeHandles } from './Handles';
import { NodeRipple } from './NodeRipple';
import { t } from '../../../i18n';

/** A belief, assumption, fear, decision… Dashed borders mark untested or inferred content. */
export const MindNodeView = memo(function MindNodeView({ id, data, selected }: NodeProps<MindNode>) {
  const dashed = data.origin === 'inferred' || data.category === 'assumption';
  const resolved = data.category === 'question' && data.status === 'resolved';
  const spaceRef = useSpaceNode(id);
  return (
    <div
      ref={spaceRef}
      className={cn(
        'node-body relative max-w-[228px] rounded-[1px] border bg-surface/95 py-[6px] pr-2.5 pl-3 transition-shadow',
        dashed && 'border-dashed',
        resolved && 'opacity-60',
      )}
      style={{
        borderColor: selected ? 'var(--color-accent)' : data.matched ? `${data.color}cc` : 'rgb(236 232 223 / 0.13)',
        boxShadow: '0 10px 24px -16px rgb(0 0 0 / 0.95)',
      }}
      title={CATEGORY_META[data.category].label}
    >
      {/* A specimen tag: its kind in the margin colour, then the thought itself. */}
      <span className="absolute inset-y-[-1px] left-[-1px] w-[2px]" style={{ background: data.color }} aria-hidden />
      <div className="mind-glow" style={{ ['--glow' as string]: data.color }} aria-hidden />
      <NodeRipple id={id} color={data.color} shape="card" />
      <div className="flex items-baseline gap-2 font-mono text-[10.5px] leading-[13px] tracking-[0.12em] uppercase" style={{ color: data.color }}>
        {CATEGORY_META[data.category].label}
        {data.origin === 'inferred' && data.confidence !== undefined && (
          <span className="text-ink-3" title={t('Inferred by analysis; confidence in the inference')}>
            ~{Math.round(data.confidence * 100)}%
          </span>
        )}
      </div>
      <div className="mt-[3px] text-[12.5px] leading-[1.38] text-ink">{data.label}</div>
      <NodeHandles />
    </div>
  );
});
