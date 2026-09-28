import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { PATTERN_COLOR } from '../../../domain/constants';
import type { PatternNode } from '../../../graph/types';
import { pad2 } from '../../../lib/text';
import { PatternIcon } from '../../icons';
import { NodeHandles } from './Handles';

const CLIP = 'polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%)';

/** A detected pattern, derived from evidence. Its links show which nodes it rests on. */
export const PatternNodeView = memo(function PatternNodeView({ data, selected }: NodeProps<PatternNode>) {
  const pct = Math.round(data.confidence * 100);
  return (
    <div className="relative" style={{ filter: selected ? 'drop-shadow(0 0 6px rgb(125 211 232 / 0.35))' : undefined }}>
      <div className="p-px" style={{ clipPath: CLIP, background: selected ? 'var(--color-accent)' : `${PATTERN_COLOR}55` }}>
        <div className="max-w-[250px] bg-raised px-5 py-2" style={{ clipPath: CLIP }}>
          <div className="flex items-center gap-1.5">
            <PatternIcon size={11} strokeWidth={2} className="text-ink-2" aria-hidden />
            <span className="label text-ink-2!">Pattern {pad2(data.code)}</span>
            <span className="num ml-auto pl-3 text-[10px] text-ink-2">{pct}%</span>
          </div>
          <div className="mt-0.5 text-[12px] leading-[1.35] text-ink">{data.title}</div>
          <div className="mt-1.5 h-[2px] w-full rounded-full bg-white/8">
            <div className="h-full rounded-full bg-ink-2" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <NodeHandles />
    </div>
  );
});
