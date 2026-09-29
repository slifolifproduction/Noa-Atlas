import { useStoreApi } from '@xyflow/react';
import { useEffect, useRef } from 'react';

/**
 * Deep space behind (and a little in front of) the graph, always moving.
 *
 * The scene cruises slowly forward: stars come out of the distance, drift
 * outward from the middle of the view and pass by; nebulae slide past very
 * slowly; a little dust streams by in front of the graph; now and then a faint
 * meteor crosses. Panning, zooming and the camera's turn (shared with the
 * space engine in graph/space.ts) add parallax on top.
 *
 * Behind the graph are two canvases: an opaque backdrop (nebulae pre-rendered
 * once per resize, plus the vignette), repainted only after a half-pixel
 * shift, and a transparent star layer redrawn each frame. The dust is a
 * handful of tiny DOM layers moved by transform. Nothing re-renders React.
 * In `lite` mode (devices that were stepped down to flat) the cruise is slower
 * and redrawn at ~20 fps, and there is no dust.
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
}

interface Mote {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  /** Where the camera was (graph units) when this mote appeared; pans move it from there. */
  fx: number;
  fy: number;
}

interface Meteor {
  x: number;
  y: number;
  dx: number;
  dy: number;
  start: number;
  dur: number;
}

const CANVAS = '#0a0c0f';
const NEBULAE = [
  { x: -0.2, y: -0.2, size: 1.2, color: [64, 92, 140], alpha: 0.3 },
  { x: 0.34, y: 0.16, size: 1.0, color: [40, 104, 112], alpha: 0.24 },
  { x: -0.04, y: 0.44, size: 0.85, color: [88, 72, 132], alpha: 0.2 },
  { x: 0.46, y: -0.38, size: 0.6, color: [70, 86, 120], alpha: 0.16 },
];
const MOTE_COUNT = 10;

/** Forward cruise: distance units per second (a star takes ~40 s to pass). */
const CRUISE = 1 / 38;
const Z_NEAR = 0.06;
/** Nebulae are soft, so their backdrop is rendered at reduced resolution and scaled up. */
const HAZE_RES = 0.5;
const rgba = ([r, g, b]: number[], a: number) => `rgba(${r},${g},${b},${a})`;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * `camera` is the space engine's eased look direction, shared so stars, dust,
 * nodes and rings all turn with one camera.
 */
export function SpaceField({ reduced, camera, lite = false }: { reduced: boolean; camera: { lx: number; ly: number }; lite?: boolean }) {
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
    let spreadX = 1;
    let spreadY = 1;
    let margin = 0;
    let stars: Star[] = [];
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let bgKey = '';
    let meteor: Meteor | null = null;
    let nextMeteor = performance.now() + 9000 + Math.random() * 12000;
    const moteEls = moteRefs.current.slice();
    let camFx = 0;
    let camFy = 0;
    const motes: Mote[] = [];

    const haze = document.createElement('canvas');
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
    const spawn = (s: Partial<Star>, anywhere: boolean): Star => {
      const bright = rand() < 0.025;
      return Object.assign(s, {
        x: (rand() * 2 - 1) * spreadX,
        y: (rand() * 2 - 1) * spreadY,
        z: anywhere ? Z_NEAR + rand() * (1 - Z_NEAR) : 0.85 + rand() * 0.15,
        r: 0.28 + rand() * 0.42,
        a: 0.35 + rand() * 0.45,
        bright,
        cool: rand() < 0.7,
      }) as Star;
    };
    const spawnMote = (m: Partial<Mote>, anywhere: boolean): Mote =>
      Object.assign(m, {
        x: (rand() * 2 - 1) * 1.4,
        y: (rand() * 2 - 1) * 1.4,
        z: anywhere ? 0.2 + rand() * 0.8 : 1,
        size: 4 + rand() * 6,
        alpha: 0.18 + rand() * 0.14,
        fx: camFx,
        fy: camFy,
      }) as Mote;

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
      // Far stars (z ≈ 1) must already cover the whole screen, so the field stays even as it flows.
      const R = Math.max(w, h) * 0.5;
      spreadX = ((w / 2 + 40) * 1.6) / R;
      spreadY = ((h / 2 + 40) * 1.6) / R;
      seed = 23;
      const count = Math.min(420, Math.round((w * h) / 3600));
      stars = Array.from({ length: count }, () => spawn({}, true));
      motes.length = 0;
      for (let i = 0; i < MOTE_COUNT; i++) motes.push(spawnMote({}, true));

      // Nebulae: painted once, a margin larger than the view so drift, zoom and look never show an edge.
      const base = Math.max(w, h);
      margin = Math.round(base * 0.12 + 140);
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
    };

    const draw = (now: number, dt: number) => {
      if (!w || !h) return;
      const [tx, ty, k] = store.getState().transform;
      // Where the camera looks, in graph units: pans slide near stars more than far ones.
      const fx = (w / 2 - tx) / k;
      const fy = (h / 2 - ty) / k;
      camFx = fx;
      camFy = fy;
      const still = reduced;
      const lx = still ? 0 : camera.lx;
      const ly = still ? 0 : camera.ly;
      const t = now / 1000;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.max(w, h) * 0.5;
      const zoom = still ? 1 : Math.min(1.25, Math.max(0.85, k ** 0.18));

      // Nebulae slide past very slowly, and shift with the camera's turn.
      const hs = still ? 1 : Math.round(k ** 0.06 * 500) / 500;
      const hx = still ? 0 : Math.round((lx * 20 + 22 * Math.sin(t / 47)) * 2) / 2;
      const hy = still ? 0 : Math.round((ly * 15 + 14 * Math.cos(t / 61)) * 2) / 2;
      const key = `${hs}:${hx}:${hy}`;
      if (key !== bgKey) {
        bgKey = key;
        bg.fillStyle = CANVAS;
        bg.fillRect(0, 0, w, h);
        bg.drawImage(haze, w / 2 - (margin + w / 2) * hs + hx, h / 2 - (margin + h / 2) * hs + hy, (w + margin * 2) * hs, (h + margin * 2) * hs);
        bg.drawImage(vignette, 0, 0, w, h);
      }

      ctx.clearRect(0, 0, w, h);
      const speed = still ? 0 : CRUISE * (lite ? 0.6 : 1);
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
        // Stars fade in from the distance and grow a little as they pass.
        const alpha = s.a * smooth(1, 0.8, s.z) * (0.55 + 0.45 * near);
        const r = s.r * (0.7 + 1.4 * near * near);
        if (s.bright) {
          const size = 8 + 14 * near;
          ctx.globalAlpha = alpha * 0.7;
          ctx.drawImage(glow, px - size / 2, py - size / 2, size, size);
        }
        const colour = s.cool ? '#b6c2cf' : '#e2eaf3';
        if (colour !== fill) ctx.fillStyle = fill = colour;
        ctx.globalAlpha = alpha;
        if (r < 0.95) ctx.fillRect(px - r, py - r, r * 2, r * 2);
        else {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Now and then a faint meteor.
      if (!still && !lite) {
        if (!meteor && now > nextMeteor) {
          const fromLeft = Math.random() < 0.5;
          const angle = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.4;
          meteor = {
            x: w * (0.15 + Math.random() * 0.7),
            y: h * (0.08 + Math.random() * 0.35),
            dx: Math.cos(angle),
            dy: Math.sin(angle),
            start: now,
            dur: 900 + Math.random() * 500,
          };
          nextMeteor = now + 14000 + Math.random() * 18000;
        }
        if (meteor) {
          const p = (now - meteor.start) / meteor.dur;
          if (p >= 1) meteor = null;
          else {
            const len = 160;
            const hx2 = meteor.x + meteor.dx * p * 420;
            const hy2 = meteor.y + meteor.dy * p * 420;
            const mg = ctx.createLinearGradient(hx2 - meteor.dx * len, hy2 - meteor.dy * len, hx2, hy2);
            const a = Math.sin(p * Math.PI) * 0.55;
            mg.addColorStop(0, 'rgba(210,228,248,0)');
            mg.addColorStop(1, `rgba(226,236,248,${a.toFixed(3)})`);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = mg;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(hx2 - meteor.dx * len, hy2 - meteor.dy * len);
            ctx.lineTo(hx2, hy2);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // In front of the graph: dust streams past, faster than the stars and outrunning pans.
      if (!still && !lite) {
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          const node = moteEls[i];
          if (!node) continue;
          m.z -= CRUISE * 2.2 * dt;
          const near = 1 - m.z;
          // Dust is close: it outruns pans, and what a pan sweeps off screen is replaced far ahead.
          const px = cx + (m.x / m.z) * R * 0.35 - (fx - m.fx) * k * 1.2 - lx * 90;
          const py = cy + (m.y / m.z) * R * 0.35 - (fy - m.fy) * k * 1.2 - ly * 65;
          if (m.z < 0.12 || px < -120 || px > w + 120 || py < -120 || py > h + 120) spawnMote(m, false);
          const size = m.size * (0.6 + 2.2 * near * near);
          node.style.opacity = (m.alpha * smooth(1, 0.75, m.z) * smooth(0.12, 0.3, m.z)).toFixed(3);
          node.style.transform = `translate3d(${(px - size / 2).toFixed(1)}px, ${(py - size / 2).toFixed(1)}px, 0) scale(${(size / 20).toFixed(4)})`;
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Lite mode keeps the cruise but at ~20 fps.
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
    <>
      <div className="atlas-space pointer-events-none absolute inset-0" aria-hidden>
        <canvas ref={backdrop} className="absolute inset-0 h-full w-full" />
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      </div>
      {!reduced && !lite && (
        <div className="atlas-front pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: MOTE_COUNT }, (_, i) => (
            <div
              key={i}
              ref={(el) => void (moteRefs.current[i] = el)}
              className="atlas-mote"
              style={{ background: 'radial-gradient(closest-side, rgb(220 232 248 / 1), rgb(220 232 248 / 0.35) 55%, transparent)', opacity: 0 }}
            />
          ))}
        </div>
      )}
    </>
  );
}
