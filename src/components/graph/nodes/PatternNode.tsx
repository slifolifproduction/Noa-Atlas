import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { PATTERN_COLOR } from '../../../domain/constants';
import { useSpaceNode } from '../../../graph/space';
import type { PatternNode } from '../../../graph/types';
import { pad2 } from '../../../lib/text';
import { PatternIcon } from '../../icons';
import { NodeHandles } from './Handles';
import { NodeRipple } from './NodeRipple';
import { t } from '../../../i18n';

const CLIP = 'polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%)';

/** A detected pattern, derived from evidence. Its links show which nodes it rests on. */
export const PatternNodeView = memo(function PatternNodeView({ id, data, selected }: NodeProps<PatternNode>) {
  const pct = Math.round(data.confidence * 100);
  const spaceRef = useSpaceNode(id);
  return (
    <div ref={spaceRef} className="node-body pattern-body relative" style={{ filter: selected ? 'drop-shadow(0 0 8px rgb(255 90 31 / 0.3))' : undefined }}>
      <div className="p-px" style={{ clipPath: CLIP, background: selected ? 'var(--color-accent)' : 'rgb(236 232 223 / 0.3)' }}>
        <div className="max-w-[250px] bg-canvas px-5 py-2" style={{ clipPath: CLIP }}>
          <div className="flex items-center gap-1.5">
            <PatternIcon size={11} strokeWidth={2} className="text-ink-2" aria-hidden />
            <span className="label text-ink-2!">{t('Pattern {code}', { code: pad2(data.code) })}</span>
            <span className="num ml-auto pl-3 text-[11px] text-ink-2">{pct}%</span>
          </div>
          <div className="display mt-1 text-[14px] leading-[1.2] text-ink">{data.title}</div>
          <div className="mt-2 h-px w-full bg-ink/10">
            <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <NodeRipple id={id} color={PATTERN_COLOR} shape="card" />
      <NodeHandles />
    </div>
  );
});
