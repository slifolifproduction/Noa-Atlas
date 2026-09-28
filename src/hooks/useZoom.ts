import { useStore } from '@xyflow/react';

/** Current canvas zoom, quantised so nodes only re-render when it meaningfully changes. */
export function useZoomLevel(step = 0.1): number {
  return useStore((s) => Math.round(s.transform[2] / step) * step);
}

/**
 * Scale factor that keeps overlay text legible when zoomed out: text grows as
 * the canvas shrinks, up to `max`, and is never scaled below 1.
 */
export function useLabelScale(target = 0.9, max = 1.7): number {
  const zoom = useZoomLevel();
  return Math.min(max, Math.max(1, target / Math.max(zoom, 0.1)));
}
