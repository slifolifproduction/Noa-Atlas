/**
 * Versions of the atlas, as workflows: save the current atlas, go back to a
 * saved one, start fresh, import. Anything that replaces the atlas saves the
 * current one first, so nothing is ever lost by accident.
 */
import type { ExampleKey } from '../data/examples';
import { isExampleAtlas } from '../data/seed';
import type { AtlasData } from '../domain/types';
import { formatDate, formatTime, todayISO } from '../lib/dates';
import { toCurrentShape } from '../persistence/migrate';
import { exportPayload } from '../persistence/storage';
import { getVersion, putVersion, type SavedLayouts, type VersionMeta, type VersionReason } from '../persistence/versions';
import { useAtlas } from './atlasStore';
import { useUI } from './uiStore';
import { t } from '../i18n';

/** A short, readable timestamp for automatic version names. */
export const versionStamp = (d = new Date()) => `${formatDate(todayISO(d), { year: true })}, ${formatTime(d)}`;

export function saveCurrentVersion(name: string, reason: VersionReason = 'manual'): Promise<VersionMeta> {
  const { layouts } = useUI.getState();
  return putVersion({
    name,
    reason,
    data: useAtlas.getState().data,
    layouts: { orbit: { positions: layouts.orbit.positions }, network: { positions: layouts.network.positions } },
  });
}

/** After the atlas is replaced: close the panel and use the new atlas's own arrangement. */
function afterSwap(layouts?: SavedLayouts) {
  useUI.getState().closeInspector();
  useUI.setState({
    layouts: { orbit: { positions: layouts?.orbit?.positions ?? {} }, network: { positions: layouts?.network?.positions ?? {} } },
  });
}

/** Go back to a saved version. By default the current atlas is saved first. */
export async function restoreVersion(id: string, opts: { backup?: boolean } = {}) {
  const version = await getVersion(id);
  if (!version) throw new Error(t('That version no longer exists.'));
  const backup = opts.backup === false ? undefined : await saveCurrentVersion(t('Before restoring “{name}”', { name: version.name }), 'restore');
  // Versions saved before the layered model are converted when restored.
  useAtlas.getState().replaceData(toCurrentShape(structuredClone(version.data)));
  afterSwap(version.layouts);
  // Back in an atlas of the person's own, there is nothing to go back to.
  if (!isExampleAtlas(useAtlas.getState().data)) useUI.getState().setReturnVersion(undefined);
  return { restored: version, backup };
}

/**
 * Begin a new atlas (empty or one of the examples), optionally saving the current one
 * first. Opening the example from the person's own atlas remembers that
 * saved version as the way back; leaving the example for an atlas of their
 * own lets go of it.
 */
export async function startFresh(opts: { save: boolean; name: string; mode: 'empty' | 'sample'; profileName?: string; example?: ExampleKey }) {
  const wasExample = isExampleAtlas(useAtlas.getState().data);
  const saved = opts.save ? await saveCurrentVersion(opts.name, 'restart') : undefined;
  if (opts.mode === 'sample') useAtlas.getState().resetToSample(opts.example);
  else useAtlas.getState().clearAll(opts.profileName?.trim() ?? '');
  afterSwap();
  if (opts.mode === 'sample' && !wasExample && saved) useUI.getState().setReturnVersion(saved.id);
  else if (opts.mode === 'empty') useUI.getState().setReturnVersion(undefined);
  return saved;
}

/** Leave the example and go back to the person's own atlas, saved when they opened it. */
export async function backToMyAtlas() {
  const id = useUI.getState().returnVersionId;
  if (!id) throw new Error(t('That version no longer exists.'));
  const result = await restoreVersion(id);
  useUI.getState().setReturnVersion(undefined);
  return result;
}

/** Replace the atlas with an imported one; the current atlas is saved as a version first. */
export async function importWithBackup(data: AtlasData) {
  const saved = await saveCurrentVersion(t('Before import · {when}', { when: versionStamp() }), 'import');
  useAtlas.getState().replaceData(data);
  afterSwap();
  return saved;
}

/** Download a saved version as a JSON file (the same format as Export). */
export async function downloadVersion(id: string) {
  const version = await getVersion(id);
  if (!version) return;
  const blob = new Blob([exportPayload(version.data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cognitive-atlas-${
    version.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'version'
  }.json`;
  a.click();
  URL.revokeObjectURL(url);
}
