import { ArrowRight, ArrowUpRight, Check, ChevronRight, FlaskConical, Plus, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { ExperimentDraft } from '../../ai/types';
import { inferKind, whyWeThink } from '../../domain/ask';
import { claimSentence, claimStatus } from '../../domain/claims';
import { EFFECT_META, EVIDENCE_KIND_LABEL, KIND_META, REGULARITY_LABEL, VIEW_LABEL } from '../../domain/constants';
import type { HistoryItem } from '../../domain/history';
import { mapElements, patternStats, patternTitle, resolveSource } from '../../domain/selectors';
import type { AreaKey, Claim, Effect, ID, View } from '../../domain/types';
import { t } from '../../i18n';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { adoptExperimentDraft, proposeExperiments } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { navigate, type RouteKey } from '../../app/router';
import { StatusBadge } from '../evidence/Status';
import { PatternIcon } from '../icons';
import { Button } from '../ui/Button';

/**
 * One question in the panel. Questions are asked one at a time: opening one
 * closes the others, and the open question stays open as you move from one
 * thing to the next.
 */
export function Question({ id, title, hint, children }: { id: string; title: string; hint?: string; children: () => ReactNode }) {
  const asking = useUI((s) => s.asking);
  const setAsking = useUI((s) => s.setAsking);
  const open = asking === id;
  const panelId = useId();
  return (
    <section className="border-t border-line">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setAsking(open ? null : id)}
          className="group flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-ink/[0.025]"
        >
          <ChevronRight size={14} className={cn('shrink-0 text-ink-3 transition-transform', open && 'rotate-90 text-accent')} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[14px] leading-snug', open ? 'text-ink' : 'text-ink-2 group-hover:text-ink')}>{title}</span>
            {hint && !open && <span className="block truncate text-[11.5px] text-ink-3">{hint}</span>}
          </span>
        </button>
      </h3>
      {open && (
        <div id={panelId} className="animate-fade-in px-4 pb-4">
          {children()}
        </div>
      )}
    </section>
  );
}

/**
 * A possible reason, as a sentence. Tapping it opens the reasoning in place,
 * one depth at a time: why the Atlas thinks so, then the moments, then the
 * original words.
 */
export function Reason({ claim }: { claim: Claim }) {
  const data = useAtlas((s) => s.data);
  const setView = useAtlas((s) => s.setClaimView);
  const adopt = useAtlas((s) => s.adoptClaim);
  const setAside = useAtlas((s) => s.setClaimAside);
  const open = useUI((s) => s.openEntity);
  const openSource = useUI((s) => s.openSource);
  const [depth, setDepth] = useState<0 | 1 | 2>(0);
  const status = claimStatus(data, claim);
  const suggested = claim.state === 'suggested';
  const moments = [...claim.evidence].sort((a, b) => (resolveSource(data, b.source).date ?? '').localeCompare(resolveSource(data, a.source).date ?? ''));

  return (
    <li className={cn('rounded-[2px] border', depth ? 'border-line-strong bg-canvas/40' : 'border-line', suggested && 'border-dashed')}>
      <button type="button" onClick={() => setDepth(depth ? 0 : 1)} aria-expanded={depth > 0} className="w-full px-3 py-2.5 text-left">
        <span className="block text-[13.5px] leading-snug text-ink">{claimSentence(data, claim, status)}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <StatusBadge status={status} />
          {suggested && <span className="text-[11.5px] text-ink-3">{t('suggested by the Atlas')}</span>}
          {!depth && <span className="ml-auto text-[11.5px] text-ink-3">{t('Why do you think that?')}</span>}
        </span>
      </button>

      {depth > 0 && (
        <div className="border-t border-line px-3 pt-2.5 pb-3">
          <ul className="space-y-1">
            {whyWeThink(data, claim).map((line) => (
              <li key={line} className="text-[12.5px] leading-snug text-ink-2">
                {line}
              </li>
            ))}
          </ul>

          {suggested ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button size="sm" icon={Check} onClick={() => adopt(claim.id)}>
                {t('Worth keeping an eye on')}
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => setAside(claim.id)}>
                {t('Not now')}
              </Button>
            </div>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-ink-3">{t('Does this fit your experience?')}</span>
              {(['agree', 'unsure', 'disagree'] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={claim.view?.stance === v}
                  onClick={() => setView(claim.id, claim.view?.stance === v ? null : v)}
                  className={cn(
                    'rounded-[2px] border px-1.5 py-0.5 text-[11.5px]',
                    claim.view?.stance === v ? 'border-ink/50 bg-ink/[0.07] text-ink' : 'border-line text-ink-3 hover:text-ink',
                  )}
                >
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
          )}

          {moments.length > 0 &&
            (depth < 2 ? (
              <button type="button" className="mt-2.5 inline-flex items-center gap-1 text-[12px] text-accent hover:underline" onClick={() => setDepth(2)}>
                {t('Show the moments')} <ChevronRight size={12} aria-hidden />
              </button>
            ) : (
              <ol className="mt-2.5 space-y-2 border-l border-line pl-3">
                {moments.map((ev) => {
                  const src = resolveSource(data, ev.source);
                  return (
                    <li key={ev.id}>
                      <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-3">
                        <span className="num">{formatDate(src.date)}</span>
                        {ev.kind && <span>{EVIDENCE_KIND_LABEL[ev.kind]}</span>}
                        {ev.stance === 'counters' && ev.kind !== 'counter_case' && <span>{t('against it')}</span>}
                      </div>
                      <p className="text-[12.5px] leading-snug text-ink-2">“{ev.excerpt}”</p>
                      {src.exists && (
                        <button
                          type="button"
                          className="mt-0.5 text-[11.5px] text-ink-3 underline decoration-ink-3/40 underline-offset-2 hover:text-ink"
                          onClick={() => openSource(ev.source, ev.excerpt)}
                        >
                          {t('Open what you wrote')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            ))}

          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
            onClick={() => open({ kind: 'claim', id: claim.id })}
          >
            {t('All of the reasoning')} <ArrowUpRight size={11} aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

const EFFECT_WORDS: { effect: Effect; label: () => string }[] = [
  { effect: 'raises', label: () => t('adds to it') },
  { effect: 'lowers', label: () => t('holds it back') },
  { effect: 'triggers', label: () => t('sets it off') },
];

/**
 * "Another explanation?": a reason in the person's own words. Naming
 * something that is already on the map links to it; a new name is added to
 * the map with a first guess at what kind of thing it is.
 */
export function AddReason({
  to,
  area,
  direction = 'into',
  initial = '',
  onDone,
}: {
  to: ID;
  area: AreaKey;
  direction?: 'into' | 'out';
  initial?: string;
  onDone?(): void;
}) {
  const data = useAtlas((s) => s.data);
  const addNode = useAtlas((s) => s.addNode);
  const addClaim = useAtlas((s) => s.addClaim);
  const listId = useId();
  const [name, setName] = useState(initial);
  const [effect, setEffect] = useState<Effect>('raises');
  const [how, setHow] = useState('');
  const elements = mapElements(data).filter((n) => n.id !== to);
  const match = elements.find((n) => n.label.toLowerCase() === name.trim().toLowerCase());
  const guess = match ? match.kind : inferKind(name);

  const submit = () => {
    const label = name.trim();
    if (!label) return;
    const other = match?.id ?? addNode({ label, kind: guess, area });
    const [from, target] = direction === 'into' ? [other, to] : [to, other];
    addClaim({ from, to: target, effect, via: how.trim() || undefined, author: 'user', state: 'adopted' });
    toast(t('Added as a hunch. It becomes surer as your notes show it.'), { tone: 'success' });
    setName('');
    setHow('');
    onDone?.();
  };

  return (
    <form
      className="space-y-2 rounded-[2px] border border-line bg-raised/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block">
        <span className="text-[12px] text-ink-2">{direction === 'into' ? t('What else might be behind it?') : t('What might it change?')}</span>
        <input
          className="field mt-1"
          list={listId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={direction === 'into' ? t('e.g. Late nights, Saying yes to everything') : t('e.g. My energy, The studio plan')}
        />
        <datalist id={listId}>
          {elements.map((n) => (
            <option key={n.id} value={n.label} />
          ))}
        </datalist>
      </label>
      {name.trim() && (
        <p className="text-[11.5px] text-ink-3">
          {match
            ? t('Already on your map, as a {kind}.', { kind: KIND_META[match.kind].label.toLowerCase() })
            : t('New: it will be added to the map as a {kind}. You can change that later.', { kind: KIND_META[guess].label.toLowerCase() })}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {EFFECT_WORDS.map((w) => (
          <button
            key={w.effect}
            type="button"
            aria-pressed={effect === w.effect}
            onClick={() => setEffect(w.effect)}
            className={cn(
              'rounded-[2px] border px-2 py-0.5 text-[12px]',
              effect === w.effect ? 'border-ink/50 bg-ink/[0.07] text-ink' : 'border-line text-ink-3 hover:text-ink',
            )}
            style={effect === w.effect ? { borderColor: EFFECT_META[w.effect].color } : undefined}
          >
            {w.label()}
          </button>
        ))}
      </div>
      <input className="field" value={how} onChange={(e) => setHow(e.target.value)} placeholder={t('How, if you have a sense of it (optional)')} />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" icon={Plus} disabled={!name.trim()}>
          {t('Add this reason')}
        </Button>
        {onDone && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t('Cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** "Try it for two weeks": proposed tests of one possible reason, adopted with one tap. */
export function TryIt({ claimId }: { claimId: ID }) {
  const busy = useUI((s) => s.busy[`propose:${claimId}`]);
  const open = useUI((s) => s.openEntity);
  const [drafts, setDrafts] = useState<ExperimentDraft[] | null>(null);
  if (!drafts)
    return (
      <Button size="sm" icon={FlaskConical} loading={busy} onClick={async () => setDrafts(await proposeExperiments(claimId))}>
        {t('Try a change and see')}
      </Button>
    );
  return (
    <ul className="space-y-2">
      {drafts.map((d) => (
        <li key={d.title} className="rounded-[2px] border border-dashed border-line-strong p-2.5">
          <div className="text-[13px] text-ink">{d.title}</div>
          <p className="mt-0.5 text-[12px] text-ink-2">{d.design}</p>
          {d.prediction && (
            <p className="mt-1 text-[11.5px] text-ink-3">
              {t('What should happen')}: {d.prediction}
            </p>
          )}
          <Button
            size="sm"
            className="mt-2"
            icon={Plus}
            onClick={() => {
              const id = adoptExperimentDraft(d, { claimId });
              setDrafts(null);
              open({ kind: 'experiment', id });
            }}
          >
            {t('Use this test')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** The two or three things that happened to something lately, as plain lines. */
export function Lately({ items, empty }: { items: HistoryItem[]; empty: string }) {
  const open = useUI((s) => s.openEntity);
  if (!items.length) return <p className="text-[12.5px] leading-snug text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-0.5">
      {items.map((h) => (
        <li key={h.key}>
          <button
            type="button"
            onClick={() => open(h.ref)}
            className="group flex w-full items-baseline gap-2 rounded-[2px] py-0.5 text-left text-[13px] leading-snug"
          >
            <span className="num w-[52px] shrink-0 text-[11px] text-ink-3">{formatDate(h.date)}</span>
            <span className="min-w-0 flex-1 text-ink-2 group-hover:text-ink">{h.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Something like this has happened before": a pattern, in words, with how often. */
export function RepeatRow({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const p = data.patterns[id];
  if (!p) return null;
  const stats = patternStats(data, p);
  return (
    <li>
      <button
        type="button"
        onClick={() => open({ kind: 'pattern', id })}
        className="group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink/[0.035]"
      >
        <PatternIcon size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug text-ink-2 group-hover:text-ink">{patternTitle(p)}</span>
          <span className="block text-[11.5px] text-ink-3">
            {stats.frequency} · {REGULARITY_LABEL[stats.regularity].toLowerCase()}
          </span>
        </span>
      </button>
    </li>
  );
}

/** A quiet link to the lens that shows more of the same answer. */
export function SeeIn({ route, children }: { route: RouteKey; children: ReactNode }) {
  return (
    <button type="button" onClick={() => navigate(route)} className="mt-2.5 inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
      {children} <ArrowRight size={12} aria-hidden />
    </button>
  );
}
