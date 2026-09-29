import type { DomainKey } from '../../domain/types';
import { DOMAIN_ICONS } from '../icons';

/** An area of life's mark (see icons.tsx), at any size, in its own colour. */
export function DomainGlyph({ domain, size = 24, color, strokeWidth = 1.3 }: { domain: DomainKey; size?: number; color?: string; strokeWidth?: number }) {
  const Mark = DOMAIN_ICONS[domain];
  return <Mark size={size} color={color} strokeWidth={strokeWidth} aria-hidden />;
}
