import { areaHubId, YOU_ID } from '../domain/constants';
import type { AtlasData, EntityRef, GraphLayer, ID } from '../domain/types';

/**
 * The node a graph should highlight: the most recent graph-relevant item in
 * the panel trail. Drilling into an entry keeps the node it came from lit.
 */
export function selectionFor(stack: EntityRef[], layer: GraphLayer, data: AtlasData): ID | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const r = stack[i];
    if (r.kind === 'node' && data.nodes[r.id]?.adopted) return r.id;
    if (layer === 'orbit') {
      if (r.kind === 'area') return r.id === 'self' ? YOU_ID : areaHubId(r.id as never);
    } else {
      if (r.kind === 'pattern' && data.patterns[r.id] && !data.patterns[r.id]!.setAside) return r.id;
      if (r.kind === 'claim' && data.claims[r.id]) return data.claims[r.id]!.to;
    }
  }
  return undefined;
}
