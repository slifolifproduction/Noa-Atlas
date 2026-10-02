import { EXAMPLES, type ExampleKey } from '../../data/examples';
import { cn } from '../../lib/cn';
import { t } from '../../i18n';

/** Which example to open: seven people at work and one student, each with a line about their life. */
export function ExamplePicker({ value, onChange, name }: { value: ExampleKey; onChange: (key: ExampleKey) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={t('Which example?')} className="grid gap-1.5 sm:grid-cols-2">
      {EXAMPLES.map((e) => (
        <label
          key={e.key}
          className={cn(
            'flex cursor-pointer gap-2.5 rounded-[2px] border px-3 py-2.5',
            value === e.key ? 'border-accent/45 bg-accent-dim/40' : 'border-line hover:border-line-strong',
          )}
        >
          <input type="radio" name={name} className="mt-[3px] accent-[var(--color-accent)]" checked={value === e.key} onChange={() => onChange(e.key)} />
          <span className="min-w-0">
            <span className="block text-[13px] leading-snug text-ink">
              {t(e.identity)}
              <span className="text-ink-3"> · {e.name}</span>
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{t(e.blurb)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
