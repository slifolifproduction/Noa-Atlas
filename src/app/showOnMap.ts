import type { EntityRef, GraphLayer, ID } from '../domain/types';
import { useUI } from '../state/uiStore';
import { navigate, parseHash } from './router';

/**
 * Open something in the panel, switch to the graph that shows it, and centre
 * the graph on it. The single place that coordinates routing and graph focus.
 */
export function showOnMap(layer: GraphLayer, focusId: ID, ref?: EntityRef) {
  const onGraph = parseHash(window.location.hash).key === layer;
  const ui = useUI.getState();
  if (ref) ui.openEntity(ref);
  if (!onGraph) navigate(layer);
  // A newly mounted canvas needs a moment to lay out before it can centre.
  setTimeout(() => useUI.getState().requestFocus(layer, focusId), onGraph ? 0 : 150);
}

/** Open a record in the panel on the page that lists it. */
export function openOn(route: Parameters<typeof navigate>[0], ref: EntityRef) {
  navigate(route);
  useUI.getState().openEntity(ref);
}
