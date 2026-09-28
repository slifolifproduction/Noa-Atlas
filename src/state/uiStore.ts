/**
 * Interface state: what is selected, what is open, and how each graph is laid
 * out. Graph positions, viewports and filters persist so the map is exactly
 * where the user left it after a refresh.
 */
import type { Viewport } from '@xyflow/react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '../ai';
import type { CaptureKind, DomainKey, EntityRef, GraphLayer, ID, MindCategory, RelationType } from '../domain/types';
import { createId } from '../lib/ids';
import { safeLocalStorage, STORAGE_KEYS } from '../persistence/storage';

export interface XY {
  x: number;
  y: number;
}

export interface GraphLayoutState {
  positions: Record<ID, XY>;
  viewport?: Viewport;
}

export interface OrbitView {
  /** Hubs whose satellites are hidden. */
  collapsed: DomainKey[];
  focus: boolean;
}

export interface MindView {
  hiddenCategories: MindCategory[];
  hiddenRelations: RelationType[];
  showPatterns: boolean;
  showInferred: boolean;
  /** 0 = show everything; 1 or 2 = only nodes within that many hops of the selection. */
  focusDepth: 0 | 1 | 2;
}

export interface Toast {
  id: string;
  message: string;
  tone: 'neutral' | 'success' | 'warning';
  action?: { label: string; run: () => void };
}

export interface CaptureRequest {
  kind: CaptureKind;
  edit?: { kind: 'entry' | 'decision'; id: ID };
}

/** A one-shot request for a graph to centre on a node. `at` lets a graph ignore stale requests. */
export interface FocusRequest {
  layer: GraphLayer;
  id: ID;
  at: number;
}

/** Requests older than this are ignored, so revisiting a graph never jumps to an old target. */
export const FOCUS_REQUEST_TTL = 2500;

interface UIState {
  inspector: EntityRef[];
  capture: CaptureRequest | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  hudOpen: boolean;
  layouts: Record<GraphLayer, GraphLayoutState>;
  orbitView: OrbitView;
  mindView: MindView;
  focusRequest: FocusRequest | null;
  toasts: Toast[];
  settings: ProviderSettings;
  busy: Record<string, boolean>;

  openEntity(ref: EntityRef): void;
  replaceEntity(ref: EntityRef): void;
  back(): void;
  closeInspector(): void;
  openCapture(kind?: CaptureKind, edit?: CaptureRequest['edit']): void;
  closeCapture(): void;
  setPaletteOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setHudOpen(open: boolean): void;
  setPositions(layer: GraphLayer, positions: Record<ID, XY>): void;
  setViewport(layer: GraphLayer, viewport: Viewport): void;
  resetLayout(layer: GraphLayer): void;
  setOrbitView(patch: Partial<OrbitView>): void;
  setMindView(patch: Partial<MindView>): void;
  requestFocus(layer: GraphLayer, id: ID): void;
  toast(message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>): void;
  dismissToast(id: string): void;
  setSettings(patch: Partial<ProviderSettings>): void;
  setBusy(key: string, busy: boolean): void;
}

const sameEntity = (a?: EntityRef, b?: EntityRef) => Boolean(a && b && a.kind === b.kind && a.id === b.id);

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      inspector: [],
      capture: null,
      paletteOpen: false,
      shortcutsOpen: false,
      hudOpen: true,
      layouts: { orbit: { positions: {} }, mind: { positions: {} } },
      orbitView: { collapsed: [], focus: false },
      mindView: { hiddenCategories: [], hiddenRelations: [], showPatterns: true, showInferred: true, focusDepth: 0 },
      focusRequest: null,
      toasts: [],
      settings: DEFAULT_PROVIDER_SETTINGS,
      busy: {},

      openEntity: (ref) =>
        set((s) => {
          if (sameEntity(s.inspector[s.inspector.length - 1], ref)) return s;
          // Keep the trail short enough to stay legible.
          return { inspector: [...s.inspector.filter((r) => !sameEntity(r, ref)), ref].slice(-12) };
        }),
      replaceEntity: (ref) => set({ inspector: [ref] }),
      back: () => set((s) => ({ inspector: s.inspector.slice(0, -1) })),
      closeInspector: () => set({ inspector: [] }),

      openCapture: (kind = 'journal', edit) => set({ capture: { kind, edit }, paletteOpen: false }),
      closeCapture: () => set({ capture: null }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setHudOpen: (hudOpen) => set({ hudOpen }),

      setPositions: (layer, positions) =>
        set((s) => ({ layouts: { ...s.layouts, [layer]: { ...s.layouts[layer], positions: { ...s.layouts[layer].positions, ...positions } } } })),
      setViewport: (layer, viewport) => set((s) => ({ layouts: { ...s.layouts, [layer]: { ...s.layouts[layer], viewport } } })),
      resetLayout: (layer) => set((s) => ({ layouts: { ...s.layouts, [layer]: { positions: {} } } })),
      setOrbitView: (patch) => set((s) => ({ orbitView: { ...s.orbitView, ...patch } })),
      setMindView: (patch) => set((s) => ({ mindView: { ...s.mindView, ...patch } })),
      requestFocus: (layer, id) => set({ focusRequest: { layer, id, at: Date.now() } }),

      toast: (message, opts) => {
        const id = createId('toast');
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone: opts?.tone ?? 'neutral', action: opts?.action }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), opts?.action ? 7000 : 4000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setBusy: (key, busy) => set((s) => ({ busy: { ...s.busy, [key]: busy } })),
    }),
    {
      name: STORAGE_KEYS.ui,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        hudOpen: s.hudOpen,
        layouts: s.layouts,
        orbitView: s.orbitView,
        mindView: s.mindView,
        settings: s.settings,
      }),
    },
  ),
);

export const toast = (message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>) => useUI.getState().toast(message, opts);
