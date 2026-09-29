import type { AreaKey } from '../../domain/types';
import { AREA_ICONS } from '../icons';

/** An area of life's mark (see icons.tsx), at any size, in its own colour. */
export function AreaGlyph({ area, size = 24, color, strokeWidth = 1.3 }: { area: AreaKey; size?: number; color?: string; strokeWidth?: number }) {
  const Mark = AREA_ICONS[area];
  return <Mark size={size} color={color} strokeWidth={strokeWidth} aria-hidden />;
}
