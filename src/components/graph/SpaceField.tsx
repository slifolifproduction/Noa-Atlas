import { useStoreApi } from '@xyflow/react';
import { useEffect, useRef } from 'react';

/**
 * Deep space behind (and a little in front of) the graph, always moving.
 *
 * The scene cruises forward and rolls very slowly: stars come out of the
 * distance, stream outward from the middle of the view and pass by (the
 * nearest leave short trails), and many of them twinkle. Nebulae drift, turn
 * and breathe, each on its own slow cycle; a distant galaxy turns; dust
 * streams by in front of the graph; meteors cross now and then. Panning,
 * zooming and the camera's turn (shared with the space engine in
 * graph/space.ts) add parallax on top.
 *
 * Behind the graph are two canvases: an opaque backdrop at half resolution
 * (nebulae and the galaxy are soft, so it is cheap to redraw ~20 times a
 * second), and a transparent star layer redrawn each frame. The dust is a
 * handful of tiny DOM layers moved by transform. Nothing re-renders React.
 * In `lite` mode (devices that were stepped down to flat) everything still
 * moves, redrawn at a lower rate, without the dust.
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
  len: number;
  reach: number;
}

const CANVAS = '#0a0c0f';
const TAU = Math.PI * 2;
/**
 * Each nebula drifts on its own slow orbit (amplitude in px, period in s), turns
 * (seconds per turn, sign = direction) and breathes in size and brightness.
 */
const NEBULAE = [
  { x: -0.22, y: -0.2, size: 1.25, color: [64, 96, 150], alpha: 0.34, drift: [70, 46], period: [83, 101], turn: 520, breathe: 29 },
  { x: 0.34, y: 0.16, size: 1.05, color: [36, 110, 118], alpha: 0.28, drift: [60, 52], period: [97, 71], turn: -610, breathe: 37 },
  { x: -0.06, y: 0.46, size: 0.9, color: [96, 70, 142], alpha: 0.26, drift: [80, 40], period: [67, 89], turn: 450, breathe: 23 },
  { x: 0.48, y: -0.36, size: 0.7, color: [76, 88, 132], alpha: 0.2, drift: [50, 60], period: [113, 79], turn: -700, breathe: 41 },
  { x: -0.5, y: 0.3, size: 0.65, color: [120, 64, 110], alpha: 0.14, drift: [44, 58], period: [73, 107], turn: 380, breathe: 31 },
];
/** A far spiral galaxy, tilted, turning slowly in its own plane. */
const GALAXY = { x: 0.38, y: -0.2, size: 0.2, tilt: -0.5, flat: 0.42, turn: 240, alpha: 0.55 };
const MOTE_COUNT = 14;

/** Forward cruise: distance units per second (a star takes ~16 s to pass). */
const CRUISE = 1 / 16;
/** The whole field rolls slowly around the view's centre (seconds per turn). */
const ROLL = 900;
const Z_NEAR = 0.06;
/** Nebulae are soft, so the backdrop is rendered at reduced resolution and scaled up. */
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
    let stars: Star[] = [];
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let lastBg = 0;
    let base = 1;
    let nebulae: { canvas: HTMLCanvasElement; size: number; phase: number }[] = [];
    let meteor: Meteor | null = null;
    let nextMeteor = performance.now() + 2500 + Math.random() * 4000;
    const moteEls = moteRefs.current.slice();
    let camFx = 0;
    let camFy = 0;
    const motes: Mote[] = [];

    const galaxy = document.createElement('canvas');
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
      const bright = rand() < 0.03;
      return Object.assign(s, {
        x: (rand() * 2 - 1) * spreadX,
        y: (rand() * 2 - 1) * spreadY,
        z: anywhere ? Z_NEAR + rand() * (1 - Z_NEAR) : 0.85 + rand() * 0.15,
        r: 0.28 + rand() * 0.45,
        a: 0.38 + rand() * 0.5,
        bright,
        cool: rand() < 0.7,
        tw: rand() < 0.45 ? 0.3 + rand() * 0.45 : 0,
        tf: 0.6 + rand() * 2.2,
        tp: rand() * TAU,
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
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      bgEl.width = Math.ceil(w * HAZE_RES);
      bgEl.height = Math.ceil(h * HAZE_RES);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bg.setTransform(HAZE_RES, 0, 0, HAZE_RES, 0, 0);
      lastBg = 0;
      // Far stars (z ≈ 1) must already cover the whole screen, so the field stays even as it flows.
      const R = Math.max(w, h) * 0.5;
      spreadX = ((w / 2 + 40) * 1.6) / R;
      spreadY = ((h / 2 + 40) * 1.6) / R;
      seed = 23;
      const count = Math.min(420, Math.round((w * h) / 3600));
      stars = Array.from({ length: count }, () => spawn({}, true));
      motes.length = 0;
      for (let i = 0; i < MOTE_COUNT; i++) motes.push(spawnMote({}, true));

      // Nebulae: one soft, lumpy cloud sprite each, painted once per resize and then moved every frame.
      base = Math.max(w, h);
      nebulae = NEBULAE.map((n, i) => {
        const size = n.size * base;
        const px = Math.max(8, Math.ceil(size * HAZE_RES));
        const c = document.createElement('canvas');
        c.width = c.height = px;
        const nc = c.getContext('2d')!;
        nc.scale(px / size, px / size);
        const lumps = 6;
        for (let j = 0; j < lumps; j++) {
          const a = rand() * TAU;
          // Every lump stays inside the sprite, so no rotated edge ever shows.
          const d = j === 0 ? 0 : 0.08 + rand() * 0.14;
          const cx = size / 2 + Math.cos(a) * d * size;
          const cy = size / 2 + Math.sin(a) * d * size;
          const r = (j === 0 ? 0.5 : Math.min(0.2 + rand() * 0.2, 0.49 - d)) * size;
          const alpha = j === 0 ? n.alpha * 0.8 : n.alpha * (0.35 + rand() * 0.4);
          const ng = nc.createRadialGradient(cx, cy, 0, cx, cy, r);
          ng.addColorStop(0, rgba(n.color, alpha));
          ng.addColorStop(0.5, rgba(n.color, alpha * 0.4));
          ng.addColorStop(1, rgba(n.color, 0));
          nc.fillStyle = ng;
          nc.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        return { canvas: c, size, phase: i * 1.7 + rand() * 2 };
      });

      // The galaxy: a bright core and two logarithmic arms of scattered points, drawn face-on.
      const gs = GALAXY.size * base;
      const gpx = Math.max(8, Math.ceil(gs * 0.75));
      galaxy.width = galaxy.height = gpx;
      const gc = galaxy.getContext('2d')!;
      gc.setTransform(gpx / gs, 0, 0, gpx / gs, gpx / 2, gpx / 2);
      const core = gc.createRadialGradient(0, 0, 0, 0, 0, gs * 0.2);
      core.addColorStop(0, 'rgba(236,232,255,0.9)');
      core.addColorStop(0.25, 'rgba(190,196,236,0.4)');
      core.addColorStop(1, 'rgba(150,160,220,0)');
      gc.fillStyle = core;
      gc.fillRect(-gs / 2, -gs / 2, gs, gs);
      for (let arm = 0; arm < 2; arm++) {
        for (let j = 0; j < 260; j++) {
          const f = j / 260;
          const theta = f * TAU * 1.35 + arm * Math.PI;
          const rr = gs * (0.04 + 0.43 * f);
          const spread = gs * 0.035 * (0.4 + f) * (rand() * 2 - 1);
          const px2 = Math.cos(theta) * rr + spread * Math.sin(theta);
          const py2 = Math.sin(theta) * rr - spread * Math.cos(theta);
          gc.globalAlpha = (1 - f) * (0.25 + rand() * 0.5);
          gc.fillStyle = rand() < 0.2 ? '#f0d9ef' : '#c9d6f5';
          const sz = gs * (0.006 + rand() * 0.01);
          gc.fillRect(px2 - sz / 2, py2 - sz / 2, sz, sz);
        }
      }
      gc.globalAlpha = 1;

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

      // The whole field rolls slowly around the centre of the view.
      const roll = still ? 0 : (t * TAU) / ROLL;
      const rc = Math.cos(roll);
      const rs = Math.sin(roll);

      // Backdrop: nebulae drift, turn and breathe; the galaxy turns. Soft, so ~20 (lite ~10) redraws a second.
      if (still ? lastBg === 0 : now - lastBg > (lite ? 95 : 45)) {
        lastBg = now;
        bg.globalAlpha = 1;
        bg.fillStyle = CANVAS;
        bg.fillRect(0, 0, w, h);
        const hz = still ? 1 : k ** 0.06;
        // Far away: they barely slide with pans, and swing with the camera's turn.
        const px0 = still ? 0 : -fx * 0.012 + lx * 20;
        const py0 = still ? 0 : -fy * 0.012 + ly * 15;
        for (let i = 0; i < nebulae.length; i++) {
          const n = NEBULAE[i];
          const neb = nebulae[i];
          const ph = neb.phase;
          const ox = still ? 0 : n.drift[0] * Math.sin((t * TAU) / n.period[0] + ph);
          const oy = still ? 0 : n.drift[1] * Math.cos((t * TAU) / n.period[1] + ph * 1.3);
          const bx = n.x * base;
          const by = n.y * base;
          const nx = cx + (bx * rc - by * rs) * hz + ox + px0;
          const ny = cy + (bx * rs + by * rc) * hz + oy + py0;
          const breathe = still ? 1 : 1 + 0.09 * Math.sin((t * TAU) / n.breathe + ph);
          bg.globalAlpha = still ? 1 : 0.72 + 0.28 * Math.sin((t * TAU) / (n.breathe * 0.7) + ph * 2);
          bg.save();
          bg.translate(nx, ny);
          bg.rotate((still ? 0 : (t * TAU) / n.turn) + ph);
          const size = neb.size * breathe * hz;
          bg.drawImage(neb.canvas, -size / 2, -size / 2, size, size);
          bg.restore();
        }
        const gbx = GALAXY.x * base;
        const gby = GALAXY.y * base;
        bg.globalAlpha = GALAXY.alpha;
        bg.save();
        bg.translate(cx + (gbx * rc - gby * rs) * hz + px0 * 1.4, cy + (gbx * rs + gby * rc) * hz + py0 * 1.4);
        bg.rotate(GALAXY.tilt + roll);
        bg.scale(1, GALAXY.flat);
        bg.rotate(still ? 0 : (t * TAU) / GALAXY.turn);
        const gsz = GALAXY.size * base * hz;
        bg.drawImage(galaxy, -gsz / 2, -gsz / 2, gsz, gsz);
        bg.restore();
        bg.globalAlpha = 1;
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
        const sx = s.x * rc - s.y * rs;
        const sy = s.x * rs + s.y * rc;
        const px = cx + ((sx / s.z) * R * zoom) / 1.6 + ox;
        const py = cy + ((sy / s.z) * R * zoom) / 1.6 + oy;
        if (s.z < Z_NEAR || px < -30 || px > w + 30 || py < -30 || py > h + 30) {
          if (!still) spawn(s, false);
          continue;
        }
        // Stars fade in from the distance, grow a little as they pass, and some twinkle.
        const twinkle = still || !s.tw ? 1 : 1 - s.tw * (0.5 + 0.5 * Math.sin(t * s.tf * TAU * 0.5 + s.tp));
        const alpha = s.a * smooth(1, 0.8, s.z) * (0.55 + 0.45 * near) * twinkle;
        const r = s.r * (0.7 + 1.4 * near * near);
        // The nearest stars leave a short trail back toward where they came from.
        if (!still && near > 0.62) {
          const zb = s.z + speed * 0.35;
          const qx = cx + ((sx / zb) * R * zoom) / 1.6 + ox;
          const qy = cy + ((sy / zb) * R * zoom) / 1.6 + oy;
          ctx.globalAlpha = alpha * 0.45;
          ctx.strokeStyle = s.cool ? '#b6c2cf' : '#e2eaf3';
          ctx.lineWidth = Math.max(0.6, r * 0.9);
          ctx.beginPath();
          ctx.moveTo(qx, qy);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
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

      // Meteors cross now and then.
      if (!still) {
        if (!meteor && now > nextMeteor) {
          const fromLeft = Math.random() < 0.5;
          const angle = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.4;
          meteor = {
            x: w * (0.15 + Math.random() * 0.7),
            y: h * (0.08 + Math.random() * 0.35),
            dx: Math.cos(angle),
            dy: Math.sin(angle),
            start: now,
            dur: 800 + Math.random() * 700,
            len: 140 + Math.random() * 140,
            reach: 360 + Math.random() * 260,
          };
          nextMeteor = now + (lite ? 9000 : 5000) + Math.random() * (lite ? 12000 : 9000);
        }
        if (meteor) {
          const p = (now - meteor.start) / meteor.dur;
          if (p >= 1) meteor = null;
          else {
            const len = meteor.len;
            const hx2 = meteor.x + meteor.dx * p * meteor.reach;
            const hy2 = meteor.y + meteor.dy * p * meteor.reach;
            const mg = ctx.createLinearGradient(hx2 - meteor.dx * len, hy2 - meteor.dy * len, hx2, hy2);
            const a = Math.sin(p * Math.PI) * 0.7;
            mg.addColorStop(0, 'rgba(210,228,248,0)');
            mg.addColorStop(1, `rgba(226,236,248,${a.toFixed(3)})`);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = mg;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(hx2 - meteor.dx * len, hy2 - meteor.dy * len);
            ctx.lineTo(hx2, hy2);
            ctx.stroke();
            ctx.globalAlpha = a;
            ctx.drawImage(glow, hx2 - 7, hy2 - 7, 14, 14);
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
