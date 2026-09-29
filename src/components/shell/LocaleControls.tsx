import { Languages } from 'lucide-react';
import { LANGUAGES, setLang, t, useLang, type Lang } from '../../i18n';
import { clockParts, deviceZone, setZone, TIME_ZONES, timeZone, useNow, useZone, zoneAbbr, zoneLabel, zoneOffset, type ZoneSetting } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { Menu, MenuItem, MenuLabel } from '../ui/Menu';

const SHORT: Record<Lang, string> = { en: 'EN', id: 'ID' };

/** The interface language, as a two-letter switch in the top bar. */
export function LanguageMenu({ className }: { className?: string }) {
  const lang = useLang();
  return (
    <Menu
      label={t('Language')}
      icon={Languages}
      display={<span className="num text-[11px] tracking-[0.12em]">{SHORT[lang]}</span>}
      chevron={false}
      width="w-56"
      className={cn('border-transparent bg-transparent', className)}
    >
      <MenuLabel>{t('Language')}</MenuLabel>
      <LanguageItems />
    </Menu>
  );
}

/** The two languages as radio items, for any menu. */
export function LanguageItems() {
  const lang = useLang();
  return (
    <>
      {LANGUAGES.map((l) => (
        <MenuItem key={l.key} radio checked={lang === l.key} onSelect={() => setLang(l.key)}>
          {l.name}
        </MenuItem>
      ))}
    </>
  );
}

const ZONES: ZoneSetting[] = ['auto', ...TIME_ZONES.map((z) => z.id)];
const idOf = (setting: ZoneSetting) => (setting === 'auto' ? deviceZone() : setting);

/**
 * The live clock in the top bar, read in the chosen time zone. Opening it
 * shows the six places side by side, like the wall of clocks in a control
 * room; choosing one moves everything that depends on the date with it.
 */
export function WorldClock({ className }: { className?: string }) {
  const now = useNow();
  const setting = useZone();
  const id = timeZone();
  const c = clockParts(now, id);
  return (
    <Menu
      label={t('Time zone: {zone}', { zone: zoneLabel(setting) })}
      display={
        <span className="num flex items-baseline gap-1.5 tabular-nums">
          <span className="text-[12px] tracking-[0.06em] text-ink-2">
            {c.h}:{c.m}
            <span className="hidden text-ink-3 sm:inline">:{c.s}</span>
          </span>
          <span className="text-[10px] tracking-[0.14em] text-ink-3">{zoneAbbr(id, now)}</span>
        </span>
      }
      chevron={false}
      width="w-[300px]"
      className={cn('border-transparent bg-transparent', className)}
    >
      <MenuLabel>{t('Time zone')}</MenuLabel>
      {ZONES.map((z) => (
        <ZoneItem key={z} setting={z} now={now} checked={setting === z} />
      ))}
      <p className="px-2.5 pt-1.5 pb-1 text-[11px] leading-snug text-ink-3">{t('Today, note dates, weeks and experiment days follow this clock.')}</p>
    </Menu>
  );
}

function ZoneItem({ setting, now, checked }: { setting: ZoneSetting; now: Date; checked: boolean }) {
  const id = idOf(setting);
  const c = clockParts(now, id);
  return (
    <MenuItem radio checked={checked} keepOpen onSelect={() => setZone(setting)} hint={`${zoneAbbr(id, now)} · ${zoneOffset(id, now)}`}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{zoneLabel(setting)}</span>
        <span className="num shrink-0 text-[12px] text-ink-2 tabular-nums">
          {c.h}:{c.m}
        </span>
      </span>
    </MenuItem>
  );
}

/** The same choice as a list of cards, for Settings. */
export function ZonePicker() {
  const now = useNow();
  const setting = useZone();
  return (
    <div role="radiogroup" aria-label={t('Time zone')} className="grid gap-2 sm:grid-cols-2">
      {ZONES.map((z) => {
        const id = idOf(z);
        const c = clockParts(now, id);
        const on = setting === z;
        return (
          <label
            key={z}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-[2px] border px-3.5 py-2.5',
              on ? 'border-accent/45 bg-accent-dim/40' : 'border-line hover:border-line-strong',
            )}
          >
            <input type="radio" name="zone" className="accent-[var(--color-accent)]" checked={on} onChange={() => setZone(z)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{zoneLabel(z)}</span>
              <span className="num block text-[11px] text-ink-3">
                {zoneAbbr(id, now)} · {zoneOffset(id, now)}
              </span>
            </span>
            <span className="num shrink-0 text-[15px] text-ink-2 tabular-nums">
              {c.h}:{c.m}
              <span className="text-ink-3">:{c.s}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
