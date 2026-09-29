import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { AREA_META, KIND_META } from '../../../domain/constants';
import { useSpaceNode } from '../../../graph/space';
import type { ElementCardNode } from '../../../graph/types';
import { t } from '../../../i18n';
import { cn } from '../../../lib/cn';
import { KIND_ICONS } from '../../icons';
import { NodeHandles } from './Handles';
import { NodeRipple } from './NodeRipple';

/**
 * An element in the Connections network: a specimen card with its kind and
 * area in the margin. Dashed: a proposal from the analysis not yet adopted.
 */
export const ElementNodeView = memo(function ElementNodeView({ id, data, selected }: NodeProps<ElementCardNode>) {
  const Icon = KIND_ICONS[data.kind];
  const spaceRef = useSpaceNode(id);
  return (
    <div
      ref={spaceRef}
      className={cn(
        'node-body relative max-w-[228px] rounded-[1px] border bg-surface/95 py-[6px] pr-2.5 pl-3 transition-shadow',
        !data.adopted && 'border-dashed',
        data.status === 'resolved' && 'opacity-60',
      )}
      style={{
        borderColor: selected ? 'var(--color-accent)' : data.inLoop ? '#ece8df99' : data.matched ? `${data.color}cc` : 'rgb(236 232 223 / 0.13)',
        boxShadow: '0 10px 24px -16px rgb(0 0 0 / 0.95)',
      }}
      title={`${KIND_META[data.kind].label} · ${AREA_META[data.area].label}`}
    >
      {/* A specimen tag: its area's colour in the margin, then the thing itself. */}
      <span className="absolute inset-y-[-1px] left-[-1px] w-[2px]" style={{ background: data.color }} aria-hidden />
      <div className="mind-glow" style={{ ['--glow' as string]: data.color }} aria-hidden />
      <NodeRipple id={id} color={data.color} shape="card" />
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] leading-[13px] tracking-[0.12em] uppercase" style={{ color: data.color }}>
        <Icon size={11} strokeWidth={1.8} aria-hidden />
        {KIND_META[data.kind].label}
        {data.concern && (
          <span className="text-ink-3" title={t('An outcome you want explained or changed')}>
            · {t('concern')}
          </span>
        )}
        {!data.adopted && <span className="text-ink-3">· {t('suggested')}</span>}
      </div>
      <div className="mt-[3px] text-[12.5px] leading-[1.38] text-ink">{data.label}</div>
      <NodeHandles />
    </div>
  );
});
