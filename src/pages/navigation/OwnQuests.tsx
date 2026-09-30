import { ArrowRight, Check } from 'lucide-react';
import { hrefFor } from '../../app/router';
import { formatDate, relativeDays, useToday } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { t } from '../../i18n';

/** A box to tick. */
function Tick({ done, label, onClick }: { done: boolean; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border',
        done ? 'border-ink-2 bg-ink-2 text-canvas' : 'border-line-strong hover:border-ink-3',
      )}
    >
      {done && <Check size={11} strokeWidth={3} aria-hidden />}
    </button>
  );
}

/**
 * Quests you started on your own, outside a plan: each a target with a
 * date and its steps, ticked off here or struck on Quests (the same thing).
 */
export function OwnQuests() {
  const own = useAtlas((s) => s.data.quests?.own);
  const toggleTarget = useAtlas((s) => s.toggleTarget);
  const setActionStatus = useAtlas((s) => s.setActionStatus);
  useToday();
  if (!own?.targets.length) return null;
  return (
    <section className="mt-8 min-w-0" aria-label={t('Your own quests')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label">{t('Your own quests')}</h2>
        <a href={hrefFor('quests')} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
          {t('Fight them in Quests')}
          <ArrowRight size={12} aria-hidden />
        </a>
      </div>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {own.targets.map((x) => {
          const steps = own.actions.filter((a) => a.targetId === x.id && a.status !== 'skipped');
          return (
            <li key={x.id} className="py-3">
              <div className="flex items-center gap-2.5">
                <Tick done={x.done} label={x.title} onClick={() => toggleTarget(x.id)} />
                <span className={cn('min-w-0 flex-1 text-[14px]', x.done ? 'text-ink-3 line-through decoration-ink-3/50' : 'text-ink')}>{x.title}</span>
                <span className="num shrink-0 text-[11.5px] text-ink-3">
                  {formatDate(x.due)} · {relativeDays(x.due)}
                </span>
              </div>
              {steps.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-[26px]">
                  {steps.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5">
                      <Tick done={a.status === 'done'} label={a.title} onClick={() => setActionStatus(a.id, a.status === 'done' ? 'todo' : 'done')} />
                      <span className={cn('min-w-0 flex-1 text-[13px]', a.status === 'done' ? 'text-ink-3 line-through decoration-ink-3/50' : 'text-ink-2')}>
                        {a.title}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
