import { Trash } from 'lucide-react';
import { useEffect } from 'react';
import { RELATION_META, SEMANTIC_RELATIONS } from '../../domain/constants';
import { displayNode } from '../../domain/selectors';
import type { RelationType } from '../../domain/types';
import type { SemanticEdge } from '../../graph/types';
import { useAtlas } from '../../state/atlasStore';
import { Button } from '../ui/Button';
import { RelationSwatch } from './Legend';

/** Inspect or edit one relationship. Structural and derived links are read-only. */
export function EdgePopover({ edgeId, x, y, edges, onClose }: { edgeId: string; x: number; y: number; edges: SemanticEdge[]; onClose(): void }) {
  const data = useAtlas((s) => s.data);
  const updateEdge = useAtlas((s) => s.updateEdge);
  const deleteEdge = useAtlas((s) => s.deleteEdge);
  const e = edges.find((x) => x.id === edgeId);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!e?.data) return null;
  const a = displayNode(data, e.source);
  const b = displayNode(data, e.target);
  const meta = RELATION_META[e.data.relation];
  return (
    <div
      role="dialog"
      aria-label="Relationship"
      className="absolute z-20 w-[300px] animate-rise rounded-[9px] border border-line-strong bg-overlay p-3 shadow-2xl"
      style={{ left: Math.max(12, x + 10), top: Math.max(12, y - 10) }}
    >
      <div className="flex items-center gap-2">
        <RelationSwatch relation={e.data.relation} />
        <span className="label">{meta.label}</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink">
        {a?.label} <span className="text-ink-3">{meta.verb}</span> {b?.label}
      </p>
      {e.data.note && <p className="mt-1.5 text-[12px] text-ink-2">{e.data.note}</p>}
      {e.data.stored ? (
        <>
          <label className="mt-3 block">
            <span className="label">Relationship</span>
            <select className="field mt-1" value={e.data.relation} onChange={(ev) => updateEdge(edgeId, { relation: ev.target.value as RelationType })}>
              {SEMANTIC_RELATIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex justify-between">
            <Button size="sm" variant="danger" icon={Trash} onClick={() => (deleteEdge(edgeId), onClose())}>
              Remove link
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[12px] text-ink-3">
          {e.data.relation === 'part_of'
            ? 'Structural link: this node belongs to the domain.'
            : 'Derived link: the pattern rests on this node. Edit it from the pattern.'}
        </p>
      )}
    </div>
  );
}
