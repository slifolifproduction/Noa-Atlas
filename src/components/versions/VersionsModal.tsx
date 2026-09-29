import { Download, History, Pencil, RotateCcw, Save, Trash } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDate } from '../../lib/dates';
import { countsOf, deleteVersion, listVersions, MAX_VERSIONS, onVersionsChange, renameVersion, type VersionMeta } from '../../persistence/versions';
import { useAtlas } from '../../state/atlasStore';
import { toast, useUI } from '../../state/uiStore';
import { downloadVersion, restoreVersion, saveCurrentVersion, versionStamp } from '../../state/versionOps';
import { Button, IconButton } from '../ui/Button';
import { Modal } from '../ui/Modal';

/** The saved versions, kept fresh while `active`. */
export function useVersions(active: boolean): VersionMeta[] | null {
  const [list, setList] = useState<VersionMeta[] | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const load = () =>
      listVersions()
        .then((v) => live && setList(v))
        .catch(() => live && setList([]));
    void load();
    const off = onVersionsChange(() => void load());
    return () => {
      live = false;
      off();
    };
  }, [active]);
  return list;
}

const REASON: Record<VersionMeta['reason'], string | null> = {
  manual: null,
  restart: 'Saved automatically before starting fresh',
  import: 'Saved automatically before an import',
  restore: 'Saved automatically before going back to another version',
};

const counts = (c: VersionMeta['counts']) =>
  `${c.records} note${c.records === 1 ? '' : 's'} · ${c.points} point${c.points === 1 ? '' : 's'} · ${c.patterns} pattern${c.patterns === 1 ? '' : 's'}`;
const time = (iso: string) => `${formatDate(iso.slice(0, 10))}, ${new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

/**
 * Save points of the whole atlas. Save one before big changes; go back to any
 * of them later. Going back first saves what you have now, so nothing is lost.
 */
export function VersionsModal() {
  const open = useUI((s) => s.versionsOpen);
  const setOpen = useUI((s) => s.setVersionsOpen);
  const setStartFreshOpen = useUI((s) => s.setStartFreshOpen);
  const data = useAtlas((s) => s.data);
  const versions = useVersions(open);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'restore' | 'delete' } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirm(null);
      setRenaming(null);
    }
  }, [open]);

  const save = async () => {
    setBusy('save');
    try {
      const v = await saveCurrentVersion(name.trim() || `Saved · ${versionStamp()}`);
      setName('');
      toast(`Saved “${v.name}”.`, { tone: 'success' });
    } catch {
      toast('This browser would not store the version. Use Export in Settings to keep a copy.', { tone: 'warning' });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (v: VersionMeta) => {
    setBusy(v.id);
    try {
      const { backup } = await restoreVersion(v.id);
      setOpen(false);
      toast(`Back to “${v.name}”. What you had before is saved as a version too.`, {
        tone: 'success',
        action: backup ? { label: 'Undo', run: () => void restoreVersion(backup.id, { backup: false }) } : undefined,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not restore that version.', { tone: 'warning' });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const now = countsOf(data);
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Versions"
      description="Save points of your whole atlas. Go back to any of them at any time; what you have now is saved first, so nothing is lost."
      width="max-w-[620px]"
      initialFocus="#version-name"
      footer={
        <>
          <Button variant="ghost" icon={RotateCcw} className="mr-auto" onClick={() => setStartFreshOpen(true)}>
            Start fresh…
          </Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </>
      }
    >
      <div className="rounded-[2px] border border-line bg-raised px-3.5 py-3">
        <div className="label">Now</div>
        <div className="mt-0.5 text-[13px] text-ink">
          {data.profile.name || 'Your atlas'} <span className="text-ink-3">· {counts(now)}</span>
        </div>
        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            id="version-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this version (optional), e.g. Before the new job"
            aria-label="Version name"
          />
          <Button type="submit" variant="primary" icon={Save} loading={busy === 'save'} className="shrink-0">
            Save version
          </Button>
        </form>
      </div>

      <div className="mt-5">
        <div className="label mb-2">Saved versions{versions ? ` · ${versions.length}` : ''}</div>
        {versions === null ? (
          <p className="text-[12.5px] text-ink-3">Loading…</p>
        ) : versions.length === 0 ? (
          <div className="flex items-start gap-3 rounded-[2px] border border-dashed border-line px-3.5 py-3">
            <History size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <p className="text-[12.5px] leading-snug text-ink-3">
              No versions yet. Save one before big changes. Starting fresh or importing also saves one for you automatically.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-[2px] border border-line">
            {versions.map((v) => (
              <li key={v.id} className="px-3.5 py-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {renaming?.id === v.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void renameVersion(v.id, renaming.name).then(() => setRenaming(null));
                        }}
                      >
                        <input
                          className="field py-1"
                          value={renaming.name}
                          onChange={(e) => setRenaming({ id: v.id, name: e.target.value })}
                          onBlur={() => void renameVersion(v.id, renaming.name).then(() => setRenaming(null))}
                          autoFocus
                          aria-label="New name"
                        />
                      </form>
                    ) : (
                      <div className="truncate text-[13px] font-medium text-ink">{v.name}</div>
                    )}
                    <div className="mt-0.5 text-[11.5px] text-ink-3">
                      {time(v.createdAt)} · {counts(v.counts)}
                    </div>
                    {REASON[v.reason] && <div className="mt-0.5 text-[11.5px] text-ink-3 italic">{REASON[v.reason]}</div>}
                  </div>
                  {confirm?.id === v.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {confirm.action === 'restore' ? (
                        <Button size="sm" variant="primary" loading={busy === v.id} onClick={() => void restore(v)} autoFocus>
                          Go back to this
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            void deleteVersion(v.id);
                            setConfirm(null);
                          }}
                          autoFocus
                        >
                          Delete version
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button size="sm" icon={RotateCcw} onClick={() => setConfirm({ id: v.id, action: 'restore' })}>
                        Restore
                      </Button>
                      <IconButton icon={Download} size="sm" label="Download this version" onClick={() => void downloadVersion(v.id)} />
                      <IconButton icon={Pencil} size="sm" label="Rename" onClick={() => setRenaming({ id: v.id, name: v.name })} />
                      <IconButton icon={Trash} size="sm" label="Delete this version" onClick={() => setConfirm({ id: v.id, action: 'delete' })} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
          Versions are stored in this browser. The {MAX_VERSIONS} most recent are kept (your own named ones first). Download a version to keep it elsewhere.
        </p>
      </div>
    </Modal>
  );
}
