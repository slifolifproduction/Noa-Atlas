import { BookOpen, Compass, Ellipsis, History, Keyboard, LifeBuoy, Orbit, Plus, Search, Settings, type LucideIcon } from 'lucide-react';
import { groupTarget, hrefFor, type RouteKey } from '../../app/router';
import { GROUPS, groupOf, VIEWS, type GroupKey } from '../../domain/constants';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { PatternIcon } from '../icons';
import { Button, IconButton } from '../ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { Kbd } from '../ui/primitives';
import { LogoMark } from './Logo';

export const GROUP_ICONS: Record<GroupKey, LucideIcon> = {
  map: Orbit,
  notes: BookOpen,
  patterns: PatternIcon,
  plan: Compass,
};

/**
 * Four places, search, capture, and one "more" menu. Everything else lives
 * inside those places, so the bar never asks you to choose between a dozen things.
 */
export function TopBar({ active }: { active: RouteKey }) {
  const openCapture = useUI((s) => s.openCapture);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const current = groupOf(active)?.key;

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-canvas/95 px-3 backdrop-blur md:px-4">
      <a href={hrefFor('orbit')} className="mr-2 flex items-center gap-2.5 rounded-md py-1 pr-1" aria-label="Cognitive Atlas, home">
        <LogoMark />
        <span className="hidden text-[13px] font-medium tracking-[-0.01em] text-ink lg:inline">Cognitive Atlas</span>
      </a>

      <nav aria-label="Main" className="hidden h-full items-stretch md:flex">
        {GROUPS.map((g, i) => {
          const isActive = current === g.key;
          const Icon = GROUP_ICONS[g.key];
          return (
            <a
              key={g.key}
              href={hrefFor(isActive ? active : groupTarget(g.key))}
              aria-current={isActive ? 'page' : undefined}
              title={`${g.question} (${i + 1})`}
              className={cn(
                'relative flex items-center gap-2 px-3 text-[13px] transition-colors lg:px-3.5',
                isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              <Icon size={14} strokeWidth={1.8} className={isActive ? 'text-accent' : undefined} aria-hidden />
              <span className="font-medium">{g.label}</span>
              {isActive && <span className="absolute inset-x-3 -bottom-px h-px bg-accent lg:inset-x-3.5" aria-hidden />}
            </a>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-8 items-center gap-2 rounded-[6px] border border-line bg-surface pr-1.5 pl-2.5 text-[12.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2 sm:flex"
        >
          <Search size={13} aria-hidden />
          <span className="pr-4">Search</span>
          <Kbd>⌘K</Kbd>
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
    <nav aria-label={group.label} className="relative z-20 flex h-10 shrink-0 items-center gap-3 border-b border-line bg-canvas/95 px-3 backdrop-blur md:px-4">
      <div className="flex items-center gap-0.5 rounded-[8px] border border-line bg-surface p-0.5">
        {group.views.map((v) => (
          <a
            key={v}
            href={hrefFor(v)}
            aria-current={v === active ? 'page' : undefined}
            className={cn(
              'rounded-[6px] px-3 py-1 text-[12.5px] font-medium transition-colors',
              v === active ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {VIEWS[v].label}
          </a>
        ))}
      </div>
      <span className="hidden truncate text-[12.5px] text-ink-3 sm:inline">{VIEWS[active].question}</span>
    </nav>
  );
}

export function MobileTabBar({ active }: { active: RouteKey }) {
  const current = groupOf(active)?.key;
  return (
    <nav aria-label="Main" className="z-30 flex shrink-0 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {GROUPS.map((g) => {
        const isActive = current === g.key;
        const Icon = GROUP_ICONS[g.key];
        return (
          <a
            key={g.key}
            href={hrefFor(isActive ? active : groupTarget(g.key))}
            aria-current={isActive ? 'page' : undefined}
            className={cn('relative flex h-14 flex-1 flex-col items-center justify-center gap-1', isActive ? 'text-ink' : 'text-ink-3')}
          >
            <Icon size={17} strokeWidth={1.8} className={isActive ? 'text-accent' : undefined} aria-hidden />
            <span className="text-[11px] font-medium">{g.label}</span>
            {isActive && <span className="absolute inset-x-4 top-0 h-px bg-accent" aria-hidden />}
          </a>
        );
      })}
    </nav>
  );
}
