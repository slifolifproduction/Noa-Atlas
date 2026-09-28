import { useStoreApi } from '@xyflow/react';
import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  /** 0 (far) – 1 (near): drives speed, parallax and brightness. */
  depth: number;
  alpha: number;
}

const DRIFT = 2.2; // px per second for the nearest layer

/**
 * A very quiet deep-space backdrop. Drawn on a canvas with requestAnimationFrame;
 * it reads the graph viewport from React Flow's store directly so panning adds a
 * faint parallax without re-rendering anything.
 */
export function StarField({ reduced }: { reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const store = useStoreApi();

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let seed = 11;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(200, Math.round((w * h) / 8000));
      seed = 11;
      stars = Array.from({ length: count }, () => {
        const depth = rand() ** 1.8; // most stars are far away
        return { x: rand() * w, y: rand() * h, r: 0.35 + depth * 0.75, depth, alpha: 0.12 + depth * 0.33 + rand() * 0.08 };
      });
      draw(0);
    };

    const draw = (dt: number) => {
      const [vx, vy] = store.getState().transform;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.x -= DRIFT * (0.15 + s.depth) * dt;
        if (s.x < -2) s.x += w + 4;
        // Parallax: near stars follow the camera a little, far ones barely.
        const px = (((s.x + vx * s.depth * 0.04) % w) + w) % w;
        const py = (((s.y + vy * s.depth * 0.04) % h) + h) % h;
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.depth > 0.6 ? '#dfe7f0' : '#b9c4d1';
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // The drift is only a few pixels per second, so ~20 fps is indistinguishable and a fraction of the work.
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 48) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      draw(dt);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    // With reduced motion the field is drawn once and redrawn only on pan/zoom.
    const unsub = reduced ? store.subscribe(() => draw(0)) : undefined;
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsub?.();
    };
  }, [reduced, store]);

  return <canvas ref={canvas} className="atlas-stars pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
