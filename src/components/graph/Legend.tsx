import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { RELATION_META } from '../../domain/constants';
import type { RelationType } from '../../domain/types';
import { cn } from '../../lib/cn';

export function RelationSwatch({ relation, width = 28 }: { relation: RelationType; width?: number }) {
  const m = RELATION_META[relation];
  return (
    <svg width={width} height="10" className="shrink-0 overflow-visible" aria-hidden>
      <line x1="1" y1="5" x2={width - (m.arrow ? 4 : 1)} y2="5" stroke={m.color} strokeWidth={m.width + 0.2} strokeDasharray={m.dash} strokeLinecap={relation === 'derived_from' ? 'round' : undefined} />
      {m.arrow && <path d={`M ${width - 7} 1.5 L ${width - 1} 5 L ${width - 7} 8.5`} fill="none" stroke={m.color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Collapsible key for line styles and any other encodings on the canvas. */
export function Legend({ relations, extra, className, defaultOpen = false }: { relations: RelationType[]; extra?: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('pointer-events-auto rounded-[8px] border border-line bg-surface/92 backdrop-blur-sm', open ? 'w-[212px]' : 'w-auto', className)}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2" aria-expanded={open}>
        <span className="label mr-3">Key</span>
        <ChevronDown size={13} className={cn('text-ink-3 transition-transform', !open && '-rotate-90')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-line px-3 pt-2 pb-3">
          {relations.map((r) => (
            <div key={r} className="flex items-center gap-2.5">
              <RelationSwatch relation={r} />
              <span className="text-[12px] text-ink-2">{RELATION_META[r].label}</span>
            </div>
          ))}
          {extra && <div className="space-y-1.5 border-t border-line pt-2">{extra}</div>}
        </div>
      )}
    </div>
  );
}
