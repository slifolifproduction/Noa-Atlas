/**
 * Whether this device keeps heavy motion smooth, as learned this visit: any scene that cannot keep about 30 frames a
 * second says so (the Map's space first of all), and with Settings → Space on automatic every scene then steps down:
 * the Map and Causes go flat, Ahead's tree is drawn lighter and Quests' tunnel stands still.
 */
import { useUI } from '../state/uiStore';

export const spaceHealth = { degraded: false };

/** Lighter motion: Settings → Space says flat, or says automatic and this device was found slow. */
export function lighter(): boolean {
  const mode = useUI.getState().spaceMode;
  return mode === 'off' || (mode === 'auto' && spaceHealth.degraded);
}

/**
 * Watch a running animation's frames: two consecutive 2.5 s windows averaging under ~33 fps (as the Map's space
 * judges) mean this device is slow. Feed it each frame's time and the gap since the last; it says when it finds so.
 */
export function slowWatch() {
  let since = 0;
  let sum = 0;
  let n = 0;
  let strikes = 0;
  return (now: number, gap: number): boolean => {
    if (document.hidden || gap > 250) return false;
    if (!since) since = now;
    sum += gap;
    n++;
    if (now - since < 2500) return false;
    strikes = sum / n > 30 ? strikes + 1 : 0;
    since = now;
    sum = n = 0;
    return strikes >= 2;
  };
}

/**
 * Draw no more often than the drawing leaves the page room for everything else. What a draw costs is read from the
 * frame that follows it (so the painting the browser does after the script counts too); a draw that costs more than
 * a frame waits, before the next, as long again as it took, so half the time is left for scrolling and taps. A
 * device that keeps up draws every frame.
 */
export function drawPacer() {
  let cost = 0;
  let last = -Infinity;
  let drewAt = 0;
  return {
    due(now: number): boolean {
      if (drewAt) {
        const took = now - drewAt;
        cost = cost ? cost * 0.8 + took * 0.2 : took;
        drewAt = 0;
      }
      return cost <= 20 || now - last >= cost * 2;
    },
    drew(now: number) {
      last = drewAt = now;
    },
    /** What a draw costs, as last read (ms). */
    cost: () => cost,
  };
}
