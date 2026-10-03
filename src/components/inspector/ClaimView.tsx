import { Archive, Check, FlaskConical, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  claimCode,
  claimGaps,
  claimSentence,
  claimStatus,
  evidenceCandidates,
  evidenceProfile,
  historySource,
  lagWindow,
  orderedEpisodes,
  otherExplanations,
  recordRows,
  scopePhrase,
} from '../../domain/claims';
import { alternativesOf } from '../../domain/accounts';
import { claimHistory } from '../../domain/beliefs';
import { caseRows, familyOf, pushes, type CaseRow } from '../../domain/compare';
import { inquiriesFor } from '../../domain/inquiry';
import { readiness } from '../../domain/readiness';
import { claimTrace } from '../../domain/trace';
import {
  expectSentence,
  EFFECT_META,
  EFFECTS,
  EVIDENCE_KIND_HINT,
  EVIDENCE_KIND_LABEL,
  EXPERIMENT_STATUS_LABEL,
  isFactorKind,
  READS_LABEL,
  readingsFor,
  stateSentence,
  VIEW_LABEL,
} from '../../domain/constants';
import { expectationsFor } from '../../domain/expect';
import { scrutinize } from '../../domain/scrutiny';
import { loopName, loopsWithClaim } from '../../domain/loops';
import { experimentCode, testsOfClaim } from '../../domain/selectors';
import type { Claim, Effect, EvidenceKind, FactorReading, ID, View } from '../../domain/types';
import type { ExperimentDraft } from '../../ai/types';
import { addDays, formatDate, formatMonth, todayISO } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { ROLE_META } from '../../domain/constants';
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
import { ExpectationLine } from './Changes';
import { AccountList, InquiryList } from './Inquiry';
import { ClaimRow, Fold, Muted, NodeChip, PanelSection } from './parts';
import { FullOnly, MoreDetail, useSimple } from '../ui/Detail';
import { t, tn } from '../../i18n';

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
  const simple = useSimple();
  const status = claim ? claimStatus(data, claim) : 'proposed';
  const profile = useMemo(() => (claim ? evidenceProfile(data, claim) : null), [data, claim]);
  const candidates = useMemo(() => (claim ? evidenceCandidates(data, claim).slice(0, 5) : []), [data, claim]);
  const episodes = useMemo(() => (claim ? orderedEpisodes(data, claim) : []), [data, claim]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const others = useMemo(() => (claim ? otherExplanations(data, claim) : []), [data, claim]);
  const tests = claim ? testsOfClaim(data, id) : [];
  const loops = useMemo(() => (claim ? loopsWithClaim(data, id) : []), [data, claim, id]);
  const rows = useMemo(() => (claim ? recordRows(data, claim) : null), [data, claim]);
  const scrutiny = useMemo(() => (claim ? scrutinize(data, claim) : null), [data, claim]);
  const predictions = useMemo(() => (claim ? expectationsFor(data, id) : null), [data, claim, id]);
  const trace = useMemo(() => (claim ? claimTrace(data, claim) : null), [data, claim]);
  const asks = useMemo(() => (claim ? inquiriesFor(data, { claimId: id }) : []), [data, claim, id]);
  const history = useMemo(() => (claim ? claimHistory(data, id).slice().reverse() : []), [data, claim, id]);
  const ready = useMemo(() => (claim ? readiness(data, claim) : null), [data, claim]);
  if (!claim || !profile || !rows || !scrutiny || !predictions || !trace || !ready) return null;
  const bounds = scopePhrase(data, claim);

  const sources = new Set(claim.evidence.map((e) => `${e.source.kind}:${e.source.id}`)).size;
  const knowledge = claim.state === 'suggested' ? 'suggested' : status === 'tested' ? 'tested' : 'claimed';
  const addFrom = (c: (typeof candidates)[number], kind: EvidenceKind) =>
    a.addClaimEvidence(id, {
      source: c.source,
      stance: kind === 'counter_case' ? 'counters' : kind === 'elsewhere' ? 'neutral' : 'supports',
      kind,
      excerpt: firstSentence(c.body || c.title),
      addedBy: 'user',
    });
  // What a record can show depends on which side it mentions: both, an ordered time or the "how"; the cause only, an exception.
  const choices = (sides: (typeof candidates)[number]['sides']): EvidenceKind[] => (sides === 'both' ? ['instance', 'mechanism'] : ['counter_case']);
  const openEpisodes = episodes.filter((e) => !dismissed.includes(e.week));
  const rivals = others.filter((o) => o.rival);
  const alongside = others.filter((o) => !o.rival);

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
        <h2 className="mt-2.5 display text-[21px] leading-[1.25] text-ink">{claimSentence(data, claim, status)}</h2>

        {editing ? (
          <ClaimEditForm id={id} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
              <NodeChip id={claim.from} />
              {claim.aspect?.from && <span className="text-ink-2">({claim.aspect.from})</span>}
              {claim.with.map((w) => (
                <span key={w} className="inline-flex items-center gap-1.5">
                  +<NodeChip id={w} />
                </span>
              ))}
              <span className="text-[12px]" style={{ color: EFFECT_META[claim.effect].color }} title={ROLE_META[EFFECT_META[claim.effect].role].description}>
                {EFFECT_META[claim.effect].glyph} {EFFECT_META[claim.effect].plain}
              </span>
              <NodeChip id={claim.to} />
              {claim.aspect?.to && <span className="text-ink-2">({claim.aspect.to})</span>}
            </div>
            {!claim.retired && claim.state === 'adopted' && <PromoteAspects claim={claim} />}
            <dl className="mt-2.5 space-y-1 text-[12.5px]">
              <div className="flex gap-2">
                <dt className="w-[72px] shrink-0 text-ink-3">{t('How')}</dt>
                <dd className="text-ink-2">
                  {claim.via || <span className="text-ink-3">{t('Not described yet')}</span>}
                  {claim.via && (
                    <span className="block text-[11.5px] text-ink-3">
                      {profile.mechanism ? t('Seen happening in what you wrote.') : t('Your explanation: described, not yet seen happening.')}
                    </span>
                  )}
                </dd>
              </div>
              {bounds && (
                <div className="flex gap-2">
                  <dt className="w-[72px] shrink-0 text-ink-3">{t('Only when')}</dt>
                  <dd className="text-ink-2">
                    {bounds}
                    {(claim.condition || claim.scope) && (
                      <span className="block text-[11.5px] text-ink-3">{t('Times outside these bounds are left out, not counted against it.')}</span>
                    )}
                  </dd>
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
        {claim.retired &&
          (claim.retired.revisedInto && data.claims[claim.retired.revisedInto] ? (
            <div className="mt-3 rounded-[2px] border border-line p-3">
              <p className="text-[12.5px] text-ink-2">
                {t('An earlier version, revised on {date}. Its evidence stays here as it was.', { date: formatDate(claim.retired.at, { year: true }) })}
              </p>
              <ul className="-mx-1.5 mt-1">
                <ClaimRow id={claim.retired.revisedInto} />
              </ul>
            </div>
          ) : (
            <div className="mt-3 rounded-[2px] border border-line p-3">
              <p className="text-[12.5px] text-ink-2">
                {t('No longer holds, since {date}.', { date: formatDate(claim.retired.at, { year: true }) })} {claim.retired.note}
              </p>
              <Button size="sm" variant="ghost" icon={RotateCcw} className="mt-2" onClick={() => a.restoreClaim(id)}>
                {t('It holds again')}
              </Button>
            </div>
          ))}
        {claim.revises && data.claims[claim.revises] && (
          <p className="mt-3 text-[12px] text-ink-3">
            {t('Revises an earlier version:')}{' '}
            <button
              type="button"
              className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
              onClick={() => open({ kind: 'claim', id: claim.revises! })}
            >
              {claimCode(data.claims[claim.revises].code)}
            </button>
            {claim.evidence.some((e) => e.carriedFrom) &&
              ` · ${tn(claim.evidence.filter((e) => e.carriedFrom).length, 'one piece of evidence came along', '{n} pieces of evidence came along')}`}
          </p>
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
        <FullOnly>
          <p className="mt-2 text-[11.5px] leading-snug text-ink-3">{t('By the rule: {rule}', { rule: trace.says })}</p>
        </FullOnly>
        {!simple && trace.assumes.length > 0 && (
          <div className="mt-3">
            <div className="text-[11.5px] text-ink-3">{t('What it takes for granted')}</div>
            <ul className="mt-1 space-y-0.5">
              {trace.assumes.map((a) => (
                <li key={a} className="text-[12.5px] leading-snug text-ink-2">
                  · {a}
                </li>
              ))}
            </ul>
          </div>
        )}
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
        {asks.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11.5px] text-ink-3">{t('What would tell most')}</div>
            <InquiryList items={asks} max={1} here={{ kind: 'claim', id }} />
          </div>
        )}
      </PanelSection>

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

      <MoreDetail>
        {openEpisodes.length > 0 && claim.state !== 'set_aside' && (
          <Fold title={t('Times it may have happened')} count={openEpisodes.length}>
            <Muted>
              {t(
                'In your history, the cause came first and the outcome followed within {n} days. Coming first is a reason to look, not proof: does it show one leading to the other?',
                {
                  n: Math.max(...openEpisodes.map((e) => e.days), 0) || 0,
                },
              )}
            </Muted>
            <ul className="mt-2 space-y-2.5">
              {openEpisodes.map((e) => {
                const source = historySource(e.effect)!;
                const cause = historySource(e.cause)!;
                return (
                  <li key={e.week} className="rounded-[2px] border border-line p-2.5 text-[12.5px]">
                    <p className="text-ink-2">
                      <span className="num text-[11px] text-ink-3">{formatDate(e.cause.date)}</span> {e.cause.label}
                    </p>
                    <p className="text-ink-2">
                      <span className="num text-[11px] text-ink-3">{formatDate(e.effect.date)}</span> {e.effect.label}{' '}
                      <span className="text-[11px] text-ink-3">{t('{n} days later', { n: e.days })}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="tap rounded-[2px] border border-line px-1.5 py-0.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
                        onClick={() =>
                          a.addClaimEvidence(id, { source, cause, stance: 'supports', kind: 'instance', excerpt: e.effect.label, addedBy: 'user' })
                        }
                      >
                        + {t('Yes: one, then the other')}
                      </button>
                      <button
                        type="button"
                        className="tap rounded-[2px] px-1.5 py-0.5 text-[11.5px] text-ink-3 hover:text-ink"
                        onClick={() => setDismissed([...dismissed, e.week])}
                      >
                        {t('Not related')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Fold>
        )}

        {candidates.length > 0 && claim.state !== 'set_aside' && (
          <Fold title={t('Notes that might bear on it')} count={candidates.length}>
            <Muted>{t('Notes that mention both sides, or the cause alone. You judge what each shows.')}</Muted>
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
                    {c.sides === 'both'
                      ? t('Mentions both sides: does it tell one first, then the other?')
                      : t('Mentions the cause only: did the outcome fail to follow?')}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {choices(c.sides).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="tap rounded-[2px] border border-line px-1.5 py-0.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
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

        <Fold title={t('How sure, in detail')}>
          <StatusLadder status={status} />
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
            <Fact label={t('Records cited')} value={String(sources)} />
            <Fact
              label={t('Episodes, in order')}
              value={String(profile.episodes)}
              hint={t('Separate weeks where it came first and the outcome followed, or a time without it')}
            />
            <Fact label={t('Times without it')} value={String(profile.contrast)} hint={EVIDENCE_KIND_HINT.contrast} />
            <Fact label={t('Exceptions')} value={String(profile.counter)} hint={EVIDENCE_KIND_HINT.counter_case} />
            <Fact label={t('Happened without it')} value={String(profile.elsewhere ?? 0)} hint={EVIDENCE_KIND_HINT.elsewhere} />
            <Fact
              label={t('How it works')}
              value={profile.mechanism ? t('seen') : profile.mechanismDescribed ? t('described only') : t('missing')}
              hint={EVIDENCE_KIND_HINT.mechanism}
            />
            <Fact
              label={t('Tests')}
              value={profile.testsFor + profile.testsAgainst ? t('{a} for · {b} against', { a: profile.testsFor, b: profile.testsAgainst }) : t('none')}
            />
            <Fact
              label={t('From what was recorded')}
              value={String((profile.fromRecord?.fits ?? 0) + (profile.fromRecord?.contrast ?? 0))}
              hint={t('Episodes the record shows by itself, from what changed, apart from the ones you judged')}
            />
            <Fact
              label={t('Predictions')}
              value={
                (profile.predictionsHeld ?? 0) + (profile.predictionsFailed ?? 0)
                  ? t('{a} held · {b} did not', { a: profile.predictionsHeld ?? 0, b: profile.predictionsFailed ?? 0 })
                  : t('none')
              }
            />
            {profile.baseRate && (
              <Fact
                label={t('Goes that way anyway')}
                value={t('{a} of {b} episodes', { a: profile.baseRate.same, b: profile.baseRate.known })}
                hint={t('How often the outcome went the way this predicts, with or without the cause')}
              />
            )}
            {profile.needsTellingApart && (
              <Fact
                label={t('Told apart')}
                value={String(profile.toldApart ?? 0)}
                hint={t('Times it happened while what else could produce it was not doing the same')}
              />
            )}
          </dl>
          {trace.left.length > 0 && (
            <div className="mt-3">
              <div className="text-[11.5px] text-ink-3">{t('Left out, and why')}</div>
              <ul className="mt-1 space-y-0.5">
                {trace.left.map((l) => (
                  <li key={l} className="text-[12px] leading-snug text-ink-2">
                    · {l}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 border-t border-line pt-2">
            <div className="text-[11.5px] text-ink-3">
              {ready.ready
                ? t('The record could now bear a formal comparison. None runs in this version, and none could ever make it “tested”.')
                : t('Not yet enough for a formal comparison, which would only mislead now:')}
            </div>
            {!ready.ready && (
              <ul className="mt-1 space-y-0.5">
                {ready.checks
                  .filter((c) => !c.ok)
                  .map((c) => (
                    <li key={c.key} className="text-[12px] leading-snug text-ink-2">
                      · {c.says}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </Fold>

        <Fold title={t('How this changed')} count={history.length}>
          {history.length ? (
            <ul className="space-y-1.5">
              {history.map((u) => (
                <li key={u.id} className="text-[12.5px] leading-snug text-ink-2">
                  <span className="num mr-1.5 text-[11px] text-ink-3">{formatDate(u.at, { year: true })}</span>
                  {u.summary}
                </li>
              ))}
            </ul>
          ) : (
            <Muted>{t('Nothing has changed its standing since the Atlas began keeping track.')}</Muted>
          )}
        </Fold>

        <Fold title={t('What the record shows')} count={caseRows(data, claim).length}>
          <RecordComparison claim={claim} judged={rows.judged} />
        </Fold>

        <OtherReadings claim={claim} scrutiny={scrutiny} />

        <PanelSection title={t('Competing explanations')} count={rivals.length}>
          <Muted>{t('If one of these holds, this one may not be needed. More than one can still be true.')}</Muted>
          {rivals.length > 0 && (
            <ul className="-mx-1.5 mt-1">
              {rivals.map(({ claim: o }) => (
                <li key={o.id} className="flex items-start">
                  <ul className="min-w-0 flex-1">
                    <ClaimRow id={o.id} />
                  </ul>
                  <button
                    type="button"
                    className="tap mt-1.5 shrink-0 rounded-[2px] border border-line px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-ink"
                    aria-pressed
                    onClick={() => a.toggleRival(id, o.id)}
                  >
                    {t('Competing')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PanelSection>

        <PanelSection title={t('Also contributing')} count={alongside.length}>
          {alongside.length ? (
            <ul className="-mx-1.5">
              {alongside.map(({ claim: o, rival }) => (
                <li key={o.id} className="flex items-start">
                  <ul className="min-w-0 flex-1">
                    <ClaimRow id={o.id} />
                  </ul>
                  <button
                    type="button"
                    className="tap mt-1.5 shrink-0 rounded-[2px] border border-line px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-ink"
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
            <Muted>{t('Nothing else explains the same outcome yet. What else could produce it? Part of it may also be chance.')}</Muted>
          )}
        </PanelSection>

        <PanelSection title={t('Predictions from it')} count={predictions.direct.length + predictions.chains.length}>
          <Predictions claim={claim} direct={predictions.direct} chains={predictions.chains} />
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
                    {l.leastCertain.includes(id) && <span className="text-[11px] text-ink-3">{t('least sure step')}</span>}
                    {l.leverage.includes(id) && <span className="text-[11px] text-ink-3">{t('where you can act')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </PanelSection>
        )}
      </MoreDetail>

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
  const data = useAtlas((s) => s.data);
  const claim = data.claims[id];
  const updateClaim = useAtlas((s) => s.updateClaim);
  const [effect, setEffect] = useState<Effect>(claim?.effect ?? 'raises');
  const [via, setVia] = useState(claim?.via ?? '');
  const [when, setWhen] = useState(claim?.when ?? '');
  const [lag, setLag] = useState(claim?.lag ?? '');
  const [fromAspect, setFromAspect] = useState(claim?.aspect?.from ?? '');
  const [toAspect, setToAspect] = useState(claim?.aspect?.to ?? '');
  const [condFactor, setCondFactor] = useState<ID>(claim?.condition?.factor ?? '');
  const [condReads, setCondReads] = useState<FactorReading>(claim?.condition?.reads ?? 'high');
  const [timescale, setTimescale] = useState<'acute' | 'cumulative'>(claim?.scope?.timescale ?? 'acute');
  const [from, setFrom] = useState(claim?.scope?.from ?? '');
  const [until, setUntil] = useState(claim?.scope?.until ?? '');
  const openEntity = useUI((s) => s.openEntity);
  if (!claim) return null;
  const factors = Object.values(data.nodes)
    .filter((n) => n.adopted && isFactorKind(n.kind) && n.id !== claim.from && n.id !== claim.to)
    .sort((x, y) => x.label.localeCompare(y.label));
  const fromLabel = data.nodes[claim.from]?.label ?? '';
  const toLabel = data.nodes[claim.to]?.label ?? '';
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const next = updateClaim(id, {
          effect,
          via: via.trim() || undefined,
          when: when.trim() || undefined,
          lag: lag.trim() || undefined,
          aspect: fromAspect.trim() || toAspect.trim() ? { from: fromAspect.trim() || undefined, to: toAspect.trim() || undefined } : undefined,
          condition: condFactor ? { factor: condFactor, reads: condReads } : undefined,
          scope: scopeOf(claim.scope, timescale, from, until),
        });
        onDone();
        if (next !== id) openEntity({ kind: 'claim', id: next });
      }}
    >
      <label className="block">
        <span className="label">{t('What about {name} changes', { name: fromLabel })}</span>
        <input
          className="field mt-1"
          value={fromAspect}
          onChange={(e) => setFromAspect(e.target.value)}
          placeholder={t('e.g. more of it, it starting, scope added late')}
        />
      </label>
      <label className="block">
        <span className="label">{t('How it may act')}</span>
        <select className="field mt-1" value={effect} onChange={(e) => setEffect(e.target.value as Effect)}>
          {EFFECTS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.plain} — {x.description}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">{t('What about {name} changes', { name: toLabel })}</span>
        <input className="field mt-1" value={toAspect} onChange={(e) => setToAspect(e.target.value)} placeholder={t('Optional when it is already a factor')} />
      </label>
      <label className="block">
        <span className="label">{t('How it may work, in your words')}</span>
        <input className="field mt-1" value={via} onChange={(e) => setVia(e.target.value)} placeholder={t('The mechanism, e.g. less time for deep work')} />
        <span className="mt-1 block text-[11.5px] text-ink-3">{t('An explanation to check. It counts as evidence only once a note shows it happening.')}</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">{t('Only when')}</span>
          <input className="field mt-1" value={when} onChange={(e) => setWhen(e.target.value)} placeholder={t('e.g. in deadline weeks')} />
        </label>
        <label className="block">
          <span className="label">{t('Typical delay')}</span>
          <input className="field mt-1" value={lag} onChange={(e) => setLag(e.target.value)} placeholder={t('e.g. 2–6 weeks')} />
        </label>
      </div>
      <div>
        <span className="label">{t('Only when, as something the record can check')}</span>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <select className="field" value={condFactor} onChange={(e) => setCondFactor(e.target.value)} aria-label={t('Only when')}>
            <option value="">{t('No condition')}</option>
            {factors.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          {condFactor && (
            <select className="field" value={condReads} onChange={(e) => setCondReads(e.target.value as FactorReading)} aria-label={t('What it did')}>
              {readingsFor(data.nodes[condFactor]?.kind)
                .filter((r) => r !== 'up' && r !== 'down')
                .map((r) => (
                  <option key={r} value={r}>
                    {READS_LABEL[r]}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="label">{t('How it acts')}</span>
          <select className="field mt-1" value={timescale} onChange={(e) => setTimescale(e.target.value as 'acute' | 'cumulative')}>
            <option value="acute">{t('After one change')}</option>
            <option value="cumulative">{t('When kept up over weeks')}</option>
          </select>
        </label>
        <label className="block">
          <span className="label">{t('True from')}</span>
          <input className="field mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('True until')}</span>
          <input className="field mt-1" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <p className="text-[11.5px] text-ink-3">
        {claim.evidence.length
          ? t(
              'Changing what it connects, which way it acts, or when it holds makes a new version. The earlier one is kept, with its evidence; the evidence that still bears on the new one comes along.',
            )
          : t('Nothing is behind it yet, so it is simply changed.')}
      </p>
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

/** A claim's scope from the edit form: kept only where something is said. */
function scopeOf(prior: Claim['scope'], timescale: 'acute' | 'cumulative', from: string, until: string): Claim['scope'] {
  const next = {
    ...(prior?.also?.length ? { also: prior.also } : {}),
    ...(timescale === 'cumulative' ? { timescale } : {}),
    ...(from ? { from } : {}),
    ...(until ? { until } : {}),
  };
  return Object.keys(next).length ? next : undefined;
}

const VERDICT_TEXT = {
  get fits() {
    return t('It was there, and this followed');
  },
  get exception() {
    return t('It was there, and this did not follow');
  },
  get contrast() {
    return t('Without it, this did not happen either');
  },
  get elsewhere() {
    return t('Without it, this happened anyway');
  },
  get outside() {
    return t('Its condition was not met: left out');
  },
};

/** The episodes the record itself compares: what the cause did, and what the outcome did after. */
function RecordComparison({ claim, judged }: { claim: Claim; judged: Set<string> }) {
  const data = useAtlas((s) => s.data);
  const { conflicts } = recordRows(data, claim);
  const clash = new Set(conflicts.map((r) => r.outcome.key));
  const all: (CaseRow & { conflict?: boolean })[] = caseRows(data, claim)
    .map((r) => ({ ...r, conflict: clash.has(r.outcome.key) }))
    .sort((x, y) => y.outcome.date.localeCompare(x.outcome.date));
  const name = (id: ID) => data.nodes[id]?.label ?? '';
  if (!all.length)
    return (
      <Muted>
        {t('Nothing recorded compares them yet. When a note says which way {cause} went, and later which way {outcome} went, the Atlas can compare the two.', {
          cause: name(claim.from),
          outcome: name(claim.to),
        })}
      </Muted>
    );
  return (
    <>
      <Muted>{t('Read from what changed, never from what was only mentioned. Episodes you judged yourself keep your judgement.')}</Muted>
      <ul className="mt-2 space-y-2">
        {all.map((r) => (
          <li
            key={`${r.episode}:${r.outcome.key}`}
            className={cn('rounded-[2px] border p-2 text-[12.5px]', r.conflict ? 'border-line-strong border-dashed' : 'border-line')}
          >
            <p className="text-ink-2">{VERDICT_TEXT[r.verdict]}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              {stateSentence(name(r.cause.factor), r.cause.reads)} <span className="num">({formatDate(r.cause.date)})</span> →{' '}
              {stateSentence(name(r.outcome.factor), r.outcome.reads)} <span className="num">({formatDate(r.outcome.date)})</span>
            </p>
            {r.verdict === 'fits' && !r.toldApart && r.others.length > 0 && (
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                {t('Does not tell it apart from {names}: they could have done this too.', {
                  names: r.others
                    .filter((o) => o.explains || (o.kind === 'common' && !o.state))
                    .map((o) => name(o.factor))
                    .join(', '),
                })}
              </p>
            )}
            {r.conflict && (
              <p className="mt-0.5 text-[11.5px] text-ink-2">
                {t('You read this episode the other way. Your judgement stands; the record is shown so you can look again.')}
              </p>
            )}
            {!r.conflict && judged.has(r.episode) && (
              <p className="mt-0.5 text-[11.5px] text-ink-3">{t('You judged this episode yourself: it counts once, with your judgement.')}</p>
            )}
            {r.verdict === 'outside' && <p className="mt-0.5 text-[11.5px] text-ink-3">{t('Not counted either way.')}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Holding it up to what else could explain the same, and to time. */
function OtherReadings({ claim, scrutiny: s }: { claim: Claim; scrutiny: ReturnType<typeof scrutinize> }) {
  const data = useAtlas((st) => st.data);
  const retire = useAtlas((st) => st.retireClaim);
  const updateClaim = useAtlas((st) => st.updateClaim);
  const open = useUI((st) => st.openEntity);
  const name = (id: ID) => data.nodes[id]?.label ?? '';
  const lines: { key: string; text: string; actions?: { label: string; run(): void }[] }[] = [];
  // Other readings of the same record (the reverse, a common cause, something unrecorded, a step between…), with where each stands.
  const readings = alternativesOf(data, claim);
  const read = (kind: string) => readings.some((r) => r.kind === kind);
  // What one of those readings already says is not said twice.
  if (!read('reverse'))
    for (const r of s.reverse)
      lines.push({ key: `r:${r.id}`, text: t('It may run the other way: {b} may change {a} too.', { a: name(claim.from), b: name(claim.to) }) });
  for (const x of s.shared)
    lines.push({
      key: `s:${x.claim.id}`,
      text: tn(
        x.episodes,
        'One of its episodes is also behind “{other}”: the same time read two ways.',
        '{n} of its episodes are also behind “{other}”: the same times read two ways.',
        {
          other: claimSentence(data, x.claim),
        },
      ),
    });
  if (s.backFromExtreme && !read('drift'))
    lines.push({
      key: 'b',
      text: tn(
        s.backFromExtreme,
        'Once, {b} moved right after being at its other extreme: some of that comes anyway, as things drift back toward usual.',
        '{n} times, {b} moved right after being at its other extreme: some of that comes anyway, as things drift back toward usual.',
        { b: name(claim.to) },
      ),
    });
  if (s.stopped)
    lines.push({
      key: 'stop',
      text: tn(s.stopped.since, 'It held until {month}; the latest time, it did not.', 'It held until {month}; the latest {n} times, it did not.', {
        month: formatMonth(s.stopped.heldUntil),
      }),
      actions: [
        {
          label: t('Keep it as true until {month}', { month: formatMonth(s.stopped.heldUntil) }),
          run: () => {
            const next = updateClaim(claim.id, { scope: { ...claim.scope, until: s.stopped!.heldUntil } });
            if (next !== claim.id) open({ kind: 'claim', id: next });
          },
        },
        { label: t('It stopped holding'), run: () => retire(claim.id, t('The latest times, it did not hold.')) },
      ],
    });
  if (s.condition) {
    const cond = s.condition;
    lines.push({
      key: 'cond',
      text: t('Every time it held, {f} was {state}; the times it did not, it was not. Maybe it only holds then.', {
        f: name(cond.factor),
        state: cond.reads === 'high' ? t('high') : t('low'),
      }),
      actions: [
        {
          label: t('Only when {f} is {state}?', { f: name(cond.factor), state: cond.reads === 'high' ? t('high') : t('low') }),
          run: () => {
            const next = updateClaim(claim.id, { condition: { factor: cond.factor, reads: cond.reads } });
            if (next !== claim.id) open({ kind: 'claim', id: next });
          },
        },
      ],
    });
  }
  if (s.delays) {
    const took = s.delays[0] === s.delays[1] ? t('{n} days', { n: s.delays[0] }) : t('{a}–{b} days', { a: s.delays[0], b: s.delays[1] });
    const outside = claim.lag && (s.delays[1] > s.stated[1] || s.delays[0] < s.stated[0]);
    lines.push({
      key: 'lag',
      text: outside
        ? t('It took {took} in the times recorded; you said {lag}.', { took, lag: claim.lag! })
        : t('It took {took} in the times recorded.', { took }),
    });
  }
  if (s.writtenLater)
    lines.push({
      key: 'late',
      text: tn(
        s.writtenLater,
        'One supporting moment was written down days after it happened, when the outcome may already have been known.',
        '{n} supporting moments were written down days after they happened, when the outcome may already have been known.',
      ),
    });
  for (const f of familyOf(data, claim))
    lines.push({
      key: `f:${f.id}`,
      text: t('The same link under other bounds: {claim}.', { claim: claimSentence(data, f) }),
      actions: [{ label: t('Open it'), run: () => open({ kind: 'claim', id: f.id }) }],
    });
  if (!lines.length && !readings.length) return null;
  return (
    <PanelSection title={t('Other ways to read it')} count={lines.length + readings.filter((r) => r.standing !== 'set_aside').length}>
      {readings.length > 0 && <AccountList accounts={readings} />}
      {lines.length > 0 && (
        <ul className={cn('space-y-2', readings.length > 0 && 'mt-3 border-t border-line pt-3')}>
          {lines.map((l) => (
            <li key={l.key} className="text-[12.5px] leading-snug text-ink-2">
              {l.text}
              {l.actions && (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {l.actions.map((x) => (
                    <Button key={x.label} size="sm" variant="ghost" onClick={x.run}>
                      {x.label}
                    </Button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

/** Predictions resting on a claim, and writing a new one down before the window. */
function Predictions({
  claim,
  direct,
  chains,
}: {
  claim: Claim;
  direct: ReturnType<typeof expectationsFor>['direct'];
  chains: ReturnType<typeof expectationsFor>['chains'];
}) {
  const data = useAtlas((s) => s.data);
  const addExpectation = useAtlas((s) => s.addExpectation);
  const open = useUI((s) => s.openEntity);
  const [writing, setWriting] = useState(false);
  const kind = data.nodes[claim.to]?.kind;
  const withCause = pushes(claim.effect, 'more');
  const defaultReads: FactorReading = kind === 'behaviour' ? (withCause === 'more' ? 'present' : 'absent') : withCause === 'more' ? 'up' : 'down';
  const [reads, setReads] = useState<FactorReading>(defaultReads);
  const [days, setDays] = useState(String(Math.max(7, Math.min(90, lagWindow(claim)))));
  const list = (items: typeof direct) => (
    <ul className="-mx-1.5">
      {items.map((v) => (
        <li key={v.occurrence.id}>
          <button
            type="button"
            className="w-full rounded-[2px] px-1.5 py-1 text-left hover:bg-ink/[0.035]"
            onClick={() => open({ kind: 'occurrence', id: v.occurrence.id })}
          >
            <ExpectationLine view={v} />
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {direct.length > 0 ? (
        list(direct)
      ) : (
        <Muted>{t('No prediction from it yet. A prediction written down before, then checked, is the surest way to learn whether it holds.')}</Muted>
      )}
      {chains.length > 0 && (
        <>
          <div className="label mt-2.5 mb-1">{t('Part of a chain')}</div>
          {list(chains)}
          <p className="mt-1 text-[11.5px] text-ink-3">
            {t('A chain is checked together: if it fails, one of its reasons did not hold, not necessarily this one.')}
          </p>
        </>
      )}
      {!claim.retired && claim.state === 'adopted' && (
        <div className="mt-2">
          {writing ? (
            <form
              className="space-y-2 rounded-[2px] border border-line p-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Math.max(1, Math.round(Number(days) || 28));
                const today = todayISO();
                const occ = addExpectation({
                  factor: claim.to,
                  reads,
                  from: today,
                  until: addDays(today, n),
                  label: expectSentence(data.nodes[claim.to]?.label ?? '', reads),
                  basis: [claim.id],
                });
                setWriting(false);
                open({ kind: 'occurrence', id: occ });
              }}
            >
              <p className="text-[12px] text-ink-3">
                {t('If this holds, and {cause} is as it is now, what should happen to {outcome}?', {
                  cause: data.nodes[claim.from]?.label ?? '',
                  outcome: data.nodes[claim.to]?.label ?? '',
                })}
              </p>
              <div className="flex flex-wrap gap-1">
                {readingsFor(kind).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={reads === r}
                    onClick={() => setReads(r)}
                    className={cn(
                      'rounded-[2px] border px-2 py-0.5 text-[12px]',
                      reads === r ? 'border-ink/50 bg-ink/[0.07] text-ink' : 'border-line text-ink-3 hover:text-ink',
                    )}
                  >
                    {READS_LABEL[r]}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12px] text-ink-3">
                {t('Within')}
                <input className="field w-[72px]" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
                {t('days')}
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" type="submit" icon={Check}>
                  {t('Write it down')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setWriting(false)}>
                  {t('Cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setWriting(true)}>
              {t('Write down a prediction')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** A whole thing at either end, with what about it changes: offer to make that its own element. */
function PromoteAspects({ claim }: { claim: Claim }) {
  const data = useAtlas((s) => s.data);
  const promote = useAtlas((s) => s.promoteAspect);
  const open = useUI((s) => s.openEntity);
  const [end, setEnd] = useState<'from' | 'to' | null>(null);
  const [label, setLabel] = useState('');
  const ends = (['from', 'to'] as const).filter((e) => claim.aspect?.[e]?.trim() && data.nodes[claim[e]] && !isFactorKind(data.nodes[claim[e]].kind));
  if (!ends.length) return null;
  return (
    <div className="mt-2">
      {end ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = promote(claim.id, end, label);
            setEnd(null);
            if (next) open({ kind: 'claim', id: next });
          }}
        >
          <input className="field min-w-0 flex-1" value={label} onChange={(e) => setLabel(e.target.value)} aria-label={t('Name')} autoFocus />
          <Button size="sm" variant="primary" type="submit" icon={Check}>
            {t('Make it')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEnd(null)}>
            {t('Cancel')}
          </Button>
        </form>
      ) : (
        ends.map((e) => (
          <Button
            key={e}
            size="sm"
            variant="ghost"
            onClick={() => {
              setEnd(e);
              setLabel(`${data.nodes[claim[e]].label}: ${claim.aspect![e]!.trim()}`);
            }}
            title={t('The thing itself is not the cause: what changes about it can be its own element, part of it, recorded and compared.')}
          >
            {t('Make “{aspect}” its own element', { aspect: claim.aspect![e]!.trim() })}
          </Button>
        ))
      )}
    </div>
  );
}
