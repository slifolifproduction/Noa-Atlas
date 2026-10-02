import {
  ArrowLeft,
  BookOpen,
  Ellipsis,
  History,
  Keyboard,
  LifeBuoy,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sprout,
  type LucideIcon,
} from 'lucide-react';
import { useAgent } from '../../agent/store';
import { groupTarget, hrefFor, type RouteKey } from '../../app/router';
import { isExampleAtlas } from '../../data/seed';
import { GROUPS, groupOf, VIEWS, type GroupKey } from '../../domain/constants';
import { cn } from '../../lib/cn';
import { useAccount } from '../../state/accountStore';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { PLACE_ICONS } from '../icons';
import { Button, IconButton } from '../ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Kbd } from '../ui/primitives';
import { SyncIndicator } from './AccountControls';
import { FocusChip } from './Focus';
import { LanguageItems, LanguageMenu, WorldClock } from './LocaleControls';
import { LogoMark, Wordmark } from './Logo';
import { t } from '../../i18n';

export const GROUP_ICONS: Record<GroupKey, LucideIcon> = PLACE_ICONS;

/**
 * Six lenses on one atlas, what you are looking at, search, capture, and
 * one "more" menu. Switching lens keeps the thing you are looking at.
 */
export function TopBar({ active }: { active: RouteKey }) {
  const openCapture = useUI((s) => s.openCapture);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const agentOpen = useAgent((s) => s.open);
  const toggleAgent = useAgent((s) => s.toggle);
  const current = groupOf(active)?.key;

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-canvas px-3 md:px-5">
      <a href={hrefFor('orbit')} className="mr-1 flex items-center gap-2.5 rounded-[2px] py-1 pr-1 xl:mr-4" aria-label={t('Noa Atlas, home')}>
        <LogoMark />
        <Wordmark className="hidden xl:inline" />
      </a>

      <nav aria-label={t('Lenses')} className="hidden h-full items-stretch md:flex">
        {GROUPS.map((g, i) => {
          const isActive = current === g.key;
          const Icon = GROUP_ICONS[g.key];
          return (
            <a
              key={g.key}
              href={hrefFor(isActive ? active : groupTarget(g.key))}
              aria-current={isActive ? 'page' : undefined}
              aria-label={g.label}
              title={t('{question} (key {n})', { question: g.question, n: i + 1 })}
              className={cn(
                'group relative flex items-center gap-1.5 px-2.5 text-[13.5px] whitespace-nowrap transition-colors xl:px-3.5',
                isActive ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              <Icon size={14} strokeWidth={1.7} className={isActive ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2'} aria-hidden />
              {/* Six lenses: on narrower screens, their marks alone (named on hover and to assistive tech). */}
              <span className="hidden font-medium tracking-[0.005em] lg:inline">{g.label}</span>
              {isActive && <span className="absolute inset-x-2.5 -bottom-px h-px bg-accent xl:inset-x-3.5" aria-hidden />}
            </a>
          );
        })}
      </nav>

      <FocusChip className="ml-3 hidden lg:flex" />

      <div className="ml-auto flex items-center gap-1.5">
        <WorldClock />
        <SyncIndicator />
        <LanguageMenu className="hidden sm:inline-flex" />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-8 items-center gap-2 rounded-[2px] border border-line-strong pr-1.5 pl-2.5 text-[12.5px] text-ink-3 transition-colors hover:border-ink/40 hover:text-ink-2 sm:flex"
        >
          <Search size={13} aria-hidden />
          <span className="pr-4">{t('Search')}</span>
          <Kbd className="border-line bg-transparent">⌘K</Kbd>
        </button>
        <IconButton icon={Search} label={t('Search')} className="sm:hidden" onClick={() => setPaletteOpen(true)} />
        <span className="hidden sm:inline-flex">
          <Button
            icon={MessageSquareText}
            onClick={toggleAgent}
            kbd="A"
            aria-pressed={agentOpen}
            className={agentOpen ? 'border-ink/45 bg-ink/[0.06]' : undefined}
          >
            {t('Agent')}
          </Button>
        </span>
        <IconButton icon={MessageSquareText} label={t('Agent')} className="sm:hidden" active={agentOpen} onClick={toggleAgent} />
        <span className="hidden sm:inline-flex">
          <Button variant="primary" icon={Plus} onClick={() => openCapture('journal')} kbd="N">
            {t('Capture')}
          </Button>
        </span>
        <IconButton icon={Plus} label={t('Capture')} className="sm:hidden" onClick={() => openCapture('journal')} />
        <MoreMenu />
      </div>
    </header>
  );
}

/** Versions, the guide, shortcuts and settings: needed now and then, so kept together out of the way. */
function MoreMenu() {
  const ui = useUI.getState;
  const example = useAtlas((s) => isExampleAtlas(s.data));
  const claude = useAccount((s) => s.claude === 'available');
  return (
    <Menu label={t('More: versions, guide, settings')} icon={Ellipsis} iconOnly className="border-transparent bg-transparent" width="w-64">
      <MenuItem icon={History} hint={t('Save your atlas, go back to an earlier one, or start fresh')} onSelect={() => ui().setVersionsOpen(true)}>
        {t('Versions')}
      </MenuItem>
      <MenuItem icon={LifeBuoy} hint={t('What Noa Atlas is, in three lines')} onSelect={() => ui().setGuideOpen(true)}>
        {t('Guide')}
      </MenuItem>
      {example ? (
        <>
          <MenuItem
            icon={Sprout}
            hint={t('Leave the example for an atlas of your own; the example is kept as a version')}
            onSelect={() => ui().setStartFreshOpen(true, 'empty')}
          >
            {t('Start my own atlas')}
          </MenuItem>
          <MenuItem icon={BookOpen} hint={t('Seven people at work and one student, to learn from')} onSelect={() => ui().setStartFreshOpen(true, 'sample')}>
            {t('Other examples')}
          </MenuItem>
        </>
      ) : (
        <MenuItem
          icon={BookOpen}
          hint={t('A life already filled in, to learn how things work; your atlas is saved first')}
          onSelect={() => ui().setStartFreshOpen(true, 'sample')}
        >
          {t('Open an example')}
        </MenuItem>
      )}
      {claude && (
        <MenuItem icon={Sparkles} hint={t('Claude reads your recent weeks and asks what would tell things apart')} onSelect={() => ui().setReviewOpen(true)}>
          {t('Weekly review with Claude')}
        </MenuItem>
      )}
      <MenuItem icon={Keyboard} kbd="?" onSelect={() => ui().setShortcutsOpen(true)}>
        {t('Keyboard shortcuts')}
      </MenuItem>
      <MenuSeparator />
      <div className="sm:hidden">
        <MenuLabel>{t('Language')}</MenuLabel>
        <LanguageItems />
        <MenuSeparator />
      </div>
      <MenuItem icon={Settings} href={hrefFor('settings')}>
        {t('Settings')}
      </MenuItem>
    </Menu>
  );
}

/** A page reached from inside a lens (like the plan you chose, inside Ahead) gets a way back to it. */
export function SubNav({ active }: { active: RouteKey }) {
  const group = groupOf(active);
  if (!group || group.views[0] === active) return null;
  const home = group.views[0];
  return (
    <nav aria-label={group.label} className="relative z-20 flex h-10 shrink-0 items-center gap-3 border-b border-line bg-canvas px-3 md:px-5">
      <a href={hrefFor(home)} className="flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink">
        <ArrowLeft size={13} aria-hidden />
        {VIEWS[home].label}
      </a>
      <span className="text-ink-3" aria-hidden>
        /
      </span>
      <span className="text-[12.5px] font-medium text-ink">{VIEWS[active].label}</span>
    </nav>
  );
}

export function MobileTabBar({ active }: { active: RouteKey }) {
  const current = groupOf(active)?.key;
  return (
    <nav aria-label={t('Lenses')} className="z-30 flex shrink-0 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
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
            <Icon size={16} strokeWidth={1.6} className={isActive ? 'text-accent' : undefined} aria-hidden />
            <span className="text-[11px] font-medium">{g.label}</span>
            {isActive && <span className="absolute inset-x-4 top-0 h-px bg-accent" aria-hidden />}
          </a>
        );
      })}
    </nav>
  );
}
