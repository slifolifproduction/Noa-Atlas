/**
 * Versions of the atlas, as workflows: save the current atlas, go back to a
 * saved one, start fresh, import. Anything that replaces the atlas saves the
 * current one first, so nothing is ever lost by accident.
 */
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
  return { restored: version, backup };
}

/** Begin a new atlas (empty or the sample), optionally saving the current one first. */
export async function startFresh(opts: { save: boolean; name: string; mode: 'empty' | 'sample'; profileName?: string }) {
  const saved = opts.save ? await saveCurrentVersion(opts.name, 'restart') : undefined;
  if (opts.mode === 'sample') useAtlas.getState().resetToSample();
  else useAtlas.getState().clearAll(opts.profileName?.trim() ?? '');
  afterSwap();
  return saved;
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
