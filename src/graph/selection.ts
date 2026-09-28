import { hubId } from '../domain/constants';
import type { AtlasData, EntityRef, GraphLayer, ID } from '../domain/types';

/**
 * The node a graph should highlight: the most recent graph-relevant item in
 * the panel trail. Drilling into an entry keeps the node it came from lit.
 */
export function selectionFor(stack: EntityRef[], layer: GraphLayer, data: AtlasData): ID | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const r = stack[i];
    if (layer === 'orbit') {
      if (r.kind === 'domain') return hubId(r.id as never);
      if (r.kind === 'node' && data.nodes[r.id]?.domain) return r.id;
    } else {
      if (r.kind === 'pattern' && data.patterns[r.id]?.status !== 'dismissed') return r.id;
      if (r.kind === 'node' && data.nodes[r.id]?.category) return r.id;
    }
  }
  return undefined;
}
