import { Download, History, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { checkProxyHealth } from '../../ai/health';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { FieldLabel, Kbd, Segmented } from '../../components/ui/primitives';
import { CONFIDENCE_EXPLAINER } from '../../domain/confidence';
import { modelCounts } from '../../domain/selectors';
import { todayISO } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { exportPayload, parseImport, STORAGE_KEYS } from '../../persistence/storage';
import { spaceHealth } from '../../graph/space';
import { toast, useUI, type SpaceMode } from '../../state/uiStore';
import { importWithBackup, restoreVersion } from '../../state/versionOps';

function Block({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-6 md:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[14px] font-medium text-ink">{title}</h2>
        {description && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const data = useAtlas((s) => s.data);
  const setName = useAtlas((s) => s.setProfileName);
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  const resetLayout = useUI((s) => s.resetLayout);
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen);
  const spaceMode = useUI((s) => s.spaceMode);
  const setSpaceMode = useUI((s) => s.setSpaceMode);
  const setVersionsOpen = useUI((s) => s.setVersionsOpen);
  const setStartFreshOpen = useUI((s) => s.setStartFreshOpen);
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const counts = modelCounts(data);
  const bytes = (() => {
    try {
      return (window.localStorage.getItem(STORAGE_KEYS.data)?.length ?? 0) + (window.localStorage.getItem(STORAGE_KEYS.ui)?.length ?? 0);
    } catch {
      return 0;
    }
  })();

  const exportData = () => {
    const blob = new Blob([exportPayload(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cognitive-atlas-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (f: File) => {
    const result = parseImport(await f.text());
    if ('error' in result) {
      toast(result.error, { tone: 'warning' });
      return;
    }
    try {
      const saved = await importWithBackup(result.data);
      toast('Atlas imported. What you had before is saved in Versions.', {
        tone: 'success',
        action: { label: 'Undo', run: () => void restoreVersion(saved.id, { backup: false }) },
      });
    } catch {
      toast('Could not save a version first, so the import was not applied. Export a copy, then try again.', { tone: 'warning' });
    }
  };

  return (
    <div className="mx-auto max-w-[920px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Everything is stored in this browser. Nothing leaves it unless you switch the analysis provider to Claude."
      />

      <div className="mt-6">
        <Block title="Profile">
          <FieldLabel htmlFor="s-name">Name</FieldLabel>
          <input id="s-name" className="field max-w-[320px]" value={data.profile.name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </Block>

        <Block
          title="Space"
          description="Orbit and Mind are drawn as a 3D space: nodes sit at different depths and the view turns with your pointer (or the tilt of a phone). Reduced-motion settings on your device always keep it still."
        >
          <Segmented<SpaceMode>
            label="Depth"
            value={spaceMode}
            onChange={setSpaceMode}
            options={[
              { value: 'auto', label: 'Automatic', title: 'Depth on; switches to flat if this device cannot keep motion smooth' },
              { value: 'on', label: 'Always 3D' },
              { value: 'off', label: 'Flat' },
            ]}
          />
          <p className="mt-2 text-[12.5px] leading-snug text-ink-3">
            {spaceMode === 'auto' && spaceHealth.degraded
              ? 'Automatic switched to flat on this device for this visit, to keep motion smooth.'
              : spaceMode === 'off'
                ? 'Flat: stars still drift, the graph itself stays in one plane.'
                : 'Pan, zoom, move the pointer or select a node to see depth.'}
          </p>
        </Block>

        <Block
          title="Analysis provider"
          description="Every provider returns the same structured objects: observations, evidence suggestions, pattern candidates, experiment drafts. Nothing is applied without your review."
        >
          <div role="radiogroup" aria-label="Analysis provider" className="space-y-2">
            {(
              [
                {
                  id: 'local',
                  title: 'Local heuristics',
                  body: 'Deterministic, transparent phrase and metadata matching. Runs offline; every suggestion shows the phrases that triggered it.',
                },
                {
                  id: 'claude',
                  title: 'Claude, via your proxy',
                  body: 'Sends the entry being analysed plus node and pattern names to a server you run (server/claude-proxy.ts), which calls the Claude API with structured outputs. Falls back to local heuristics if unreachable.',
                },
              ] as const
            ).map((o) => (
              <label
                key={o.id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-[8px] border px-3.5 py-3',
                  settings.provider === o.id ? 'border-accent/45 bg-accent-dim/40' : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="provider"
                  className="mt-1 accent-[var(--color-accent)]"
                  checked={settings.provider === o.id}
                  onChange={() => setSettings({ provider: o.id })}
                />
                <span>
                  <span className="block text-[13.5px] text-ink">{o.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{o.body}</span>
                </span>
              </label>
            ))}
          </div>
          {settings.provider === 'claude' && (
            <div className="mt-3.5 space-y-2">
              <FieldLabel htmlFor="s-endpoint" hint="dev server forwards /api/analysis to localhost:8787">
                Proxy endpoint
              </FieldLabel>
              <div className="flex flex-wrap gap-2">
                <input
                  id="s-endpoint"
                  className="field num max-w-[360px]"
                  value={settings.endpoint}
                  onChange={(e) => setSettings({ endpoint: e.target.value })}
                />
                <Button
                  loading={checking}
                  onClick={async () => {
                    setChecking(true);
                    setHealth(await checkProxyHealth(settings.endpoint));
                    setChecking(false);
                  }}
                >
                  Test connection
                </Button>
              </div>
              {health && <p className={cn('text-[12.5px]', health.ok ? 'text-support' : 'text-counter')}>{health.message}</p>}
              <p className="text-[12px] text-ink-3">
                Start it with <code className="rounded bg-white/[0.06] px-1 font-mono text-[11.5px]">ANTHROPIC_API_KEY=… npm run proxy</code>. The key stays on
                the server.
              </p>
            </div>
          )}
        </Block>

        <Block
          title="Your data"
          description={`Stored locally (${(bytes / 1024).toFixed(1)} KB). ${counts.records} records, ${counts.nodes} nodes, ${counts.patterns} patterns.`}
        >
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={exportData}>
              Export JSON
            </Button>
            <Button icon={Upload} onClick={() => file.current?.click()}>
              Import JSON
            </Button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Importing replaces the atlas in this browser; the current one is saved as a version first.</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-line p-3.5">
            <div className="min-w-0">
              <div className="text-[13px] text-ink">Versions and starting over</div>
              <div className="text-[12px] leading-snug text-ink-3">
                Save your atlas as a version, go back to an earlier one, or start fresh (empty or with the sample). The current atlas is always saved first.
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button icon={History} onClick={() => setVersionsOpen(true)}>
                Versions
              </Button>
              <Button icon={RotateCcw} onClick={() => setStartFreshOpen(true)}>
                Start fresh…
              </Button>
            </div>
          </div>
          <Button variant="ghost" icon={RotateCcw} className="mt-3" onClick={() => (resetLayout('orbit'), resetLayout('mind'), toast('Graph layouts reset.'))}>
            Reset graph layouts
          </Button>
        </Block>

        <Block title="How the model reasons">
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-2">
            <li>Records become evidence only when you link them or accept a suggestion. Every pattern shows the exact passages it rests on.</li>
            <li>{CONFIDENCE_EXPLAINER}</li>
            <li>Interpretations are offered as possibilities with a separate model estimate. There are no personality types, scores or diagnoses.</li>
            <li>Paths are compared, never ranked. Experiments test claims, and their results update the patterns they were designed to test.</li>
          </ul>
        </Block>

        <Block title="Keyboard">
          <p className="text-[13px] text-ink-2">
            Press <Kbd>?</Kbd> anywhere for the full list.{' '}
            <button type="button" className="text-accent hover:underline" onClick={() => setShortcutsOpen(true)}>
              Show shortcuts
            </button>
          </p>
        </Block>
      </div>
    </div>
  );
}
