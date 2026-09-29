import { useStoreApi } from '@xyflow/react';
import { useEffect, useRef } from 'react';

/**
 * Quiet deep space behind the graph, so the graph stays the subject.
 *
 * A sparse field of small stars drifts slowly toward the viewer and a few of
 * them twinkle; two faint hazes and a vignette give depth without adding
 * colour. It answers you rather than performing on its own: the camera's turn
 * (shared with the space engine in graph/space.ts), pans and zooms add
 * parallax.
 *
 * Two canvases: an opaque backdrop at half resolution (hazes and vignette,
 * repainted only after a half-pixel shift) and a transparent star layer
 * redrawn each frame. Nothing re-renders React. In `lite` mode (devices that
 * were stepped down to flat) the field is redrawn at ~20 fps.
 */

interface Star {
  x: number;
  y: number;
  /** Distance: 1 = far, approaching 0 = passing the camera. */
  z: number;
  r: number;
  a: number;
  bright: boolean;
  cool: boolean;
  /** Twinkle: depth (0 = steady), rate and phase. */
  tw: number;
  tf: number;
  tp: number;
}

const CANVAS = '#0a0c0f';
const TAU = Math.PI * 2;
/** Two faint, cool hazes that drift a little over a couple of minutes. */
const HAZES = [
  { x: -0.24, y: -0.2, size: 1.3, color: [58, 84, 128], alpha: 0.2, drift: 34, period: 140 },
  { x: 0.34, y: 0.3, size: 1.1, color: [40, 90, 104], alpha: 0.12, drift: 28, period: 175 },
];

/** Forward cruise: distance units per second (a star takes ~30 s to pass). */
const CRUISE = 1 / 30;
const Z_NEAR = 0.06;
/** The backdrop is soft, so it is rendered at reduced resolution and scaled up. */
const HAZE_RES = 0.5;
const rgba = ([r, g, b]: number[], a: number) => `rgba(${r},${g},${b},${a})`;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * `camera` is the space engine's eased look direction, shared so stars,
 * nodes and rings all turn with one camera.
 */
export function SpaceField({ reduced, camera, lite = false }: { reduced: boolean; camera: { lx: number; ly: number }; lite?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const store = useStoreApi();

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    const bgEl = backdrop.current;
    const bg = bgEl?.getContext('2d', { alpha: false });
    if (!el || !ctx || !bgEl || !bg) return;

    let w = 0;
    let h = 0;
    let base = 1;
    let spreadX = 1;
    let spreadY = 1;
    let stars: Star[] = [];
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let bgKey = '';

    const vignette = document.createElement('canvas');
    // A soft glow sprite for the few bright stars.
    const glow = document.createElement('canvas');
    glow.width = glow.height = 32;
    const g = glow.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(226,236,248,0.9)');
    grad.addColorStop(0.18, 'rgba(200,218,240,0.35)');
    grad.addColorStop(1, 'rgba(200,218,240,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);

    let seed = 23;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    /** A star somewhere in the volume (on first fill) or at the far end (respawn). */
    const spawn = (s: Partial<Star>, anywhere: boolean): Star =>
      Object.assign(s, {
        x: (rand() * 2 - 1) * spreadX,
        y: (rand() * 2 - 1) * spreadY,
        z: anywhere ? Z_NEAR + rand() * (1 - Z_NEAR) : 0.85 + rand() * 0.15,
        r: 0.25 + rand() * 0.4,
        a: 0.3 + rand() * 0.4,
        bright: rand() < 0.015,
        cool: rand() < 0.7,
        tw: rand() < 0.25 ? 0.2 + rand() * 0.25 : 0,
        tf: 0.3 + rand() * 0.7,
        tp: rand() * TAU,
      }) as Star;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      if (!w || !h) return;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      bgEl.width = Math.ceil(w * HAZE_RES);
      bgEl.height = Math.ceil(h * HAZE_RES);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bg.setTransform(HAZE_RES, 0, 0, HAZE_RES, 0, 0);
      bgKey = '';
      base = Math.max(w, h);
      // Far stars (z ≈ 1) must already cover the whole screen, so the field stays even as it flows.
      const R = base * 0.5;
      spreadX = ((w / 2 + 40) * 1.6) / R;
      spreadY = ((h / 2 + 40) * 1.6) / R;
      seed = 23;
      const count = Math.min(260, Math.round((w * h) / 5200));
      stars = Array.from({ length: count }, () => spawn({}, true));

      // Vignette: the edges of space fall off into darkness, so the eye settles on the graph.
      vignette.width = Math.ceil(w * HAZE_RES);
      vignette.height = Math.ceil(h * HAZE_RES);
      const vc = vignette.getContext('2d')!;
      const rx = w * 0.8;
      const ry = h * 0.75;
      vc.setTransform(HAZE_RES, 0, 0, HAZE_RES * (ry / rx), (w / 2) * HAZE_RES, (h / 2) * HAZE_RES);
      const vg = vc.createRadialGradient(0, 0, 0, 0, 0, rx);
      vg.addColorStop(0.45, 'rgba(4,5,7,0)');
      vg.addColorStop(1, 'rgba(4,5,7,0.66)');
      vc.fillStyle = vg;
      vc.fillRect(-w, -h * (rx / ry), w * 2, h * 2 * (rx / ry));
    };

    const draw = (now: number, dt: number) => {
      if (!w || !h) return;
      const [tx, ty, k] = store.getState().transform;
      // Where the camera looks, in graph units: pans slide near stars more than far ones.
      const fx = (w / 2 - tx) / k;
      const fy = (h / 2 - ty) / k;
      const still = reduced;
      const lx = still ? 0 : camera.lx;
      const ly = still ? 0 : camera.ly;
      const t = now / 1000;
      const cx = w / 2;
      const cy = h / 2;
      const R = base * 0.5;
      const zoom = still ? 1 : Math.min(1.25, Math.max(0.85, k ** 0.18));

      // Backdrop: the hazes drift, and shift with the camera's turn; repainted only after a half-pixel move.
      const hz = still ? 1 : Math.round(k ** 0.05 * 500) / 500;
      const offsets = HAZES.map((n, i) =>
        still
          ? [0, 0]
          : [
              Math.round((n.drift * Math.sin((t * TAU) / n.period + i * 2.1) + lx * 18 - fx * 0.01) * 2) / 2,
              Math.round((n.drift * 0.7 * Math.cos((t * TAU) / (n.period * 1.3) + i) + ly * 13 - fy * 0.01) * 2) / 2,
            ],
      );
      const key = `${hz}:${offsets.join(':')}`;
      if (key !== bgKey) {
        bgKey = key;
        bg.fillStyle = CANVAS;
        bg.fillRect(0, 0, w, h);
        HAZES.forEach((n, i) => {
          const x = cx + n.x * base * hz + offsets[i][0];
          const y = cy + n.y * base * hz + offsets[i][1];
          const r = (n.size * base * hz) / 2;
          const ng = bg.createRadialGradient(x, y, 0, x, y, r);
          ng.addColorStop(0, rgba(n.color, n.alpha));
          ng.addColorStop(0.55, rgba(n.color, n.alpha * 0.35));
          ng.addColorStop(1, rgba(n.color, 0));
          bg.fillStyle = ng;
          bg.fillRect(x - r, y - r, r * 2, r * 2);
        });
        bg.drawImage(vignette, 0, 0, w, h);
      }

      ctx.clearRect(0, 0, w, h);

      const speed = still ? 0 : CRUISE * (lite ? 0.75 : 1);
      let fill = '';
      for (const s of stars) {
        s.z -= speed * dt;
        const near = 1 - s.z;
        // Pan parallax (near stars slide further) and the camera turn (far stars swing further).
        const ox = still ? 0 : -fx * (0.02 + 0.16 * near) + lx * (14 + 30 * s.z);
        const oy = still ? 0 : -fy * (0.02 + 0.16 * near) + ly * (10 + 22 * s.z);
        const px = cx + ((s.x / s.z) * R * zoom) / 1.6 + ox;
        const py = cy + ((s.y / s.z) * R * zoom) / 1.6 + oy;
        if (s.z < Z_NEAR || px < -30 || px > w + 30 || py < -30 || py > h + 30) {
          if (!still) spawn(s, false);
          continue;
        }
        // Stars fade in from the distance, grow a little as they pass, and a few twinkle.
        const twinkle = still || !s.tw ? 1 : 1 - s.tw * (0.5 + 0.5 * Math.sin(t * s.tf * TAU + s.tp));
        const alpha = s.a * smooth(1, 0.8, s.z) * (0.55 + 0.45 * near) * twinkle;
        const r = s.r * (0.7 + 1.3 * near * near);
        if (s.bright) {
          const size = 7 + 10 * near;
          ctx.globalAlpha = alpha * 0.6;
          ctx.drawImage(glow, px - size / 2, py - size / 2, size, size);
        }
        const colour = s.cool ? '#b6c2cf' : '#e2eaf3';
        if (colour !== fill) ctx.fillStyle = fill = colour;
        ctx.globalAlpha = alpha;
        if (r < 0.95) ctx.fillRect(px - r, py - r, r * 2, r * 2);
        else {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Lite mode keeps the drift but at ~20 fps.
      if (lite && now - lastDraw < 48) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      lastDraw = now;
      draw(now, dt);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(performance.now(), 0);
    });
    ro.observe(el);
    resize();
    // With reduced motion space is still: drawn once, redrawn only when the view resizes.
    if (reduced) draw(performance.now(), 0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced, store, camera, lite]);

  return (
    <div className="atlas-space pointer-events-none absolute inset-0" aria-hidden>
      <canvas ref={backdrop} className="absolute inset-0 h-full w-full" />
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
