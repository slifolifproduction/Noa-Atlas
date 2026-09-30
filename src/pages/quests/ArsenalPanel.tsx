import { ArrowUp, PenLine, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { SKILL_STATUS_LABEL } from '../../domain/constants';
import { arsenal, canUpgrade, SKILL_STEPS } from '../../domain/quests';
import { cn } from '../../lib/cn';
import { useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { toast, useUI } from '../../state/uiStore';
import { t, tn } from '../../i18n';

/** A skill's level as three marks: gap, developing, have. */
function Pips({ level }: { level: (typeof SKILL_STEPS)[number] }) {
  const at = SKILL_STEPS.indexOf(level);
  return (
    <span className="inline-flex gap-[3px]" role="img" aria-label={SKILL_STATUS_LABEL[level]}>
      {SKILL_STEPS.map((s, i) => (
        <span key={s} className={cn('h-2 w-2 rounded-[1px] border', i <= at ? 'border-ink/80 bg-ink/80' : 'border-ink/30')} />
      ))}
    </span>
  );
}

/**
 * Your arsenal: the skills on your Map, raised one step at a time with the
 * points levels bring. A raise needs practice written about since the last
 * one, and it changes the skill on the Map and in your direction, dated on
 * Time. Skills your direction asks for come first; those it asks for that
 * are not on the Map yet can be added.
 */
export function ArsenalPanel() {
  const data = useAtlas((s) => s.data);
  const upgradeSkill = useAtlas((s) => s.upgradeSkill);
  const undoUpgrade = useAtlas((s) => s.undoUpgrade);
  const addNode = useAtlas((s) => s.addNode);
  const openEntity = useUI((s) => s.openEntity);
  const openCapture = useUI((s) => s.openCapture);
  const today = useToday();
  const a = useMemo(() => arsenal(data, today), [data, today]);

  const raise = (nodeId: string, label: string, to?: string) => {
    const id = upgradeSkill(nodeId);
    if (!id) return;
    toast(t('{skill} raised to {level}. It is on Time, and on the Map.', { skill: label, level: to ?? '' }), {
      tone: 'success',
      action: { label: t('Undo'), run: () => undoUpgrade(id) },
    });
  };

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="label">{t('Arsenal')}</h3>
        <span className={cn('font-mono text-[10.5px]', a.points.left ? 'text-accent' : 'text-ink-3')}>
          {tn(a.points.left, 'one point to spend', '{n} points to spend')}
        </span>
      </div>
      {a.power.total > 0 && (
        <p className="mt-1 text-[12px] text-ink-2">
          {t('Power: {have} of {total} skills your direction asks for are at “have”.', { have: a.power.have, total: a.power.total })}
        </p>
      )}
      {a.items.length === 0 && a.missing.length === 0 && <p className="mt-2 text-[12.5px] text-ink-3">{t('No skills on your Map yet.')}</p>}
      <ul className="mt-2 divide-y divide-line">
        {a.items.map((i) => {
          const can = canUpgrade(a, i);
          return (
            <li key={i.node.id} className="flex items-center gap-2.5 py-2">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => openEntity({ kind: 'node', id: i.node.id })}
                  className="text-left text-[13px] leading-snug text-ink hover:underline"
                >
                  {i.node.label}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
                  <Pips level={i.level} />
                  <span>{SKILL_STATUS_LABEL[i.level]}</span>
                  {i.asked && <span>· {t('your direction asks for it')}</span>}
                  {i.next && (
                    <span>
                      ·{' '}
                      {i.lastUpgrade
                        ? i.practice
                          ? tn(i.practice, 'one note about it since the last raise', '{n} notes about it since the last raise')
                          : t('no note about it since the last raise')
                        : i.practice
                          ? tn(i.practice, 'one note about it', '{n} notes about it')
                          : t('no note about practising it yet')}
                    </span>
                  )}
                </div>
              </div>
              {can === 'ok' ? (
                <Button size="sm" icon={ArrowUp} onClick={() => raise(i.node.id, i.node.label, i.next && SKILL_STATUS_LABEL[i.next])}>
                  {t('Raise')}
                </Button>
              ) : can === 'no-practice' ? (
                <button
                  type="button"
                  onClick={() => openCapture('journal')}
                  className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
                  title={t('A raise needs practice written about since the last one: a note that names the skill, linked to it.')}
                >
                  <PenLine size={12} aria-hidden />
                  {t('Write about practising it')}
                </button>
              ) : (
                <span className="shrink-0 text-[11.5px] text-ink-3">{can === 'top' ? t('At the top') : t('No point left')}</span>
              )}
            </li>
          );
        })}
        {a.missing.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-snug text-ink-2">{r.label}</div>
              <div className="mt-0.5 text-[11px] text-ink-3">
                {SKILL_STATUS_LABEL[r.status]} · {t('your direction asks for it; not on your Map')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                addNode({ label: r.label, kind: 'skill', area: 'growth', level: r.status, origin: 'user', adopted: true });
                toast(t('{skill} is on your Map now, under Growth.', { skill: r.label }));
              }}
              className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
            >
              <Plus size={12} aria-hidden />
              {t('Add to the Map')}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
        {t(
          'Each level brings a point. A raise needs practice written about since the last one, and it changes the skill on your Map and in your direction, dated on Time.',
        )}
      </p>
    </div>
  );
}
