import { Check, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate, type RouteKey } from '../../app/router';
import { showOnMap } from '../../app/showOnMap';
import { GROUPS } from '../../domain/constants';
import { entryCode } from '../../domain/selectors';
import type { ID } from '../../domain/types';
import { LENSES, weaveOf, type Lens, type Offer, type Strand, type Thread, type Weave } from '../../domain/weave';
import { t, tn } from '../../i18n';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { PLACE_ICONS } from '../icons';
import { Button, IconButton } from '../ui/Button';

/*
 * What a note is connected to, lens by lens (see domain/weave): the same six
 * places as the top bar, in the same order, each with what the note put
 * there. What the Atlas tied on its own can be taken back with one tap; what
 * only you can say is offered, never taken.
 */

const ROUTE: Record<Lens, RouteKey> = { map: 'orbit', time: 'timeline', causes: 'network', repeats: 'patterns', ahead: 'paths', quests: 'quests' };
const lensLabel = (lens: Lens) => GROUPS.find((g) => g.key === lens)!.label;

export function useWeave(entryId: ID): Weave {
  const data = useAtlas((s) => s.data);
  return useMemo(() => weaveOf(data, entryId), [data, entryId]);
}

/** Go to a lens, looking at what the note is about there. */
function goTo(strand: Strand) {
  const node = strand.threads.find((x) => x.ref?.kind === 'node')?.ref?.id;
  if ((strand.lens === 'map' || strand.lens === 'causes') && node) return showOnMap(strand.lens === 'map' ? 'orbit' : 'network', node);
  const pattern = strand.lens === 'repeats' ? strand.threads.find((x) => x.ref?.kind === 'pattern')?.ref?.id : undefined;
  navigate(ROUTE[strand.lens], pattern);
}

function untieAll(entryId: ID, threads: Thread[]) {
  const untie = useAtlas.getState().untie;
  for (const x of threads) if (x.auto && x.untie) untie(entryId, x.untie);
}

/** One lens: its mark and name (going there), and what the note put in it. */
function StrandRow({ entryId, strand, compact, extra }: { entryId: ID; strand: Strand; compact?: boolean; extra?: string }) {
  const open = useUI((s) => s.openEntity);
  const untie = useAtlas((s) => s.untie);
  const Icon = PLACE_ICONS[strand.lens];
  const auto = strand.threads.filter((x) => x.auto && x.untie);
  // On the card: the names on the map in a line, and the first two or three of the rest.
  const shown = compact ? strand.threads.slice(0, strand.lens === 'map' ? 4 : strand.lens === 'quests' ? 3 : 2) : strand.threads;
  const more = strand.threads.length - shown.length;
  return (
    <li className="weave-row">
      <button type="button" className="weave-lens" onClick={() => goTo(strand)} title={t('Go to {lens}', { lens: lensLabel(strand.lens) })}>
        <Icon size={14} aria-hidden />
        <span>{lensLabel(strand.lens)}</span>
      </button>
      <div className="min-w-0 flex-1">
        <ul className={cn('weave-threads', compact && 'is-compact', strand.lens === 'map' && 'is-inline')}>
          {shown.map((x) => (
            <li key={x.key} className={cn('weave-thread', x.live && 'is-live')}>
              <button type="button" className="weave-thread-label" disabled={!x.ref} onClick={() => x.ref && open(x.ref)}>
                {x.label}
              </button>
              {!compact && x.untie && (
                <button
                  type="button"
                  className="weave-untie"
                  aria-label={t('Take it back')}
                  title={x.auto ? t('Connected by the Atlas from your note. Take it back') : t('Take it back')}
                  onClick={() => untie(entryId, x.untie!)}
                >
                  <X size={11} aria-hidden />
                </button>
              )}
            </li>
          ))}
          {more > 0 && <li className="weave-more">{t('+{n} more', { n: more })}</li>}
          {extra && <li className="weave-thread is-live">{extra}</li>}
        </ul>
      </div>
      {compact && auto.length > 0 && (
        <button
          type="button"
          className="weave-untie is-row"
          aria-label={t('Take back what was connected in {lens}', { lens: lensLabel(strand.lens) })}
          title={t('Take back what was connected in {lens}', { lens: lensLabel(strand.lens) })}
          onClick={() => untieAll(entryId, auto)}
        >
          <Undo2 size={12} aria-hidden />
        </button>
      )}
    </li>
  );
}

export function WeaveList({ entryId, compact, xp }: { entryId: ID; compact?: boolean; xp?: { xp: number; level?: number } }) {
  const weave = useWeave(entryId);
  const strands = [...weave.strands];
  // A day you wrote counts in Quests even when nothing in it was finished.
  const gained = xp && xp.xp > 0 ? [t('+{n} XP', { n: xp.xp }), xp.level ? t('Level {n}', { n: xp.level }) : ''].filter(Boolean).join(' · ') : undefined;
  if (gained && !strands.some((s) => s.lens === 'quests')) strands.push({ lens: 'quests', threads: [] });
  strands.sort((a, b) => LENSES.indexOf(a.lens) - LENSES.indexOf(b.lens));
  return (
    <ul className={cn('weave-list', !compact && 'is-panel')}>
      {strands.map((s) => (
        <StrandRow key={s.lens} entryId={entryId} strand={s} compact={compact} extra={s.lens === 'quests' ? gained : undefined} />
      ))}
    </ul>
  );
}

/** What only you can say about the note: yes with one tap, or not this. */
export function OfferList({ entryId, offers, onExplain }: { entryId: ID; offers: Offer[]; onExplain?(offer: Offer): void }) {
  const resolve = useAtlas((s) => s.resolveSuggestion);
  const claimFromNote = useAtlas((s) => s.claimFromNote);
  if (!offers.length) return null;
  return (
    <ul className="weave-offers">
      {offers.map((o) => (
        <li key={o.suggestion} className="weave-offer">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] leading-snug text-ink">
              {o.kind === 'claim' ? t('A possible reason: {claim}?', { claim: o.label }) : `${o.label}?`}
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-ink-3">“{o.excerpt}”</div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {o.kind === 'explain' ? (
              <Button size="sm" variant="ghost" onClick={() => onExplain?.(o)}>
                {t('Add as a reason')}
              </Button>
            ) : (
              <IconButton
                icon={Check}
                size="sm"
                label={o.kind === 'claim' ? t('Yes, keep it as a hunch') : t('Yes, it did not happen this time')}
                onClick={() => (o.kind === 'claim' ? claimFromNote(entryId, o.suggestion) : resolve(entryId, o.suggestion, true))}
              />
            )}
            <IconButton icon={X} size="sm" label={t('Not this')} onClick={() => resolve(entryId, o.suggestion, false)} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const SHOW_MS = 16000;

/**
 * The note you just saved, and what it connected to. Stays while you look at
 * it (pointer or keyboard inside), then steps aside; the same list is always
 * in the note's panel.
 */
export function WeaveCard() {
  const card = useUI((s) => s.woven);
  const close = () => useUI.getState().showWoven(null);
  const entry = useAtlas((s) => (card ? s.data.entries[card.entryId] : undefined));
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (card && !held) timer.current = setTimeout(close, SHOW_MS);
    return () => clearTimeout(timer.current);
  }, [card, held]);
  if (!card || !entry) return null;
  return (
    <WeaveCardBody
      key={card.entryId}
      entryId={card.entryId}
      code={entryCode(entry.seq)}
      xp={card}
      onHold={setHeld}
      onClose={close}
      onOpen={() => {
        useUI.getState().openEntity({ kind: 'entry', id: card.entryId });
        close();
      }}
    />
  );
}

function WeaveCardBody({
  entryId,
  code,
  xp,
  onHold,
  onClose,
  onOpen,
}: {
  entryId: ID;
  code: string;
  xp: { xp: number; level?: number };
  onHold(held: boolean): void;
  onClose(): void;
  onOpen(): void;
}) {
  const weave = useWeave(entryId);
  const auto = weave.strands.flatMap((s) => s.threads.filter((x) => x.auto && x.untie));
  const lenses = weave.strands.length;
  return (
    <section
      className="weave-card pointer-events-auto animate-rise"
      aria-label={t('Connected to')}
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
    >
      <header className="weave-card-head">
        <span className="label">{t('Saved {code}', { code })}</span>
        <span className="weave-count text-[12px] text-ink-2">{tn(lenses, 'Connected to {n} lens', 'Connected to {n} lenses')}</span>
        <IconButton icon={X} size="sm" label={t('Dismiss')} className="ml-auto" onClick={onClose} />
      </header>
      <WeaveList entryId={entryId} compact xp={xp} />
      {weave.offers.length > 0 && (
        <div className="weave-card-offers">
          <div className="label mb-1">{t('Only you can say')}</div>
          <OfferList entryId={entryId} offers={weave.offers.slice(0, 2)} onExplain={onOpen} />
        </div>
      )}
      <footer className="weave-card-foot">
        {auto.length > 0 && (
          <Button size="sm" variant="ghost" icon={Undo2} onClick={() => untieAll(entryId, auto)}>
            {t('Take back all')}
          </Button>
        )}
        <Button size="sm" className="ml-auto" onClick={onOpen}>
          {t('Open the note')}
        </Button>
      </footer>
    </section>
  );
}
