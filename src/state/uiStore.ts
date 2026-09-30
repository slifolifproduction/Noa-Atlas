/**
 * Interface state: what is selected, what is open, and how each graph is laid
 * out. Graph positions, viewports and filters persist so the map is exactly
 * where the user left it after a refresh.
 */
import type { Viewport } from '@xyflow/react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '../ai';
import type { AreaKey, CaptureKind, ClaimStatus, EntityRef, GraphLayer, ID, LayerKey } from '../domain/types';
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
  /** Areas whose elements are folded away. */
  collapsed: AreaKey[];
  /** Layers hidden from the map. */
  hiddenLayers: LayerKey[];
  focus: boolean;
  /** Show claims as lines on the map (declared links always show). */
  showClaims: boolean;
  /** Show every element; otherwise each area shows its essentials until it is chosen. */
  showAll?: boolean;
}

export interface NetworkView {
  /** Claim statuses hidden from the network. */
  hiddenStatuses: ClaimStatus[];
  hiddenAreas: AreaKey[];
  /** Proposals from the analysis, shown dashed until adopted. */
  showSuggested: boolean;
  /** 0 = everything; 1 or 2 = only what is within that many links of the selection. */
  focusDepth: 0 | 1 | 2;
  /** Which way the trace from what you are looking at runs: what may lead to it, or what it may lead to. */
  trace?: 'back' | 'forward' | 'both';
  /** A loop to highlight. */
  loopId?: string;
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

/** 3D depth in the graphs: automatic (steps down on slow devices), always on, or flat. */
export type SpaceMode = 'auto' | 'on' | 'off';

/** Requests older than this are ignored, so revisiting a graph never jumps to an old target. */
export const FOCUS_REQUEST_TTL = 2500;

export interface UIState {
  inspector: EntityRef[];
  /**
   * The thing being looked at, whichever lens is open: an element or an area.
   * It stays when the panel closes, and every lens answers about it, until it
   * is cleared.
   */
  focus: EntityRef | null;
  /** The question left open in the panel, so moving to another thing keeps asking the same thing. */
  asking: string | null;
  /** A passage to highlight when a record opens from its evidence. */
  highlight: string | null;
  capture: CaptureRequest | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  hudOpen: boolean;
  layouts: Record<GraphLayer, GraphLayoutState>;
  orbitView: OrbitView;
  networkView: NetworkView;
  focusRequest: FocusRequest | null;
  toasts: Toast[];
  settings: ProviderSettings;
  spaceMode: SpaceMode;
  /** The welcome guide has been seen (it opens by itself once). */
  guideSeen: boolean;
  guideOpen: boolean;
  versionsOpen: boolean;
  startFreshOpen: boolean;
  /** What the start-fresh window offers first: an empty atlas, or the example. */
  startFreshMode: 'empty' | 'sample';
  /**
   * The person's own atlas, saved as a version when they opened the example
   * to learn from it: the way back.
   */
  returnVersionId?: string;
  /** The note saying this is the example was put away for this session. */
  exampleNoteHidden: boolean;
  /** Pages whose "how this works" tip has been read and folded away. */
  tipsSeen: string[];
  busy: Record<string, boolean>;

  openEntity(ref: EntityRef): void;
  setFocus(ref: EntityRef | null): void;
  setAsking(question: string | null): void;
  /** Open a record at the passage that was cited from it. */
  openSource(ref: EntityRef, excerpt?: string): void;
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
  setNetworkView(patch: Partial<NetworkView>): void;
  requestFocus(layer: GraphLayer, id: ID): void;
  toast(message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>): void;
  dismissToast(id: string): void;
  setSettings(patch: Partial<ProviderSettings>): void;
  setSpaceMode(mode: SpaceMode): void;
  setGuideOpen(open: boolean): void;
  setVersionsOpen(open: boolean): void;
  setStartFreshOpen(open: boolean, mode?: 'empty' | 'sample'): void;
  setReturnVersion(id: string | undefined): void;
  hideExampleNote(): void;
  setTipSeen(page: string, seen: boolean): void;
  setBusy(key: string, busy: boolean): void;
}

const sameEntity = (a?: EntityRef, b?: EntityRef) => Boolean(a && b && a.kind === b.kind && a.id === b.id);
export const isFocusable = (ref: EntityRef) => ref.kind === 'node' || ref.kind === 'area';

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      inspector: [],
      focus: null,
      asking: null,
      highlight: null,
      capture: null,
      paletteOpen: false,
      shortcutsOpen: false,
      hudOpen: true,
      layouts: { orbit: { positions: {} }, network: { positions: {} } },
      orbitView: { collapsed: [], hiddenLayers: [], focus: false, showClaims: false },
      networkView: { hiddenStatuses: ['retired'], hiddenAreas: [], showSuggested: true, focusDepth: 0 },
      focusRequest: null,
      toasts: [],
      settings: DEFAULT_PROVIDER_SETTINGS,
      spaceMode: 'auto',
      guideSeen: false,
      guideOpen: false,
      versionsOpen: false,
      startFreshOpen: false,
      startFreshMode: 'empty',
      returnVersionId: undefined,
      exampleNoteHidden: false,
      tipsSeen: [],
      busy: {},

      openEntity: (ref) =>
        set((s) => {
          // Opening an element or an area makes it the subject of every lens.
          const focus = isFocusable(ref) ? ref : s.focus;
          if (sameEntity(s.inspector[s.inspector.length - 1], ref)) return { focus };
          // Keep the trail short enough to stay legible.
          return { inspector: [...s.inspector.filter((r) => !sameEntity(r, ref)), ref].slice(-12), focus, highlight: null };
        }),
      setFocus: (focus) => set({ focus }),
      setAsking: (asking) => set({ asking }),
      openSource: (ref, excerpt) =>
        set((s) => ({
          highlight: excerpt ?? null,
          inspector: [...s.inspector.filter((r) => !sameEntity(r, ref)), ref].slice(-12),
        })),
      replaceEntity: (ref) => set((s) => ({ inspector: [ref], focus: isFocusable(ref) ? ref : s.focus })),
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
      setNetworkView: (patch) => set((s) => ({ networkView: { ...s.networkView, ...patch } })),
      requestFocus: (layer, id) => set({ focusRequest: { layer, id, at: Date.now() } }),

      toast: (message, opts) => {
        const id = createId('toast');
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone: opts?.tone ?? 'neutral', action: opts?.action }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), opts?.action ? 7000 : 4000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setSpaceMode: (spaceMode) => set({ spaceMode }),
      setGuideOpen: (guideOpen) => set((s) => ({ guideOpen, guideSeen: s.guideSeen || !guideOpen })),
      setVersionsOpen: (versionsOpen) => set({ versionsOpen }),
      setStartFreshOpen: (startFreshOpen, mode) =>
        set((s) => ({ startFreshOpen, versionsOpen: false, startFreshMode: mode ?? (startFreshOpen ? 'empty' : s.startFreshMode) })),
      setReturnVersion: (returnVersionId) => set({ returnVersionId }),
      hideExampleNote: () => set({ exampleNoteHidden: true }),
      setTipSeen: (page, seen) => set((s) => ({ tipsSeen: seen ? [...new Set([...s.tipsSeen, page])] : s.tipsSeen.filter((p) => p !== page) })),
      setBusy: (key, busy) => set((s) => ({ busy: { ...s.busy, [key]: busy } })),
    }),
    {
      name: STORAGE_KEYS.ui,
      version: 3,
      storage: createJSONStorage(() => safeLocalStorage),
      // v1 laid the map out by domains and had a Mind graph; both layouts are rebuilt for the layered map.
      // v2 → v3: Causes became a lens on the map's own positions, and the map starts quiet.
      migrate: (persisted, version) => {
        let p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const { mindView: _m, layouts: _l, orbitView: _o, ...rest } = p;
          p = rest;
        }
        if (version < 3) {
          const layouts = { orbit: { positions: {} }, ...((p.layouts as Record<string, unknown> | undefined) ?? {}), network: { positions: {} } };
          const orbitView = p.orbitView ? { ...(p.orbitView as Record<string, unknown>), showClaims: false } : undefined;
          p = { ...p, layouts, ...(orbitView ? { orbitView } : {}) };
        }
        return p;
      },
      partialize: (s) => ({
        hudOpen: s.hudOpen,
        layouts: s.layouts,
        orbitView: s.orbitView,
        networkView: s.networkView,
        settings: s.settings,
        spaceMode: s.spaceMode,
        guideSeen: s.guideSeen,
        returnVersionId: s.returnVersionId,
        tipsSeen: s.tipsSeen,
      }),
    },
  ),
);

export const toast = (message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>) => useUI.getState().toast(message, opts);
