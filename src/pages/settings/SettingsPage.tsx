import { Download, History, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { checkProxyHealth } from '../../ai/health';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { FieldLabel, Kbd, Segmented } from '../../components/ui/primitives';
import { modelCounts } from '../../domain/selectors';
import { todayISO } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { exportPayload, parseImport, STORAGE_KEYS } from '../../persistence/storage';
import { spaceHealth } from '../../graph/space';
import { toast, useUI, type SpaceMode } from '../../state/uiStore';
import { importWithBackup, restoreVersion } from '../../state/versionOps';
import { t, LANGUAGES, setLang, type Lang, useLang } from '../../i18n';
import { ZonePicker } from '../../components/shell/LocaleControls';
import { AccountPanel } from '../../components/shell/AccountControls';
import { LearnedPanel } from '../../components/shell/LearnedPanel';
import { useAccount } from '../../state/accountStore';
import { Trans } from '../../i18n/Trans';

function Block({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-6 md:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 className="display text-[17px] text-ink">{title}</h2>
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
  const lang = useLang();
  const inAccount = useAccount((s) => s.mode === 'account');
  const claude = useAccount((s) => s.claude);
  const counts = modelCounts(data);
  const bytes = (() => {
    try {
      return (
        (window.localStorage.getItem(useAtlas.persist.getOptions().name ?? STORAGE_KEYS.data)?.length ?? 0) +
        (window.localStorage.getItem(STORAGE_KEYS.ui)?.length ?? 0)
      );
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
      toast(t('Atlas imported. What you had before is saved in Versions.'), {
        tone: 'success',
        action: { label: t('Undo'), run: () => void restoreVersion(saved.id, { backup: false }) },
      });
    } catch {
      toast(t('Could not save a version first, so the import was not applied. Export a copy, then try again.'), { tone: 'warning' });
    }
  };

  return (
    <div className="mx-auto max-w-[920px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        title={t('Settings')}
        description={
          inAccount
            ? t('Your atlas is kept in your claude.ai account and on this device. Nothing else leaves it unless you ask Claude.')
            : t('Everything is stored in this browser. Nothing leaves it unless you switch the analysis provider to Claude.')
        }
      />

      <div className="mt-6">
        <Block title={t('Where your atlas is kept')}>
          <AccountPanel />
        </Block>

        <Block
          title={t('What the Atlas has learned')}
          description={t('Only from you: plain counts it uses to order and suggest, never to decide. Kept with your atlas.')}
        >
          <LearnedPanel />
        </Block>

        <Block
          title={t('Language and time')}
          description={t('The language of the interface, and the clock the atlas keeps. What you write is never translated.')}
        >
          <Segmented<Lang> label={t('Language')} value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.key, label: l.name }))} />
          <div className="mt-5">
            <FieldLabel hint={t('today, note dates, weeks and experiment days follow it')}>{t('Time zone')}</FieldLabel>
            <ZonePicker />
          </div>
        </Block>

        <Block title={t('Profile')}>
          <FieldLabel htmlFor="s-name">{t('Name')}</FieldLabel>
          <input id="s-name" className="field max-w-[320px]" value={data.profile.name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name')} />
        </Block>

        <Block
          title={t('Space')}
          description={t(
            'Orbit and Mind are drawn as a 3D space: nodes sit at different depths and the view turns with your pointer (or the tilt of a phone). Reduced-motion settings on your device always keep it still.',
          )}
        >
          <Segmented<SpaceMode>
            label={t('Depth')}
            value={spaceMode}
            onChange={setSpaceMode}
            options={[
              { value: 'auto', label: t('Automatic'), title: t('Depth on; switches to flat if this device cannot keep motion smooth') },
              { value: 'on', label: t('Always 3D') },
              { value: 'off', label: t('Flat') },
            ]}
          />
          <p className="mt-2 text-[12.5px] leading-snug text-ink-3">
            {spaceMode === 'auto' && spaceHealth.degraded
              ? t('Automatic switched to flat on this device for this visit, to keep motion smooth.')
              : spaceMode === 'off'
                ? t('Flat: stars still drift, the graph itself stays in one plane.')
                : t('Pan, zoom, move the pointer or select a node to see depth.')}
          </p>
        </Block>

        <Block
          title={t('Analysis provider')}
          description={t(
            'Every provider returns the same structured objects: observations, evidence suggestions, pattern candidates, experiment drafts. Nothing is applied without your review.',
          )}
        >
          <div role="radiogroup" aria-label={t('Analysis provider')} className="space-y-2">
            {(
              [
                {
                  id: 'local',
                  title: t('Local heuristics'),
                  body: t('Deterministic, transparent phrase and metadata matching. Runs offline; every suggestion shows the phrases that triggered it.'),
                },
                {
                  id: 'account',
                  title: t('Claude, with your claude.ai account'),
                  body: t(
                    'Inside claude.ai, while you are signed in: the note being read, with element and pattern names, goes to Claude on your own account and usage. It asks you first, and falls back to local heuristics when it cannot.',
                  ),
                },
                {
                  id: 'claude',
                  title: t('Claude, via your proxy'),
                  body: t(
                    'Sends the entry being analysed plus node and pattern names to a server you run (server/claude-proxy.ts), which calls the Claude API with structured outputs. Falls back to local heuristics if unreachable.',
                  ),
                },
              ] as const
            ).map((o) => (
              <label
                key={o.id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-[2px] border px-3.5 py-3',
                  settings.provider === o.id ? 'border-accent/45 bg-accent-dim/40' : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="provider"
                  className="mt-1 accent-[var(--color-accent)]"
                  checked={settings.provider === o.id}
                  disabled={o.id === 'account' && claude !== 'available' && settings.provider !== 'account'}
                  onChange={() => setSettings({ provider: o.id })}
                />
                <span>
                  <span className="block text-[13.5px] text-ink">{o.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{o.body}</span>
                  {o.id === 'account' && claude !== 'available' && (
                    <span className="mt-1 block text-[12px] text-ink-3">
                      {claude === 'checking'
                        ? t('Checking whether Claude can be asked from here…')
                        : t('Not available here: open Cognitive Atlas inside claude.ai while signed in.')}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {settings.provider === 'claude' && (
            <div className="mt-3.5 space-y-2">
              <FieldLabel htmlFor="s-endpoint" hint={t('dev server forwards /api/analysis to localhost:8787')}>
                {t('Proxy endpoint')}
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
                  {t('Test connection')}
                </Button>
              </div>
              {health && <p className={cn('text-[12.5px]', health.ok ? 'text-support' : 'text-counter')}>{health.message}</p>}
              <p className="text-[12px] text-ink-3">
                <Trans
                  text={t('Start it with {command}. The key stays on the server.')}
                  values={{ command: <code className="rounded-[2px] bg-ink/[0.06] px-1 font-mono text-[11.5px]">ANTHROPIC_API_KEY=… npm run proxy</code> }}
                />
              </p>
            </div>
          )}
        </Block>

        <Block
          title={t('Your data')}
          description={t('Stored locally ({size} KB). {records} records, {nodes} points, {patterns} patterns.', {
            size: (bytes / 1024).toFixed(1),
            records: counts.records,
            nodes: counts.nodes,
            patterns: counts.patterns,
          })}
        >
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={exportData}>
              {t('Export JSON')}
            </Button>
            <Button icon={Upload} onClick={() => file.current?.click()}>
              {t('Import JSON')}
            </Button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </div>
          <p className="mt-2 text-[12px] text-ink-3">{t('Importing replaces the atlas in this browser; the current one is saved as a version first.')}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-line p-3.5">
            <div className="min-w-0">
              <div className="text-[13px] text-ink">{t('Versions and starting over')}</div>
              <div className="text-[12px] leading-snug text-ink-3">
                {t(
                  'Save your atlas as a version, go back to an earlier one, or start fresh (empty or with the sample). The current atlas is always saved first.',
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button icon={History} onClick={() => setVersionsOpen(true)}>
                {t('Versions')}
              </Button>
              <Button icon={RotateCcw} onClick={() => setStartFreshOpen(true)}>
                {t('Start fresh…')}
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            icon={RotateCcw}
            className="mt-3"
            onClick={() => (resetLayout('orbit'), resetLayout('network'), toast(t('Graph layouts reset.')))}
          >
            {t('Reset graph layouts')}
          </Button>
        </Block>

        <Block title={t('How the model reasons')}>
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-2">
            <li>
              {t(
                'Four layers are kept apart: what you wrote (the record), what happened (history), what exists (the map), and what is claimed about how it works (understanding). Options and imagined outcomes are possibilities, and never count as evidence.',
              )}
            </li>
            <li>
              {t(
                'Links you declare are true because you say so. Claims that one thing changes another are hypotheses: each starts as proposed and climbs to plausible, supported and tested only with instances, a mechanism, contrast cases and deliberate tests. Counter-cases weaken it.',
              )}
            </li>
            <li>
              {t('There are no percentages, scores, personality types or diagnoses. Your own view of a claim is kept beside its status and never changes it.')}
            </li>
            <li>
              {t(
                'The analysis only proposes. Nothing it suggests reaches the map until you adopt it, and inner states (what you felt, wanted or feared) are only ever yours to declare.',
              )}
            </li>
            <li>
              {t(
                'The Atlas must always be able to show how it knows what it shows: every claim lists its evidence, and every piece of evidence points back to a note.',
              )}
            </li>
          </ul>
        </Block>

        <Block title={t('Keyboard')}>
          <p className="text-[13px] text-ink-2">
            <Trans text={t('Press {key} anywhere for the full list.')} values={{ key: <Kbd>?</Kbd> }} />{' '}
            <button type="button" className="text-accent hover:underline" onClick={() => setShortcutsOpen(true)}>
              {t('Show shortcuts')}
            </button>
          </p>
        </Block>
      </div>
    </div>
  );
}
