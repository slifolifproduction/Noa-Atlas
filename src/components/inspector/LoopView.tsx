import { Check, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { claimStatus } from '../../domain/claims';
import { STATUS_META } from '../../domain/constants';
import { loopById, loopName, loopTurns } from '../../domain/loops';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { KnowledgeTag, StatusBadge } from '../evidence/Status';
import { LoopIcon } from '../icons';
import { Button } from '../ui/Button';
import { ClaimRow, Muted, NodeChip, PanelSection } from './parts';
import { formatDate } from '../../lib/dates';
import { t, tn } from '../../i18n';

/**
 * A loop: claims that close a circle. Nobody draws it; it appears from the
 * claims. It is only as solid as its weakest link, and that link is usually
 * where to look first.
 */
export function LoopView({ id }: { id: string }) {
  const data = useAtlas((s) => s.data);
  const nameLoop = useAtlas((s) => s.nameLoop);
  const setNetworkView = useUI((s) => s.setNetworkView);
  const [editing, setEditing] = useState(false);
  const loop = loopById(data, id);
  const turns = useMemo(() => (loop ? loopTurns(data, loop) : []), [data, loop]);
  const [name, setName] = useState(loop?.name ?? '');
  if (!loop)
    return (
      <div className="p-4">
        <Muted>{t('This cycle no longer closes: one of its steps changed.')}</Muted>
      </div>
    );
  const reinforcing = loop.type === 'reinforcing';
  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <LoopIcon size={14} className="text-ink-2" aria-hidden />
          <span className="label">{t('A cycle')}</span>
          <span className="ml-auto">
            <KnowledgeTag kind="claimed" />
          </span>
        </div>
        {editing ? (
          <form
            className="mt-2.5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              nameLoop(id, name.trim());
              setEditing(false);
            }}
          >
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('A name you will recognise')} autoFocus />
            <Button size="sm" variant="primary" type="submit" icon={Check}>
              {t('Save')}
            </Button>
          </form>
        ) : (
          <h2 className="mt-2.5 display text-[21px] leading-[1.2] text-ink">
            {loopName(loop)}
            <button type="button" className="ml-2 align-middle text-ink-3 hover:text-ink" aria-label={t('Name this cycle')} onClick={() => setEditing(true)}>
              <Pencil size={13} aria-hidden />
            </button>
          </h2>
        )}
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {reinforcing
            ? t('Each step feeds the next and the circle comes back stronger: it escalates, for better or worse, until something outside it changes.')
            : t('The circle pushes back on itself: it corrects, or it resists change, and tends to settle.')}
        </p>
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-3">
          {t('Only as sure as its least sure step:')} <StatusBadge status={loop.weakest} />
        </div>
        {loop.gated && (
          <p className="mt-2 text-[12px] text-ink-3">{t('One step only makes the next possible, or limits it: the cycle turns only while that holds.')}</p>
        )}
        <Button size="sm" className="mt-3" onClick={() => (setNetworkView({ loopId: id }), (window.location.hash = '#/network'))}>
          {t('Show it in Causes')}
        </Button>
      </div>
      <PanelSection title={t('The steps')} count={loop.claimIds.length}>
        <ol className="-mx-1.5">
          {loop.claimIds.map((cid) => (
            <ClaimRow key={cid} id={cid} className={loop.leastCertain.includes(cid) ? 'rounded-[2px] bg-ink/[0.03]' : undefined} />
          ))}
        </ol>
      </PanelSection>
      <PanelSection title={t('Seen going round')} count={turns.length}>
        {turns.length ? (
          <>
            <Muted>
              {tn(
                turns.length,
                'Once, the record shows every step in order, back to the start.',
                '{n} times, the record shows every step in order, back to the start.',
              )}{' '}
              {t('Each took {range} days.', {
                range:
                  Math.min(...turns.map((x) => x.days)) === Math.max(...turns.map((x) => x.days))
                    ? String(turns[0].days)
                    : `${Math.min(...turns.map((x) => x.days))}–${Math.max(...turns.map((x) => x.days))}`,
              })}
            </Muted>
            <ul className="mt-1.5 space-y-0.5 text-[12px] text-ink-3">
              {turns.slice(0, 4).map((x) => (
                <li key={x.from} className="num">
                  {formatDate(x.from)} → {formatDate(x.to)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Muted>{t('The record does not yet show it going all the way round. Each step can be seen on its own; the full circle is still an idea.')}</Muted>
        )}
      </PanelSection>
      {loop.leverage.length > 0 && (
        <PanelSection title={t('Where you can act')}>
          <Muted>{t('Steps that start from something you do, seen at least a few times: a change there can travel round.')}</Muted>
          <ul className="mt-1.5 space-y-1">
            {loop.leverage.map((cid) => {
              const c = data.claims[cid];
              if (!c) return null;
              return (
                <li key={cid} className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
                  <NodeChip id={c.from} /> → <NodeChip id={c.to} />
                </li>
              );
            })}
          </ul>
        </PanelSection>
      )}
      <PanelSection title={t('Least certain')}>
        <Muted>{t('The steps with the least behind them: where a test would tell you most. Least certain is not the same as where to act.')}</Muted>
        <ul className="mt-1.5 space-y-1">
          {loop.leastCertain.map((cid) => {
            const c = data.claims[cid];
            if (!c) return null;
            return (
              <li key={cid} className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
                <NodeChip id={c.from} /> → <NodeChip id={c.to} />
                <span className="text-[11.5px] text-ink-3">{STATUS_META[claimStatus(data, c)].label.toLowerCase()}</span>
              </li>
            );
          })}
        </ul>
      </PanelSection>
    </div>
  );
}
