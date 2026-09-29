import { useEffect, useRef } from 'react';
import { SEMANTIC_RELATIONS } from '../../domain/constants';
import { displayNode } from '../../domain/selectors';
import type { ID, RelationType } from '../../domain/types';
import type { AtlasFlowNode } from '../../graph/types';
import { useAtlas } from '../../state/atlasStore';
import { toast } from '../../state/uiStore';
import { RelationSwatch } from './Legend';

/** Shown after dragging a connection: the user names the relationship. */
export function RelationPicker({
  x,
  y,
  sourceId,
  targetId,
  onClose,
}: {
  x: number;
  y: number;
  source?: AtlasFlowNode;
  target?: AtlasFlowNode;
  sourceId: ID;
  targetId: ID;
  onClose(): void;
}) {
  const data = useAtlas((s) => s.data);
  const addEdge = useAtlas((s) => s.addEdge);
  const ref = useRef<HTMLDivElement>(null);
  const a = displayNode(data, sourceId);
  const b = displayNode(data, targetId);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (relation: RelationType) => {
    addEdge(sourceId, targetId, relation);
    toast(`Connected: ${a?.label} ${SEMANTIC_RELATIONS.find((r) => r.key === relation)?.verb} ${b?.label}.`, { tone: 'success' });
    onClose();
  };

  const left = Math.max(12, Math.min(x + 12, (ref.current?.parentElement?.clientWidth ?? 9999) - 300));
  const top = Math.max(12, Math.min(y - 20, (ref.current?.parentElement?.clientHeight ?? 9999) - 380));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Choose a relationship"
      className="absolute z-20 w-[284px] animate-rise rounded-[2px] border border-line-strong bg-overlay p-1.5 shadow-2xl"
      style={{ left, top }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }}
    >
      <div className="px-2 pt-1 pb-2 text-[12px] leading-snug text-ink-2">
        <span className="text-ink">{a?.label}</span> → <span className="text-ink">{b?.label}</span>
      </div>
      {SEMANTIC_RELATIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => pick(r.key)}
          className="flex w-full items-center gap-2.5 rounded-[2px] px-2 py-1.5 text-left hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05] focus-visible:outline-none"
        >
          <RelationSwatch relation={r.key} />
          <span className="min-w-0">
            <span className="block text-[12.5px] text-ink">{r.label}</span>
            <span className="block text-[11px] text-ink-3">{r.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
