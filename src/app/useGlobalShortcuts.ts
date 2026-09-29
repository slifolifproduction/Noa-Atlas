import { useEffect } from 'react';
import { GROUPS, groupOf } from '../domain/constants';
import { isTyping } from '../lib/dom';
import { useUI } from '../state/uiStore';
import { groupTarget, navigate, parseHash, type RouteKey } from './router';
import { t } from '../i18n';

/**
 * Desktop-style shortcuts. Single keys only fire when nothing is being typed
 * and no dialog is open; ⌘K / Ctrl+K works everywhere.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      const dialogOpen = ui.paletteOpen || ui.capture || ui.shortcutsOpen || document.querySelector('[role="dialog"][aria-modal="true"]');
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.defaultPrevented) return;
      if (e.key === 'Escape' && !dialogOpen) {
        if (ui.inspector.length) ui.closeInspector();
        return;
      }
      if (dialogOpen) return;
      if (e.altKey) {
        if (e.key === 'ArrowLeft') ui.back();
        return;
      }
      if (/^[1-4]$/.test(e.key)) return navigate(nextInGroup(Number(e.key) - 1));
      switch (e.key) {
        case 'n':
        case 'c':
          e.preventDefault();
          return ui.openCapture('journal');
        case '/':
          e.preventDefault();
          return ui.setPaletteOpen(true);
        case '?':
          return ui.setShortcutsOpen(true);
        case 'j':
          return navigate('journal');
        case 'd':
          return navigate('decisions');
        case 'q':
          return navigate('questions');
        case '[':
          return ui.back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** A place's number takes you there; pressed again, it switches to the next page inside it. */
function nextInGroup(index: number): RouteKey {
  const group = GROUPS[index];
  const here = parseHash(window.location.hash).key;
  if (groupOf(here)?.key !== group.key) return groupTarget(group.key);
  const views: readonly RouteKey[] = group.views;
  return views[(views.indexOf(here) + 1) % views.length];
}

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  {
    keys: ['1', '–', '4'],
    get label() {
      return t('Map, Notes, Patterns, Plan (again: next tab)');
    },
  },
  {
    keys: ['J'],
    get label() {
      return t('Journal');
    },
  },
  {
    keys: ['D'],
    get label() {
      return t('Decisions');
    },
  },
  {
    keys: ['Q'],
    get label() {
      return t('Questions');
    },
  },
  {
    keys: ['N'],
    get label() {
      return t('Write a note');
    },
  },
  {
    keys: ['⌘', 'K'],
    get label() {
      return t('Search and commands (also /)');
    },
  },
  {
    keys: ['Esc'],
    get label() {
      return t('Close the panel');
    },
  },
  {
    keys: ['['],
    get label() {
      return t('Back in the panel (also Alt + ←)');
    },
  },
  {
    keys: ['F'],
    get label() {
      return t('Fit the graph to the screen');
    },
  },
  {
    keys: ['+', '−'],
    get label() {
      return t('Zoom the graph');
    },
  },
  {
    keys: ['Tab', '↵'],
    get label() {
      return t('Move between graph nodes, open one');
    },
  },
  {
    keys: ['←', '↑', '→', '↓'],
    get label() {
      return t('Travel along a graph connection in that direction');
    },
  },
  {
    keys: ['?'],
    get label() {
      return t('This list');
    },
  },
];
