import { Plus, X } from 'lucide-react';
import { useMemo } from 'react';
import { Menu, MenuItem } from '../../components/ui/Menu';
import { armorCandidates, bossArmor, etaAt, type ArmorPlate, type Boss } from '../../domain/quests';
import { cn } from '../../lib/cn';
import { formatDate, useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { t, tn } from '../../i18n';

const kindLabel = (p: ArmorPlate) => (p.ref.kind === 'pattern' ? t('Repeat') : t('Cycle'));
const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A boss's armor: what you say keeps making it hard, from Repeats and Causes.
 * It never shields the boss from work (HP only drops when work is done); it
 * is chipped the only way the atlas allows, by what the record shows.
 */
export function ArmorPanel({ boss }: { boss: Boss }) {
  const data = useAtlas((s) => s.data);
  const addArmor = useAtlas((s) => s.addArmor);
  const removeArmor = useAtlas((s) => s.removeArmor);
  const openEntity = useUI((s) => s.openEntity);
  const today = useToday();
  const plates = useMemo(() => bossArmor(data, boss.id, today), [data, boss.id, today]);
  const candidates = useMemo(() => armorCandidates(data, boss.id, today), [data, boss.id, today]);
  const standing = plates.filter((p) => !p.broken && !p.withdrawn).length;

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-2">
        <div className="label">{t('Armor')}</div>
        {plates.length > 0 && <span className="font-mono text-[10.5px] text-ink-3">{tn(standing, 'one plate standing', '{n} plates standing')}</span>}
      </div>
      {plates.length === 0 && (
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
          {t('Nothing marked yet. What keeps making this hard? A repeat from Repeats, or a cycle from Causes.')}
        </p>
      )}
      <ul className="mt-2 space-y-3">
        {plates.map((p) => {
          const eta = p.split && etaAt(boss.hp, p.split.paceWithout, today);
          return (
            <li key={`${p.ref.kind}:${p.ref.id}`} className={cn(p.broken || p.withdrawn ? 'opacity-60' : undefined)}>
              <div className="flex items-start gap-2">
                <span className="mt-[3px] shrink-0 rounded-[2px] border border-line px-1 font-mono text-[9.5px] tracking-wider text-ink-3 uppercase">
                  {kindLabel(p)}
                </span>
                {p.open ? (
                  <button
                    type="button"
                    onClick={() => openEntity(p.open!)}
                    className="min-w-0 flex-1 text-left text-[13px] leading-snug text-ink hover:underline"
                  >
                    {p.title}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{p.title}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeArmor(boss.id, p.ref)}
                  className="mt-0.5 shrink-0 text-ink-3 hover:text-ink"
                  title={t('Take it off this boss')}
                  aria-label={t('Take it off this boss')}
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-ink/10" role="img" aria-label={t('{n}% standing', { n: Math.round(p.integrity * 100) })}>
                <div
                  className={cn('h-full rounded-full', p.broken || p.withdrawn ? 'bg-ink/25' : 'bg-ink/75')}
                  style={{ width: `${Math.round(p.integrity * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                {p.broken && <span className="text-ink-2">{t('Broken.')} </span>}
                {p.reading}
              </p>
              {p.split && !p.broken && p.split.paceWithout > p.split.paceWith && boss.state === 'active' && (
                <p className="mt-1 text-[11.5px] leading-snug text-ink-2">
                  {t('Side by side, not a finding: in weeks it showed up you finished {a} a week, {b} in the others.', {
                    a: round(p.split.paceWith),
                    b: round(p.split.paceWithout),
                  })}{' '}
                  {eta && t('Without it, at {b} a week, this boss would fall around {eta}.', { b: round(p.split.paceWithout), eta: formatDate(eta) })}
                </p>
              )}
              {!p.broken && !p.withdrawn && (
                <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                  {p.ref.kind === 'pattern'
                    ? t('Chip it: write down the times it did not happen, as exceptions.')
                    : t('Chip it: test its least sure step, until it no longer holds.')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {candidates.length > 0 && (
        <div className="mt-3">
          <Menu label={t('Add what stands in its way')} icon={Plus} align="start" width="w-[min(340px,calc(100vw-40px))]" fitHeight chevron={false}>
            {candidates.map((c) => (
              <MenuItem
                key={`${c.ref.kind}:${c.ref.id}`}
                hint={`${kindLabel(c)}${c.tied ? ` · ${t('tied to your direction')}` : ''} · ${c.reading}`}
                onSelect={() => addArmor(boss.id, c.ref)}
              >
                {c.title}
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}
      <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
        {t(
          'Armor never shields it from work: its HP only drops when something is done. It is what keeps making the work hard, and it breaks only by what the record shows.',
        )}
      </p>
    </div>
  );
}
