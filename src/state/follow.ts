/**
 * The interface follows the atlas. When something is removed, whatever the
 * interface was holding on to lets go of it in the same moment: the panel's
 * trail, the focus every lens answers about, the cycle highlighted in Causes,
 * and the positions saved for the map. No lens is left pointing at something
 * that is gone.
 */
import { isAreaHubId, YOU_ID } from '../domain/constants';
import { entityExists } from '../domain/entityLabel';
import { loopById } from '../domain/loops';
import type { AtlasData, GraphLayer } from '../domain/types';
import { useAtlas } from './atlasStore';
import { useUI, type UIState } from './uiStore';

export function followAtlas(data: AtlasData) {
  const ui = useUI.getState();
  const patch: Partial<UIState> = {};

  const trail = ui.inspector.filter((ref) => entityExists(data, ref));
  if (trail.length !== ui.inspector.length) patch.inspector = trail;
  if (ui.focus && !entityExists(data, ui.focus)) patch.focus = null;
  if (ui.networkView.loopId && !loopById(data, ui.networkView.loopId)) patch.networkView = { ...ui.networkView, loopId: undefined };
  // Editing a note or decision that was just deleted: the form closes rather than save into nothing.
  if (ui.capture?.edit && !entityExists(data, ui.capture.edit)) patch.capture = null;

  const onMap = (id: string) => id === YOU_ID || isAreaHubId(id) || id in data.nodes;
  let layouts: UIState['layouts'] | undefined;
  for (const layer of Object.keys(ui.layouts) as GraphLayer[]) {
    const positions = ui.layouts[layer].positions;
    const gone = Object.keys(positions).filter((id) => !onMap(id));
    if (!gone.length) continue;
    const kept = Object.fromEntries(Object.entries(positions).filter(([id]) => onMap(id)));
    layouts = { ...(layouts ?? ui.layouts), [layer]: { ...ui.layouts[layer], positions: kept } };
  }
  if (layouts) patch.layouts = layouts;

  if (Object.keys(patch).length) useUI.setState(patch);
}

let following = false;

/** Start once, at launch: check now, then after every change to the atlas. */
export function startFollowingAtlas() {
  if (following) return;
  following = true;
  followAtlas(useAtlas.getState().data);
  useAtlas.subscribe((state, prev) => {
    if (state.data !== prev.data) followAtlas(state.data);
  });
}
