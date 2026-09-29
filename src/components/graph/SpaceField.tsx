import { useStoreApi } from '@xyflow/react';
import { useEffect, useRef } from 'react';

/**
 * Deep space behind (and a little in front of) the graph.
 *
 * The graph sits in the middle of the scene. Behind it: faint nebulae, then
 * three depths of stars; in front of it: a little out-of-focus dust. Every
 * layer moves at its own rate when the camera pans, zooms or turns (see
 * graph/space.ts, whose camera this shares), which is what reads as depth.
 *
 * Behind the graph are two canvases: an opaque backdrop (nebulae pre-rendered
 * once per resize, plus the vignette) that is repainted only after a
 * half-pixel shift, and a transparent star layer. The dust is a handful of
 * tiny DOM layers moved by transform. Nothing re-renders React: one
 * requestAnimationFrame loop reads React Flow's store and the camera
 * directly, redraws every frame while the camera pans, zooms or turns, and
 * ~12 fps for the slow idle drift.
 */

interface Star {
  u: number;
  v: number;
  /** 0 (far) – 1 (near): speed, parallax, size and brightness. */
  d: number;
  r: number;
  a: number;
  bright: boolean;
}

const CANVAS = '#0a0c0f';
const NEBULAE = [
  { x: -0.2, y: -0.2, size: 1.2, color: [64, 92, 140], alpha: 0.3 },
  { x: 0.34, y: 0.16, size: 1.0, color: [40, 104, 112], alpha: 0.24 },
  { x: -0.04, y: 0.44, size: 0.85, color: [88, 72, 132], alpha: 0.2 },
  { x: 0.46, y: -0.38, size: 0.6, color: [70, 86, 120], alpha: 0.16 },
];
/** Out-of-focus dust just in front of the camera: small, soft, sparse. */
const MOTES = Array.from({ length: 14 }, (_, i) => ({
  u: (i * 0.618034) % 1,
  v: (i * 0.414214 + 0.27) % 1,
  size: 5 + ((i * 7) % 5) * 2.2,
  alpha: 0.2 + ((i * 3) % 4) * 0.05,
}));

const DRIFT = 2.4; // px/s for the nearest stars
/** Nebulae are soft, so their backdrop is rendered at reduced resolution and scaled up. */
const HAZE_RES = 0.5;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const rgba = ([r, g, b]: number[], a: number) => `rgba(${r},${g},${b},${a})`;

/**
 * `camera` is the space engine's eased look direction, shared so stars, dust,
 * nodes and rings all turn with one camera.
 */
export function SpaceField({ reduced, camera }: { reduced: boolean; camera: { lx: number; ly: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const moteRefs = useRef<(HTMLDivElement | null)[]>([]);
  const store = useStoreApi();

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    const bgEl = backdrop.current;
    const bg = bgEl?.getContext('2d', { alpha: false });
    if (!el || !ctx || !bgEl || !bg) return;

    let w = 0;
    let h = 0;
    let margin = 0;
    let stars: Star[] = [];
    let raf = 0;
    let lastDraw = 0;
    let drift = 0;
    let prev = [NaN, NaN, NaN];
    let dirty = true;
    let bgKey = '';
    let drawnLook = [0, 0];
    const motes = moteRefs.current.slice();

    const haze = document.createElement('canvas');
    const vignette = document.createElement('canvas');

    // A soft glow sprite for the few bright near stars.
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

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      if (!w || !h) return;
      el.width = bgEl.width = Math.round(w * dpr);
      el.height = bgEl.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bg.setTransform(dpr, 0, 0, dpr, 0, 0);
      bgKey = '';

      const count = Math.min(460, Math.round((w * h) / 3400));
      seed = 23;
      stars = Array.from({ length: count }, (_, i) => {
        const d = rand() ** 1.7; // most stars are far away
        const bright = i % 41 === 0;
        return { u: rand(), v: rand(), d: bright ? 0.75 + d * 0.25 : d, r: 0.3 + d * 0.85, a: 0.14 + d * 0.42 + rand() * 0.08, bright };
      }).sort((a, b) => a.d - b.d); // grouped by depth, so the fill colour changes once

      // Nebulae: painted once, a margin larger than the view so zoom and look never show an edge.
      const base = Math.max(w, h);
      margin = Math.round(base * 0.1 + 120);
      haze.width = Math.ceil((w + margin * 2) * HAZE_RES);
      haze.height = Math.ceil((h + margin * 2) * HAZE_RES);
      const hc = haze.getContext('2d')!;
      hc.setTransform(HAZE_RES, 0, 0, HAZE_RES, 0, 0);
      hc.fillStyle = CANVAS;
      hc.fillRect(0, 0, w + margin * 2, h + margin * 2);
      for (const n of NEBULAE) {
        const cx = margin + w / 2 + n.x * base;
        const cy = margin + h / 2 + n.y * base;
        const r = (n.size * base) / 2;
        const ng = hc.createRadialGradient(cx, cy, 0, cx, cy, r);
        ng.addColorStop(0, rgba(n.color, n.alpha));
        ng.addColorStop(0.55, rgba(n.color, n.alpha * 0.35));
        ng.addColorStop(1, rgba(n.color, 0));
        hc.fillStyle = ng;
        hc.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      // Vignette: the edges of space fall off into darkness. Fixed to the screen.
      vignette.width = Math.ceil(w * HAZE_RES);
      vignette.height = Math.ceil(h * HAZE_RES);
      const vc = vignette.getContext('2d')!;
      const rx = w * 0.8;
      const ry = h * 0.75;
      vc.setTransform(HAZE_RES, 0, 0, HAZE_RES * (ry / rx), (w / 2) * HAZE_RES, (h / 2) * HAZE_RES);
      const vg = vc.createRadialGradient(0, 0, 0, 0, 0, rx);
      vg.addColorStop(0.45, 'rgba(4,5,7,0)');
      vg.addColorStop(1, 'rgba(4,5,7,0.62)');
      vc.fillStyle = vg;
      vc.fillRect(-w, -h * (rx / ry), w * 2, h * 2 * (rx / ry));
      dirty = true;
    };

    const draw = () => {
      if (!w || !h) return;
      const [tx, ty, k] = store.getState().transform;
      // Where the camera looks, in graph units: pans move each star depth by its own factor.
      const fx = (w / 2 - tx) / k;
      const fy = (h / 2 - ty) / k;
      const still = reduced;
      const lx = still ? 0 : camera.lx;
      const ly = still ? 0 : camera.ly;
      drawnLook = [lx, ly];

      // Nebulae: so far away that panning does not move them; only zoom and the look direction
      // do, a little. Repainted only after a visible (half-pixel) shift.
      const hs = still ? 1 : Math.round(k ** 0.06 * 500) / 500;
      const hx = still ? 0 : Math.round(lx * 40) / 2;
      const hy = still ? 0 : Math.round(ly * 30) / 2;
      const key = `${hs}:${hx}:${hy}`;
      if (key !== bgKey) {
        bgKey = key;
        bg.fillStyle = CANVAS;
        bg.fillRect(0, 0, w, h);
        bg.drawImage(haze, w / 2 - (margin + w / 2) * hs + hx, h / 2 - (margin + h / 2) * hs + hy, (w + margin * 2) * hs, (h + margin * 2) * hs);
        bg.drawImage(vignette, 0, 0, w, h);
      }

      ctx.clearRect(0, 0, w, h);

      let fill = '';
      for (const s of stars) {
        const colour = s.d > 0.6 ? '#e2eaf3' : '#b6c2cf';
        if (colour !== fill) ctx.fillStyle = fill = colour;
        const pan = still ? 0 : 0.02 + s.d * 0.16;
        // Floored so a far zoom-out does not multiply the star count (and the work) without limit.
        const scale = still ? 1 : Math.max(0.8, k ** (0.1 + s.d * 0.32));
        // Behind the focal plane: as the camera turns about the graph, the farther a star the
        // more it swings (the same rule the engine applies to nodes behind the plane).
        const x = mod(s.u * w - fx * pan - drift * (0.15 + s.d) + lx * (16 + (1 - s.d) * 40), w);
        const y = mod(s.v * h - fy * pan + ly * (12 + (1 - s.d) * 30), h);
        const r = s.r * Math.sqrt(scale);
        // Zooming out shrinks the tile, so neighbouring copies fill the edges.
        const span = scale < 1 ? 1 : 0;
        for (let i = -span; i <= span; i++) {
          for (let j = -span; j <= span; j++) {
            const px = w / 2 + (x + i * w - w / 2) * scale;
            const py = h / 2 + (y + j * h - h / 2) * scale;
            if (px < -8 || px > w + 8 || py < -8 || py > h + 8) continue;
            if (s.bright) {
              const size = 11 + scale * 5;
              ctx.globalAlpha = 0.55;
              ctx.drawImage(glow, px - size / 2, py - size / 2, size, size);
            }
            ctx.globalAlpha = s.a;
            // Sub-pixel stars are indistinguishable from squares and far cheaper to fill.
            if (r < 0.95) ctx.fillRect(px - r, py - r, r * 2, r * 2);
            else {
              ctx.beginPath();
              ctx.arc(px, py, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      ctx.globalAlpha = 1;

      // In front of the focal plane: dust outruns the graph when panning and rushes outward when zooming in.
      if (!still) {
        const tw = w + 480;
        const th = h + 480;
        const s = k ** 1.25;
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          if (!m) continue;
          const x = mod(MOTES[i].u * tw - fx * k * 1.6 - drift * 3 - lx * 90, tw) - 240;
          const y = mod(MOTES[i].v * th - fy * k * 1.6 - ly * 65, th) - 240;
          const px = w / 2 + (x - w / 2) * s;
          const py = h / 2 + (y - h / 2) * s;
          const size = MOTES[i].size * Math.min(2.4, Math.max(0.5, s));
          m.style.transform = `translate3d(${(px - size / 2).toFixed(1)}px, ${(py - size / 2).toFixed(1)}px, 0) scale(${(size / 20).toFixed(4)})`;
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = store.getState().transform;
      const moved = dirty || t[0] !== prev[0] || t[1] !== prev[1] || t[2] !== prev[2];
      const turn = Math.abs(camera.lx - drawnLook[0]) + Math.abs(camera.ly - drawnLook[1]);
      // Pans and zooms redraw every frame so space keeps pace with the graph; a quick turn (the
      // pointer) too; a slow one (the idle sway) at ~15 fps; the drift alone (a few px/s) at ~12 fps.
      if (!moved && !(turn > 0.004) && now - lastDraw < (turn > 0.0008 ? 64 : 80)) return;
      drift += DRIFT * ((now - (lastDraw || now)) / 1000);
      lastDraw = now;
      prev = [t[0], t[1], t[2]];
      dirty = false;
      draw();
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    ro.observe(el);
    resize();
    // With reduced motion space is still: drawn once, redrawn only when the view resizes.
    if (reduced) draw();
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced, store, camera]);

  return (
    <>
      <div className="atlas-space pointer-events-none absolute inset-0" aria-hidden>
        <canvas ref={backdrop} className="absolute inset-0 h-full w-full" />
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      </div>
      {!reduced && (
        <div className="atlas-front pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {MOTES.map((m, i) => (
            <div
              key={i}
              ref={(el) => void (moteRefs.current[i] = el)}
              className="atlas-mote"
              style={{ background: `radial-gradient(closest-side, rgb(220 232 248 / ${m.alpha}), rgb(220 232 248 / ${m.alpha * 0.35}) 55%, transparent)` }}
            />
          ))}
        </div>
      )}
    </>
  );
}
