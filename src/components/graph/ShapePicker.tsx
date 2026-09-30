import { FIGURES, ZODIAC } from '../../graph/constellations';
import { ZODIAC_NAME, type MapShape } from '../../graph/shapes';
import { cn } from '../../lib/cn';
import { MenuItem, MenuLabel } from '../ui/Menu';
import { t } from '../../i18n';

/** A constellation's figure, small: its lines and its stars. */
function Thumb({ shape }: { shape: MapShape }) {
  if (shape === 'orbit') return null;
  const f = FIGURES[shape];
  return (
    <svg viewBox="-1.2 -1.2 2.4 2.4" className="h-[30px] w-[42px]" aria-hidden>
      {f.lines.map((l, i) => (
        <polyline
          key={i}
          points={l.map((k) => f.stars[k].join(',')).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {f.stars.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={Math.max(0.045, Math.min(0.11, 0.12 - 0.017 * f.mags[i]))} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * The Map's shape, in the View menu: the round orbit, or one of the twelve
 * constellations of the zodiac. Only where things sit changes. The menu
 * stays open, so the shapes can be tried one after another.
 */
export function ShapePicker({ value, onChange }: { value: MapShape; onChange(shape: MapShape): void }) {
  return (
    <div role="group" aria-label={t('Shape')}>
      <MenuLabel>{t('Shape')}</MenuLabel>
      <MenuItem radio checked={value === 'orbit'} keepOpen hint={t('Rings around you, one side per area of life')} onSelect={() => onChange('orbit')}>
        {t('Orbit')}
      </MenuItem>
      <div className="grid grid-cols-4 gap-1 px-1 pt-1 pb-1.5">
        {ZODIAC.map((key) => {
          const name = ZODIAC_NAME[key]();
          const on = value === key;
          return (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              tabIndex={-1}
              title={name}
              data-shape={key}
              onClick={() => onChange(key)}
              className={cn(
                'flex min-w-0 flex-col items-center gap-0.5 rounded-[2px] border px-0.5 pt-1 pb-0.5 outline-none focus-visible:border-accent/60',
                on ? 'border-accent/50 bg-accent/[0.08] text-ink' : 'border-transparent text-ink-3 hover:bg-ink/[0.05] hover:text-ink-2',
              )}
            >
              <Thumb shape={key} />
              <span className="w-full truncate text-center text-[10.5px] leading-tight">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
