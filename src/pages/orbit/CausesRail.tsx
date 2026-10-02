import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { StatusSwatch } from '../../components/graph/Legend';
import { LoopIcon } from '../../components/icons';
import { claimStatus } from '../../domain/claims';
import { AREAS, CLAIM_STATUSES, ROLE_META, STATUS_META } from '../../domain/constants';
import { findLoops, loopName, type Loop } from '../../domain/loops';
import { followOn } from '../../domain/ask';
import { factorLabel } from '../../domain/claims';
import { explainOutcome } from '../../domain/explain';
import { useFocus } from '../../components/shell/Focus';
import { Segmented } from '../../components/ui/primitives';
import type { ClaimStatus } from '../../domain/types';
import { t, tn } from '../../i18n';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';

/**
 * The Causes lens's side list: the cycles the possible reasons close, how
 * sure each reason is, and which areas to include. The map itself stays the same.
 */
export function CausesRail() {
  const data = useAtlas((s) => s.data);
  const view = useUI((s) => s.networkView);
  const setView = useUI((s) => s.setNetworkView);
  const openEntity = useUI((s) => s.openEntity);
  const loops = useMemo(() => findLoops(data), [data]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(CLAIM_STATUSES.map((x) => [x.key, 0])) as Record<ClaimStatus, number>;
    for (const claim of Object.values(data.claims)) if (claim.state === 'adopted') c[claimStatus(data, claim)]++;
    return c;
  }, [data]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const suggested = Object.values(data.claims).filter((c) => c.state === 'suggested').length;
  const hidden = new Set(view.hiddenStatuses);
  const hiddenAreas = new Set(view.hiddenAreas);
  const [more, setMore] = useState(hiddenAreas.size > 0);

  const pickLoop = (loop: Loop) => {
    const on = view.loopId === loop.id;
    setView({ loopId: on ? undefined : loop.id });
    if (!on) openEntity({ kind: 'loop', id: loop.id });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 pt-3 pb-2.5">
        <div className="label text-ink-2!">{t('What seems to affect what')}</div>
        <p className="mt-1 text-[12px] leading-snug text-ink-3">
          {tn(
            total,
            '{n} possible reason, drawn by how sure it is. Tap anything to ask about it.',
            '{n} possible reasons, drawn by how sure they are. Tap anything to ask about it.',
          )}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
          {t('Only possible reasons are drawn here. A line is a claim to check, not a fact; links you drew are not causes.')}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <Investigation />
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="label">{t('Cycles')}</span>
          {view.loopId && (
            <button type="button" className="text-[11.5px] text-accent hover:underline" onClick={() => setView({ loopId: undefined })}>
              {t('Clear')}
            </button>
          )}
        </div>
        {loops.length ? (
          <ul className="px-2">
            {loops.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={view.loopId === l.id}
                  onClick={() => pickLoop(l)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]',
                    view.loopId === l.id && 'bg-ink/[0.06]',
                  )}
                >
                  <LoopIcon size={13} className="mt-[3px] shrink-0 text-ink-2" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink-2">{loopName(l)}</span>
                    <span className="block text-[11px] text-ink-3">
                      {tn(l.claimIds.length, '{n} step', '{n} steps')} · {t('least sure: {status}', { status: STATUS_META[l.weakest].label.toLowerCase() })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 text-[12px] text-ink-3">{t('None yet. A cycle appears when possible reasons come back around.')}</p>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-line px-4 pt-3 pb-1">
          <span className="label">{t('How sure')}</span>
          {hidden.size > 0 && (
            <button type="button" className="text-[11.5px] text-accent hover:underline" onClick={() => setView({ hiddenStatuses: [] })}>
              {t('Show all')}
            </button>
          )}
        </div>
        <ul className="px-2">
          {CLAIM_STATUSES.map((s) => {
            const on = !hidden.has(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setView({ hiddenStatuses: on ? [...hidden, s.key] : [...hidden].filter((k) => k !== s.key) })}
                  className={cn('flex w-full items-center gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]', !on && 'opacity-45')}
                  title={s.description}
                >
                  <StatusSwatch status={s.key} width={24} />
                  <span className="flex-1 truncate text-[12.5px] text-ink-2">{s.label}</span>
                  <span className="num text-[11px] text-ink-3">{counts[s.key]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-2">
          <ToggleRow
            on={view.showSuggested}
            onClick={() => setView({ showSuggested: !view.showSuggested })}
            icon={view.showSuggested ? <Eye size={13} className="text-ink-2" aria-hidden /> : <EyeOff size={13} className="text-ink-3" aria-hidden />}
            count={suggested}
          >
            {t('Suggested by the Atlas')}
          </ToggleRow>
        </div>

        <div className="mt-2 border-t border-line px-2 pt-2">
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore(!more)}
            className="flex w-full items-center gap-2 rounded-[2px] px-2 py-[5px] text-left text-[12.5px] text-ink-2 hover:bg-ink/[0.04] hover:text-ink"
          >
            <ChevronRight size={13} className={cn('text-ink-3 transition-transform', more && 'rotate-90')} aria-hidden />
            <span className="flex-1">{t('Areas of life')}</span>
            {hiddenAreas.size > 0 && <span className="num text-[11px] text-accent">{t('{n} off', { n: hiddenAreas.size })}</span>}
          </button>
        </div>
        {more && (
          <ul className="px-2">
            {AREAS.map((a) => {
              const on = !hiddenAreas.has(a.key);
              return (
                <li key={a.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setView({ hiddenAreas: on ? [...hiddenAreas, a.key] : [...hiddenAreas].filter((k) => k !== a.key) })}
                    className={cn('flex w-full items-center gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]', !on && 'opacity-45')}
                  >
                    <span className="h-3 w-[2px] shrink-0" style={{ background: a.color }} aria-hidden />
                    <span className="flex-1 truncate text-[12.5px] text-ink-2">{a.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ on, onClick, icon, count, children }: { on: boolean; onClick(): void; icon: ReactNode; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]', !on && 'opacity-45')}
    >
      {icon}
      <span className="flex-1 text-[12.5px] text-ink-2">{children}</span>
      {count !== undefined && <span className="num text-[11px] text-ink-3">{count}</span>}
      <span className={cn('h-3.5 w-6 rounded-[2px] p-[2px] transition-colors', on ? 'bg-accent/60' : 'bg-ink/10')} aria-hidden>
        <span className={cn('block h-2.5 w-2.5 rounded-[1px] bg-ink transition-transform', on && 'translate-x-2.5')} />
      </span>
    </button>
  );
}

/**
 * With something in focus, the Causes lens starts from it: what may lead to
 * it, by the part each plays, what is still unexplained, and which way the
 * trace on the map runs (back to what may lead to it, or on to what it may lead to).
 */
function Investigation() {
  const data = useAtlas((s) => s.data);
  const focus = useFocus();
  const view = useUI((s) => s.networkView);
  const setView = useUI((s) => s.setNetworkView);
  const openEntity = useUI((s) => s.openEntity);
  const setAsking = useUI((s) => s.setAsking);
  const id = focus?.kind === 'node' ? focus.id : undefined;
  const ex = useMemo(() => (id ? explainOutcome(data, id) : null), [data, id]);
  const onward = useMemo(() => (id ? followOn(data, id) : null), [data, id]);
  if (!id || !ex || !data.nodes[id]) return null;
  const name = data.nodes[id].label;
  const trace = view.trace ?? 'back';
  const setTrace = (next: 'back' | 'forward') => setView({ trace: next, focusDepth: view.focusDepth || 2 });
  return (
    <section className="border-b border-line px-4 pt-3 pb-3" aria-label={t('Why might {name} be happening?', { name })}>
      <div className="label text-ink-2!">{t('Why might {name} be happening?', { name })}</div>
      {ex.groups.length ? (
        <ul className="mt-1.5 space-y-2">
          {ex.groups.map((g) => (
            <li key={g.role}>
              <div className="text-[11px] text-ink-3">{ROLE_META[g.role].heading}</div>
              <ul>
                {g.items.map((c) => (
                  <li key={c.claim.id}>
                    <button
                      type="button"
                      onClick={() => openEntity({ kind: 'claim', id: c.claim.id })}
                      className="flex w-full items-start gap-2 rounded-[2px] py-[3px] text-left hover:bg-ink/[0.04]"
                    >
                      <StatusSwatch status={c.status} width={16} />
                      <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-2">{factorLabel(data, c.claim.from, c.claim.aspect?.from)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-ink-3">{t('Nothing on the map explains it yet.')}</p>
      )}
      <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
        {ex.moments > 0 && ex.unexplained > 0
          ? t('{n} of the {m} recorded times it moved, nothing on the list was recorded pushing it that way first. Some of it may be chance.', {
              n: ex.unexplained,
              m: ex.moments,
            })
          : t('Some of it may be chance, or something not on the map.')}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Segmented<'back' | 'forward'>
          label={t('Trace on the map')}
          size="sm"
          value={trace === 'forward' ? 'forward' : 'back'}
          onChange={setTrace}
          options={[
            { value: 'back', label: t('What may lead to it') },
            { value: 'forward', label: `${t('What it may lead to')}${onward?.direct.length ? ` ${onward.direct.length}` : ''}` },
          ]}
        />
        <button
          type="button"
          className="text-[12px] text-accent hover:underline"
          onClick={() => {
            openEntity({ kind: 'node', id });
            setAsking('why');
          }}
        >
          {t('Open the explanation')}
        </button>
      </div>
    </section>
  );
}
