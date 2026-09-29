import {
  ArrowRight,
  CornerDownLeft,
  FlaskConical,
  History,
  Keyboard,
  LifeBuoy,
  Plus,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Split,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { navigate } from '../../app/router';
import { openOn, showOnMap } from '../../app/showOnMap';
import { CATEGORY_META, DOMAIN_META, DOMAINS, groupOf, hubId, VIEWS, type ViewKey } from '../../domain/constants';
import { decisionCode, entryCode, experimentCode, pathCode, patternCode } from '../../domain/selectors';
import type { AtlasData } from '../../domain/types';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { scanAllEntries } from '../../state/operations';
import { saveCurrentVersion, versionStamp } from '../../state/versionOps';
import { toast, useUI } from '../../state/uiStore';
import { CAPTURE_ICONS, CATEGORY_ICONS, DOMAIN_ICONS, PatternIcon } from '../icons';
import { Kbd } from '../ui/primitives';
import { t, tn } from '../../i18n';

interface Item {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon: LucideIcon;
  color?: string;
  run(): void;
}

function buildIndex(data: AtlasData): Item[] {
  const ui = useUI.getState();
  const items: Item[] = [
    ...(Object.keys(VIEWS) as ViewKey[]).map((key) => {
      const group = groupOf(key);
      return {
        id: `go:${key}`,
        group: t('Go to'),
        label: group && group.views.length > 1 ? `${group.label} · ${VIEWS[key].label}` : VIEWS[key].label,
        detail: key === 'settings' ? t('Data, export, the look of the map, analysis') : VIEWS[key].question,
        icon: ArrowRight,
        run: () => navigate(key),
      };
    }),
    { id: 'act:entry', group: t('Actions'), label: t('Capture an entry'), icon: Plus, run: () => ui.openCapture('journal') },
    { id: 'act:decision', group: t('Actions'), label: t('Log a decision'), icon: Split, run: () => ui.openCapture('decision') },
    {
      id: 'act:scan',
      group: t('Actions'),
      label: t('Scan all entries for evidence'),
      detail: t('Re-run analysis; keeps what you already reviewed'),
      icon: ScanSearch,
      run: async () => {
        const n = await scanAllEntries();
        toast(n ? tn(n, '{n} suggestion waiting for review.', '{n} suggestions waiting for review.') : t('No new suggestions.'), { tone: 'success' });
      },
    },
    { id: 'act:keys', group: t('Actions'), label: t('Keyboard shortcuts'), icon: Keyboard, run: () => ui.setShortcutsOpen(true) },
    {
      id: 'act:guide',
      group: t('Actions'),
      label: t('Guide: how it works'),
      detail: t('A short introduction'),
      icon: LifeBuoy,
      run: () => ui.setGuideOpen(true),
    },
    {
      id: 'act:save-version',
      group: t('Actions'),
      label: t('Save a version'),
      detail: t('A save point of the whole atlas you can go back to'),
      icon: Save,
      run: async () => {
        const v = await saveCurrentVersion(t('Saved · {when}', { when: versionStamp() }));
        toast(t('Saved “{name}”.', { name: v.name }), { tone: 'success', action: { label: t('Versions'), run: () => ui.setVersionsOpen(true) } });
      },
    },
    {
      id: 'act:versions',
      group: t('Actions'),
      label: t('Versions'),
      detail: t('Go back to a saved version'),
      icon: History,
      run: () => ui.setVersionsOpen(true),
    },
    {
      id: 'act:fresh',
      group: t('Actions'),
      label: t('Start fresh…'),
      detail: t('A new atlas; the current one is saved first'),
      icon: RotateCcw,
      run: () => ui.setStartFreshOpen(true),
    },
  ];
  for (const d of DOMAINS) {
    items.push({
      id: `dom:${d.key}`,
      group: t('Domains'),
      label: d.label,
      detail: data.domains[d.key]?.statement,
      icon: DOMAIN_ICONS[d.key],
      color: d.color,
      run: () => showOnMap('orbit', hubId(d.key), { kind: 'domain', id: d.key }),
    });
  }
  for (const n of Object.values(data.nodes)) {
    const inOrbit = Boolean(n.domain);
    items.push({
      id: `node:${n.id}`,
      group: n.category === 'question' ? t('Questions') : t('Points'),
      label: n.label,
      detail: n.category ? CATEGORY_META[n.category].label : n.domain ? DOMAIN_META[n.domain].label : undefined,
      icon: n.category ? CATEGORY_ICONS[n.category] : DOMAIN_ICONS[n.domain ?? 'identity'],
      color: n.category ? CATEGORY_META[n.category].color : n.domain ? DOMAIN_META[n.domain].color : undefined,
      run: () => showOnMap(inOrbit ? 'orbit' : 'mind', n.id, { kind: 'node', id: n.id }),
    });
  }
  for (const p of Object.values(data.patterns)) {
    items.push({
      id: `pat:${p.id}`,
      group: t('Patterns'),
      label: p.chain.join(' → '),
      detail: patternCode(p.code),
      icon: PatternIcon,
      run: () => navigate('patterns', p.id),
    });
  }
  for (const p of Object.values(data.paths)) {
    items.push({
      id: `path:${p.id}`,
      group: t('Paths'),
      label: p.title,
      detail: pathCode(p.code),
      icon: ArrowRight,
      run: () => openOn('paths', { kind: 'path', id: p.id }),
    });
  }
  for (const x of Object.values(data.experiments)) {
    items.push({
      id: `exp:${x.id}`,
      group: t('Experiments'),
      label: x.title,
      detail: `${experimentCode(x.code)} · ${x.hypothesis}`,
      icon: FlaskConical,
      run: () => openOn('navigation', { kind: 'experiment', id: x.id }),
    });
  }
  for (const d of Object.values(data.decisions)) {
    items.push({
      id: `dec:${d.id}`,
      group: t('Decisions'),
      label: d.title,
      detail: decisionCode(d.seq),
      icon: Split,
      run: () => openOn('decisions', { kind: 'decision', id: d.id }),
    });
  }
  for (const e of Object.values(data.entries).sort((a, b) => b.date.localeCompare(a.date))) {
    items.push({
      id: `ent:${e.id}`,
      group: t('Entries'),
      label: e.title,
      detail: `${entryCode(e.seq)} · ${e.content}`,
      icon: CAPTURE_ICONS[e.kind],
      run: () => openOn('journal', { kind: 'entry', id: e.id }),
    });
  }
  return items;
}

function score(item: Item, terms: string[]): number {
  const label = item.label.toLowerCase();
  const hay = `${label} ${item.detail?.toLowerCase() ?? ''} ${item.group.toLowerCase()}`;
  let s = 0;
  for (const t of terms) {
    if (!hay.includes(t)) return -1;
    s += label.startsWith(t) ? 6 : label.includes(t) ? 3 : 1;
  }
  return s;
}

/** ⌘K: search everything and run commands without leaving the keyboard. */
export function CommandPalette() {
  const openState = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  if (!openState) return null;
  return createPortal(<Palette onClose={() => setOpen(false)} />, document.body);
}

function Palette({ onClose }: { onClose(): void }) {
  const data = useAtlas((s) => s.data);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const index = useMemo(() => buildIndex(data), [data]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return index.filter((i) => i.group === t('Go to') || i.group === t('Actions'));
    return index
      .map((i) => ({ i, s: score(i, terms) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.i);
  }, [index, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item?: Item) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const groups: { name: string; items: { item: Item; index: number }[] }[] = [];
  results.forEach((item, index) => {
    const g = groups.find((x) => x.name === item.group) ?? (groups.push({ name: item.group, items: [] }), groups[groups.length - 1]);
    g.items.push({ item, index });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Search and commands')}
        className="relative w-full max-w-[600px] animate-rise overflow-hidden rounded-[2px] border border-line-strong bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={15} className="text-ink-3" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[active]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={t('Search nodes, entries, patterns, or type a command')}
            aria-label={t('Search')}
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `pal-${active}` : undefined}
            className="h-12 w-full bg-transparent text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul ref={list} id="palette-list" role="listbox" className="max-h-[min(60vh,460px)] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-3">{t('Nothing matches “{query}”.', { query })}</li>}
          {groups.map((g) => (
            <li key={g.name} role="presentation">
              <div className="label px-2.5 pt-2 pb-1">{g.name}</div>
              <ul role="presentation">
                {g.items.map(({ item, index }) => (
                  <li
                    key={item.id}
                    id={`pal-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={index === active}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(item)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-[2px] px-2.5 py-2', index === active ? 'bg-ink/[0.06]' : '')}
                  >
                    <item.icon size={14} strokeWidth={1.8} color={item.color} className={cn('shrink-0', !item.color && 'text-ink-3')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{item.label}</span>
                      {item.detail && <span className="block truncate text-[11.5px] text-ink-3">{item.detail}</span>}
                    </span>
                    {index === active && <CornerDownLeft size={13} className="shrink-0 text-ink-3" aria-hidden />}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
