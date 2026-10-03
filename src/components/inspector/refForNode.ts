import { areaHubKey, isAreaHubId, YOU_ID } from '../../domain/constants';
import type { EntityRef, ID } from '../../domain/types';
import { useAtlas } from '../../state/atlasStore';

/** What the panel opens for a node on a graph: you and the area markers open their area, a repeat its pattern. */
export function refForNode(id: ID): EntityRef {
  if (id === YOU_ID) return { kind: 'area', id: 'self' };
  if (isAreaHubId(id)) return { kind: 'area', id: areaHubKey(id) };
  if (useAtlas.getState().data.patterns[id]) return { kind: 'pattern', id };
  return { kind: 'node', id };
}
