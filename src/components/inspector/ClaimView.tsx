import { Archive, Check, FlaskConical, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { claimCode, claimGaps, claimSentence, claimStatus, evidenceCandidates, evidenceProfile, otherExplanations } from '../../domain/claims';
import { EFFECT_META, EFFECTS, EVIDENCE_KIND_HINT, EVIDENCE_KIND_LABEL, EXPERIMENT_STATUS_LABEL, VIEW_LABEL } from '../../domain/constants';
import { loopName, loopsWithClaim } from '../../domain/loops';
import { experimentCode, testsOfClaim } from '../../domain/selectors';
import type { Effect, EvidenceKind, ID, View } from '../../domain/types';
import type { ExperimentDraft } from '../../ai/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { adoptExperimentDraft, proposeExperiments } from '../../state/operations';
import { useUI } from '../../state/uiStore';
import { EvidenceRow } from '../evidence/EvidenceRow';
import { KnowledgeTag, StatusBadge, StatusLadder } from '../evidence/Status';
import { ClaimIcon, LoopIcon } from '../icons';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Segmented } from '../ui/primitives';
import { whyWeThink } from '../../domain/ask';
import { ClaimRow, Fold, Muted, NodeChip, PanelSection } from './parts';
import { t } from '../../i18n';

const firstSentence = (text: string) => {
  const s = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
};

/**
 * All of the reasoning behind one possible reason: why the Atlas thinks so in
 * plain words first, then (folded) the counts, the moments and the notes that
 * might bear on it. How sure it is comes from the kinds of evidence behind it,
 * never typed in; the person's own view is kept beside it, apart.
 */
export function ClaimView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const a = useAtlas.getState();
  const open = useUI((s) => s.openEntity);
  const close = useUI((s) => s.closeInspector);
  const busy = useUI((s) => s.busy[`propose:${id}`]);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<ExperimentDraft[] | null>(null);
  const claim = data.claims[id];
  const status = claim ? claimStatus(data, claim) : 'proposed';
  const profile = useMemo(() => (claim ? evidenceProfile(data, claim) : null), [data, claim]);
  const candidates = useMemo(() => (claim ? evidenceCandidates(data, claim).slice(0, 5) : []), [data, claim]);
  const others = useMemo(() => (claim ? otherExplanations(data, claim) : []), [data, claim]);
  const tests = claim ? testsOfClaim(data, id) : [];
  const loops = useMemo(() => (claim ? loopsWithClaim(data, id) : []), [data, claim, id]);
  if (!claim || !profile) return null;

  const sources = new Set(claim.evidence.map((e) => `${e.source.kind}:${e.source.id}`)).size;
  const knowledge = claim.state === 'suggested' ? 'suggested' : status === 'tested' ? 'tested' : 'claimed';
  const addFrom = (c: (typeof candidates)[number], kind: EvidenceKind) =>
    a.addClaimEvidence(id, {
      source: c.source,
      stance: kind === 'counter_case' ? 'counters' : 'supports',
      kind,
      excerpt: firstSentence(c.body || c.title),
      addedBy: 'user',
    });

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[2px] border" style={{ borderColor: `${EFFECT_META[claim.effect].color}66` }}>
            <ClaimIcon size={13} color={EFFECT_META[claim.effect].color} strokeWidth={1.8} aria-hidden />
          </span>
          <span className="label">{t('A possible reason')}</span>
          <StatusBadge status={status} />
          <span className="ml-auto">
            <KnowledgeTag kind={knowledge} />
          </span>
        </div>
        <h2 className="mt-2.5 display text-[19px] leading-[1.25] text-ink">{claimSentence(data, claim, status)}</h2>

        {editing ? (
          <ClaimEditForm id={id} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
              <NodeChip id={claim.from} />
              {claim.with.map((w) => (
                <span key={w} className="inline-flex items-center gap-1.5">
                  +<NodeChip id={w} />
                </span>
              ))}
              <span className="font-mono text-[11px] tracking-wide uppercase" style={{ color: EFFECT_META[claim.effect].color }}>
                {EFFECT_META[claim.effect].glyph} {EFFECT_META[claim.effect].label}
              </span>
              <NodeChip id={claim.to} />
            </div>
            <dl className="mt-2.5 space-y-1 text-[12.5px]">
              <div className="flex gap-2">
                <dt className="w-[72px] shrink-0 text-ink-3">{t('How')}</dt>
                <dd className="text-ink-2">{claim.via || <span className="text-ink-3">{t('Not described yet')}</span>}</dd>
              </div>
              {claim.when && (
                <div className="flex gap-2">
                  <dt className="w-[72px] shrink-0 text-ink-3">{t('When')}</dt>
                  <dd className="text-ink-2">{claim.when}</dd>
                </div>
              )}
              {claim.lag && (
                <div className="flex gap-2">
                  <dt className="w-[72px] shrink-0 text-ink-3">{t('Delay')}</dt>
                  <dd className="text-ink-2">{claim.lag}</dd>
                </div>
              )}
            </dl>
          </>
        )}

        {claim.state === 'suggested' && (
          <div className="mt-3 rounded-[2px] border border-dashed border-line-strong p-3">
            <p className="text-[12.5px] leading-snug text-ink-2">
              {t('Suggested by the Atlas from your notes. It stays off the map until you keep it, and keeping it does not make it true.')}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" icon={Check} onClick={() => a.adoptClaim(id)}>
                {t('Worth keeping an eye on')}
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => a.setClaimAside(id)}>
                {t('Not now')}
              </Button>
            </div>
          </div>
        )}
        {claim.state === 'set_aside' && <p className="mt-3 text-[12px] text-ink-3">{t('Put aside for now. Kept for reference, off the map.')}</p>}
        {claim.retired && (
          <div className="mt-3 rounded-[2px] border border-line p-3">
            <p className="text-[12.5px] text-ink-2">
              {t('No longer holds, since {date}.', { date: formatDate(claim.retired.at, { year: true }) })} {claim.retired.note}
            </p>
            <Button size="sm" variant="ghost" icon={RotateCcw} className="mt-2" onClick={() => a.restoreClaim(id)}>
              {t('It holds again')}
            </Button>
          </div>
        )}
        {!editing && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              {t('Edit')}
            </Button>
            {!claim.retired && claim.state === 'adopted' && (
              <Button
                size="sm"
                variant="ghost"
                icon={Archive}
                onClick={() => a.retireClaim(id)}
                title={t('People change: mark that it held for a while, then stopped')}
              >
                {t('It stopped holding')}
              </Button>
            )}
            <span className="ml-auto">
              <ConfirmButton
                onConfirm={() => {
                  a.deleteClaim(id);
                  close();
                }}
              />
            </span>
          </div>
        )}
      </div>

      <PanelSection title={t('Why do you think that?')}>
        <ul className="space-y-1">
          {whyWeThink(data, claim).map((line) => (
            <li key={line} className="text-[13px] leading-snug text-ink-2">
              {line}
            </li>
          ))}
        </ul>
        {status !== 'tested' && status !== 'retired' && (
          <div className="mt-3">
            <div className="text-[11.5px] text-ink-3">{t('What would make it surer')}</div>
            <ul className="mt-1 space-y-0.5">
              {claimGaps(data, claim).map((g) => (
                <li key={g} className="text-[12.5px] leading-snug text-ink-2">
                  · {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelSection>

      <Fold title={t('How sure, in detail')}>
        <StatusLadder status={status} />
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
          <Fact label={t('Records cited')} value={String(sources)} />
          <Fact label={t('Episodes')} value={String(profile.episodes)} hint={t('Separate weeks with an instance or a contrast case')} />
          <Fact label={t('Contrast cases')} value={String(profile.contrast)} hint={EVIDENCE_KIND_HINT.contrast} />
          <Fact label={t('Counter-cases')} value={String(profile.counter)} hint={EVIDENCE_KIND_HINT.counter_case} />
          <Fact label={t('Mechanism')} value={profile.mechanism ? t('described') : t('missing')} hint={EVIDENCE_KIND_HINT.mechanism} />
          <Fact
            label={t('Tests')}
            value={profile.testsFor + profile.testsAgainst ? t('{a} for · {b} against', { a: profile.testsFor, b: profile.testsAgainst }) : t('none')}
          />
        </dl>
      </Fold>

      <Fold title={t('The moments behind it')} count={claim.evidence.length} defaultOpen={claim.evidence.length > 0 && claim.evidence.length <= 3}>
        {claim.evidence.length ? (
          <ul className="divide-y divide-line">
            {claim.evidence.map((e) => (
              <EvidenceRow key={e.id} evidence={e} onRemove={() => a.removeClaimEvidence(id, e.id)} />
            ))}
          </ul>
        ) : (
          <Muted>{t('Nothing behind it yet. It stays a hunch until your notes show it.')}</Muted>
        )}
      </Fold>

      {candidates.length > 0 && claim.state !== 'set_aside' && (
        <Fold title={t('Notes that might bear on it')} count={candidates.length}>
          <Muted>{t('Records that mention one or both sides. You judge what each shows.')}</Muted>
          <ul className="mt-2 space-y-2.5">
            {candidates.map((c) => (
              <li key={`${c.source.kind}:${c.source.id}`} className="rounded-[2px] border border-line p-2.5">
                <div className="flex items-baseline gap-2">
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[12.5px] text-ink-2 hover:text-ink" onClick={() => open(c.source)}>
                    {c.title}
                  </button>
                  <span className="num shrink-0 text-[11px] text-ink-3">{formatDate(c.date)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-3">{c.body}</p>
                <p className="mt-1 text-[11px] text-ink-3">
                  {c.sides === 'both' ? t('Mentions both sides') : c.sides === 'from' ? t('Mentions the cause only') : t('Mentions the effect only')}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(['instance', 'contrast', 'counter_case'] as EvidenceKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="rounded-[2px] border border-line px-1.5 py-0.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
                      title={EVIDENCE_KIND_HINT[k]}
                      onClick={() => addFrom(c, k)}
                    >
                      + {EVIDENCE_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      <PanelSection title={t('Does this fit your experience?')}>
        <Segmented<View | 'none'>
          label={t('Your view')}
          size="sm"
          value={claim.view?.stance ?? 'none'}
          onChange={(v) => a.setClaimView(id, v === 'none' ? null : v)}
          options={[{ value: 'none', label: '—' }, ...(['agree', 'unsure', 'disagree'] as const).map((v) => ({ value: v, label: VIEW_LABEL[v] }))]}
        />
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          {t('Kept apart from what your notes show: your view never changes how sure it is, and how sure it is never overrules your view.')}
        </p>
      </PanelSection>

      <PanelSection title={t('Other explanations')} count={others.length}>
        {others.length ? (
          <ul className="-mx-1.5">
            {others.map(({ claim: o, rival }) => (
              <li key={o.id} className="flex items-start">
                <ul className="min-w-0 flex-1">
                  <ClaimRow id={o.id} />
                </ul>
                <button
                  type="button"
                  className="mt-1.5 shrink-0 rounded-[2px] border border-line px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-ink"
                  aria-pressed={rival}
                  title={t('Competing explanations: if one holds, the other may not be needed')}
                  onClick={() => a.toggleRival(id, o.id)}
                >
                  {rival ? t('Competing') : t('Mark as competing')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Muted>{t('Nothing else explains the same thing yet. What else could produce it?')}</Muted>
        )}
      </PanelSection>

      <PanelSection title={t('Try it and see')} count={tests.length}>
        {tests.length > 0 && (
          <ul className="-mx-1.5 mb-2">
            {tests.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className="group flex w-full items-baseline gap-2 rounded-[2px] px-1.5 py-1 text-left hover:bg-ink/[0.035]"
                  onClick={() => open({ kind: 'experiment', id: x.id })}
                >
                  <span className="num w-[52px] shrink-0 text-[11px] text-ink-3">{experimentCode(x.code)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">{x.title}</span>
                  <span className="shrink-0 text-[11px] text-ink-3">{EXPERIMENT_STATUS_LABEL[x.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {drafts ? (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.title} className="rounded-[2px] border border-line p-2.5">
                <div className="text-[13px] text-ink">{d.title}</div>
                <p className="mt-0.5 text-[12px] text-ink-2">{d.design}</p>
                <p className="mt-1 text-[11.5px] text-ink-3">
                  {t('What should happen')}: {d.prediction}
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  icon={Plus}
                  onClick={() => {
                    const xid = adoptExperimentDraft(d, { claimId: id });
                    setDrafts(null);
                    open({ kind: 'experiment', id: xid });
                  }}
                >
                  {t('Use this test')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          claim.state === 'adopted' &&
          !claim.retired && (
            <Button size="sm" variant="ghost" icon={FlaskConical} disabled={busy} onClick={async () => setDrafts(await proposeExperiments(id))}>
              {busy ? t('Thinking…') : t('Try a change and see')}
            </Button>
          )
        )}
      </PanelSection>

      {loops.length > 0 && (
        <PanelSection title={t('Cycles it is part of')} count={loops.length}>
          <ul className="-mx-1.5">
            {loops.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="group flex w-full items-center gap-2 rounded-[2px] px-1.5 py-1 text-left hover:bg-ink/[0.035]"
                  onClick={() => open({ kind: 'loop', id: l.id })}
                >
                  <LoopIcon size={13} className="shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">{loopName(l)}</span>
                  {l.breakpoints.includes(id) && <span className="text-[11px] text-ink-3">{t('least sure step')}</span>}
                </button>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}

      <div className="border-t border-line px-4 py-3 text-[11.5px] text-ink-3">
        {claimCode(claim.code)} · {t('Stated {date}', { date: formatDate(claim.createdAt, { year: true }) })} ·{' '}
        {claim.author === 'user' ? t('by you') : t('suggested by the Atlas')}
        {claim.view && ` · ${t('your view: {v}', { v: VIEW_LABEL[claim.view.stance].toLowerCase() })}`}
      </div>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <dt className="text-ink-3">{label}</dt>
      <dd className="num text-ink-2">{value}</dd>
    </div>
  );
}

function ClaimEditForm({ id, onDone }: { id: ID; onDone(): void }) {
  const claim = useAtlas((s) => s.data.claims[id]);
  const updateClaim = useAtlas((s) => s.updateClaim);
  const [effect, setEffect] = useState<Effect>(claim?.effect ?? 'raises');
  const [via, setVia] = useState(claim?.via ?? '');
  const [when, setWhen] = useState(claim?.when ?? '');
  const [lag, setLag] = useState(claim?.lag ?? '');
  if (!claim) return null;
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        updateClaim(id, { effect, via: via.trim() || undefined, when: when.trim() || undefined, lag: lag.trim() || undefined });
        onDone();
      }}
    >
      <label className="block">
        <span className="label">{t('Effect')}</span>
        <select className="field mt-1" value={effect} onChange={(e) => setEffect(e.target.value as Effect)}>
          {EFFECTS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label} — {x.description}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">{t('How, in your words')}</span>
        <input className="field mt-1" value={via} onChange={(e) => setVia(e.target.value)} placeholder={t('The mechanism, e.g. less time for deep work')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">{t('When it holds')}</span>
          <input className="field mt-1" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('Typical delay')}</span>
          <input className="field mt-1" value={lag} onChange={(e) => setLag(e.target.value)} placeholder={t('e.g. 2–6 weeks')} />
        </label>
      </div>
      <p className="text-[11.5px] text-ink-3">{t('Editing the claim keeps its evidence. If the claim changes meaning, check the evidence still fits.')}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" icon={Check}>
          {t('Save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}
