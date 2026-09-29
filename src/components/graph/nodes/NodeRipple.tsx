import { HOP_MS, useMotion, useWave } from '../../../graph/motion';
import { cn } from '../../../lib/cn';

/**
 * The soft ring a node sends out when an activity wave starts from it or
 * reaches it. Hubs draw their own (in SVG); satellites, mind nodes and
 * patterns use this one.
 */
export function NodeRipple({ id, color, shape }: { id: string; color: string; shape: 'circle' | 'card' }) {
  const motion = useMotion();
  const living = motion.living && !motion.reduced;
  const wave = useWave(living, (w) => w.origin === id || w.reached.includes(id));
  if (!living || !wave) return null;
  const origin = wave.origin === id;
  return (
    <div
      key={wave.at}
      className={cn('node-ripple', shape === 'circle' ? 'is-circle' : 'is-card')}
      style={{ borderColor: color, ['--ripple' as string]: String(0.55 * (origin ? 1 : wave.strength)), animationDelay: origin ? '0ms' : `${HOP_MS}ms` }}
      aria-hidden
    />
  );
}
