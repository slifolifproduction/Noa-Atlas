import { BookOpen, CircleQuestionMark, Menu, Plus, Search, Settings, Split } from 'lucide-react';
import { useState } from 'react';
import { hrefFor, type RouteKey } from '../../app/router';
import { SECTIONS } from '../../domain/constants';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { Button, IconButton } from '../ui/Button';
import { Kbd } from '../ui/primitives';
import { LogoMark } from './Logo';

const UTILITIES = [
  { key: 'journal', label: 'Journal', icon: BookOpen, kbd: 'J' },
  { key: 'decisions', label: 'Decisions', icon: Split, kbd: 'D' },
  { key: 'questions', label: 'Questions', icon: CircleQuestionMark, kbd: 'Q' },
] as const;

export function TopBar({ active }: { active: RouteKey }) {
  const openCapture = useUI((s) => s.openCapture);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-canvas/95 px-3 backdrop-blur md:px-4">
      <a href={hrefFor('orbit')} className="mr-2 flex items-center gap-2.5 rounded-md py-1 pr-1" aria-label="Cognitive Atlas, home">
        <LogoMark />
        <span className="hidden text-[13px] font-medium tracking-[-0.01em] text-ink lg:inline">Cognitive Atlas</span>
      </a>

      <nav aria-label="Sections" className="hidden h-full items-stretch md:flex">
        {SECTIONS.map((s) => {
          const isActive = active === s.key;
          return (
            <a
              key={s.key}
              href={hrefFor(s.key)}
              aria-current={isActive ? 'page' : undefined}
              title={`${s.question} (${s.num.slice(1)})`}
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 text-[12.5px] transition-colors lg:px-3',
                isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              <span className="num text-[10.5px] text-ink-3">{s.num}</span>
              <span className="font-medium tracking-[0.01em]">{s.label}</span>
              {isActive && <span className="absolute inset-x-2.5 -bottom-px h-px bg-accent lg:inset-x-3" aria-hidden />}
            </a>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <nav aria-label="Records" className="hidden items-center gap-0.5 lg:flex">
          {UTILITIES.map((u) => (
            <a
              key={u.key}
              href={hrefFor(u.key)}
              aria-current={active === u.key ? 'page' : undefined}
              title={`${u.label} (${u.kbd})`}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[12.5px] transition-colors',
                active === u.key ? 'bg-white/[0.06] text-ink' : 'text-ink-3 hover:bg-white/[0.04] hover:text-ink-2',
              )}
            >
              <u.icon size={14} strokeWidth={1.7} aria-hidden />
              <span className="hidden xl:inline">{u.label}</span>
            </a>
          ))}
        </nav>
        <span className="mx-1.5 hidden h-5 w-px bg-line lg:block" aria-hidden />
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
        <span className="ml-1 hidden sm:inline-flex">
          <Button variant="primary" icon={Plus} onClick={() => openCapture('journal')} kbd="N">
            Capture
          </Button>
        </span>
        <IconButton icon={Plus} label="Capture" className="sm:hidden" onClick={() => openCapture('journal')} />
        <a
          href={hrefFor('settings')}
          aria-current={active === 'settings' ? 'page' : undefined}
          title="Settings"
          aria-label="Settings"
          className={cn(
            'hidden h-8 w-8 items-center justify-center rounded-[6px] lg:flex',
            active === 'settings' ? 'bg-white/[0.06] text-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          <Settings size={15} strokeWidth={1.7} aria-hidden />
        </a>
        <div className="relative lg:hidden">
          <IconButton icon={Menu} label="More" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} />
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 z-20 mt-1 w-48 animate-rise rounded-[8px] border border-line-strong bg-overlay p-1 shadow-xl">
                {[...UTILITIES, { key: 'settings', label: 'Settings', icon: Settings, kbd: '' } as const].map((u) => (
                  <a
                    key={u.key}
                    href={hrefFor(u.key)}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px]',
                      active === u.key ? 'bg-white/[0.06] text-ink' : 'text-ink-2 hover:bg-white/[0.04]',
                    )}
                  >
                    <u.icon size={14} aria-hidden />
                    {u.label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MobileTabBar({ active }: { active: RouteKey }) {
  return (
    <nav aria-label="Sections" className="z-30 flex shrink-0 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {SECTIONS.map((s) => {
        const isActive = active === s.key;
        return (
          <a
            key={s.key}
            href={hrefFor(s.key)}
            aria-current={isActive ? 'page' : undefined}
            className={cn('relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5', isActive ? 'text-ink' : 'text-ink-3')}
          >
            <span className="num text-[10px]">{s.num}</span>
            <span className="text-[11px] font-medium">{s.label}</span>
            {isActive && <span className="absolute inset-x-4 top-0 h-px bg-accent" aria-hidden />}
          </a>
        );
      })}
    </nav>
  );
}
