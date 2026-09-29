import { useEffect } from 'react';
import { SECTIONS } from '../domain/constants';
import { isTyping } from '../lib/dom';
import { useUI } from '../state/uiStore';
import { navigate } from './router';

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
      const section = SECTIONS.find((s) => s.num.endsWith(e.key));
      if (section && /^[1-5]$/.test(e.key)) return navigate(section.key);
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

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['1', '–', '5'], label: 'Orbit, Mind, Patterns, Paths, Navigation' },
  { keys: ['J'], label: 'Journal' },
  { keys: ['D'], label: 'Decision log' },
  { keys: ['Q'], label: 'Open questions' },
  { keys: ['N'], label: 'Capture an entry' },
  { keys: ['⌘', 'K'], label: 'Search and commands (also /)' },
  { keys: ['Esc'], label: 'Close the panel' },
  { keys: ['['], label: 'Back in the panel (also Alt + ←)' },
  { keys: ['F'], label: 'Fit the graph to the screen' },
  { keys: ['+', '−'], label: 'Zoom the graph' },
  { keys: ['Tab', '↵'], label: 'Move between graph nodes, open one' },
  { keys: ['←', '↑', '→', '↓'], label: 'Travel along a graph connection in that direction' },
  { keys: ['?'], label: 'This list' },
];
