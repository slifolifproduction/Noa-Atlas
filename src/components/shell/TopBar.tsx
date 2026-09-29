import { Ellipsis, History, Keyboard, LifeBuoy, Plus, Search, Settings, type LucideIcon } from 'lucide-react';
import { useAtlas } from '../../state/atlasStore';
import { daysBetween, todayISO } from '../../lib/dates';
import { groupTarget, hrefFor, type RouteKey } from '../../app/router';
import { GROUPS, groupOf, VIEWS, type GroupKey } from '../../domain/constants';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { PLACE_ICONS } from '../icons';
import { Button, IconButton } from '../ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { Kbd } from '../ui/primitives';
import { LogoMark, Wordmark } from './Logo';

export const GROUP_ICONS: Record<GroupKey, LucideIcon> = PLACE_ICONS;

/**
 * Four places, search, capture, and one "more" menu. Everything else lives
 * inside those places, so the bar never asks you to choose between a dozen things.
 */
export function TopBar({ active }: { active: RouteKey }) {
  const openCapture = useUI((s) => s.openCapture);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const current = groupOf(active)?.key;

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-canvas px-3 md:px-5">
      <a href={hrefFor('orbit')} className="mr-3 flex items-center gap-2.5 rounded-[2px] py-1 pr-1 lg:mr-6" aria-label="Cognitive Atlas, home">
        <LogoMark />
        <Wordmark className="hidden lg:inline" />
      </a>

      <nav aria-label="Main" className="hidden h-full items-stretch md:flex">
        {GROUPS.map((g, i) => {
          const isActive = current === g.key;
          return (
            <a
              key={g.key}
              href={hrefFor(isActive ? active : groupTarget(g.key))}
              aria-current={isActive ? 'page' : undefined}
              title={`${g.question} (key ${i + 1})`}
              className={cn(
                'group relative flex items-baseline gap-1.5 px-3 pt-[17px] text-[13.5px] transition-colors lg:px-4',
                isActive ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              <span className={cn('num text-[10.5px] tracking-[0.06em]', isActive ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden>
                0{i + 1}
              </span>
              <span className="font-medium tracking-[0.005em]">{g.label}</span>
              {isActive && <span className="absolute inset-x-3 -bottom-px h-px bg-accent lg:inset-x-4" aria-hidden />}
            </a>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <Elapsed />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-8 items-center gap-2 rounded-[2px] border border-line-strong pr-1.5 pl-2.5 text-[12.5px] text-ink-3 transition-colors hover:border-ink/40 hover:text-ink-2 sm:flex"
        >
          <Search size={13} aria-hidden />
          <span className="pr-6">Search</span>
          <Kbd className="border-line bg-transparent">⌘K</Kbd>
        </button>
        <IconButton icon={Search} label="Search" className="sm:hidden" onClick={() => setPaletteOpen(true)} />
        <span className="hidden sm:inline-flex">
          <Button variant="primary" icon={Plus} onClick={() => openCapture('journal')} kbd="N">
            Capture
          </Button>
        </span>
        <IconButton icon={Plus} label="Capture" className="sm:hidden" onClick={() => openCapture('journal')} />
        <MoreMenu />
      </div>
    </header>
  );
}

/**
 * Mission-elapsed time for the atlas: days since the first note, like the
 * T+ clock of a flight. Hidden until there is a first note.
 */
function Elapsed() {
  const first = useAtlas((s) => {
    let min = '';
    for (const e of Object.values(s.data.entries)) if (!min || e.date < min) min = e.date;
    return min;
  });
  if (!first) return null;
  const days = Math.max(0, daysBetween(first, todayISO()));
  return (
    <span className="num mr-3 hidden items-center gap-2 text-[10.5px] tracking-[0.12em] text-ink-3 xl:flex" title={`${days} days since your first note`}>
      <span className="atlas-live-dot h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      T+{String(days).padStart(3, '0')}D
    </span>
  );
}

/** Versions, the guide, shortcuts and settings: needed now and then, so kept together out of the way. */
function MoreMenu() {
  const ui = useUI.getState;
  return (
    <Menu label="More: versions, guide, settings" icon={Ellipsis} iconOnly className="border-transparent bg-transparent" width="w-64">
      <MenuItem icon={History} hint="Save your atlas, go back to an earlier one, or start fresh" onSelect={() => ui().setVersionsOpen(true)}>
        Versions
      </MenuItem>
      <MenuItem icon={LifeBuoy} hint="How Cognitive Atlas works, in five short steps" onSelect={() => ui().setGuideOpen(true)}>
        Guide
      </MenuItem>
      <MenuItem icon={Keyboard} kbd="?" onSelect={() => ui().setShortcutsOpen(true)}>
        Keyboard shortcuts
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={Settings} href={hrefFor('settings')}>
        Settings
      </MenuItem>
    </Menu>
  );
}

/** Tabs for the pages inside the current place (e.g. Orbit and Mind inside Map). */
export function SubNav({ active }: { active: RouteKey }) {
  const group = groupOf(active);
  if (!group || group.views.length < 2) return null;
  return (
    <nav aria-label={group.label} className="relative z-20 flex h-10 shrink-0 items-stretch gap-6 border-b border-line bg-canvas px-3 md:px-5">
      <div className="flex items-stretch gap-5">
        {group.views.map((v) => (
          <a
            key={v}
            href={hrefFor(v)}
            aria-current={v === active ? 'page' : undefined}
            className={cn(
              'relative flex items-center text-[12.5px] font-medium tracking-[0.01em] transition-colors',
              v === active ? 'text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {VIEWS[v].label}
            {v === active && <span className="absolute inset-x-0 -bottom-px h-px bg-ink" aria-hidden />}
          </a>
        ))}
      </div>
      <span className="display hidden items-center truncate text-[14px] text-ink-3 sm:flex">{VIEWS[active].question}</span>
    </nav>
  );
}

export function MobileTabBar({ active }: { active: RouteKey }) {
  const current = groupOf(active)?.key;
  return (
    <nav aria-label="Main" className="z-30 flex shrink-0 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
      {GROUPS.map((g, i) => {
        const isActive = current === g.key;
        const Icon = GROUP_ICONS[g.key];
        return (
          <a
            key={g.key}
            href={hrefFor(isActive ? active : groupTarget(g.key))}
            aria-current={isActive ? 'page' : undefined}
            className={cn('relative flex h-14 flex-1 flex-col items-center justify-center gap-1', isActive ? 'text-ink' : 'text-ink-3')}
          >
            <Icon size={16} strokeWidth={1.6} className={isActive ? 'text-accent' : undefined} aria-hidden />
            <span className="text-[11px] font-medium">
              <span className={cn('num mr-1 text-[10.5px]', isActive ? 'text-accent' : 'text-ink-3')} aria-hidden>
                0{i + 1}
              </span>
              {g.label}
            </span>
            {isActive && <span className="absolute inset-x-5 top-0 h-px bg-accent" aria-hidden />}
          </a>
        );
      })}
    </nav>
  );
}
