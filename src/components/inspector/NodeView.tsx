import { Check, Crosshair, Ellipsis, Link2, Pencil, Plus, Sparkle, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRoute } from '../../app/router';
import { showOnMap } from '../../app/showOnMap';
import { aroundInTime, momentsOf, optionsTouching, reasonsFor, strongestPattern, type Neighbour } from '../../domain/ask';
import { byStrength, claimsInto, claimsOutOf } from '../../domain/claims';
import { AREA_META, AREAS, KIND_META, KINDS, QUESTION_STATUS_LABEL, expectSentence } from '../../domain/constants';
import { coverage, phasesOf, trajectory, usualLevel } from '../../domain/factors';
import { basisOf, whatIf, type Consequence } from '../../domain/whatif';
import { readingsOf } from '../../domain/history';
import { loopName, loopsThrough } from '../../domain/loops';
import { displayNode, neighbors, patternsForNode } from '../../domain/selectors';
import type { AreaKey, ElementKind, ID, Investigation, QuestionStatus } from '../../domain/types';
import { addDays, formatDate, formatMonth, todayISO } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { KnowledgeTag, StatusBadge } from '../evidence/Status';
import { KIND_ICONS, LoopIcon, PLACE_ICONS } from '../icons';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Segmented } from '../ui/primitives';
import { AddReason, Lately, Question, RepeatRow, SeeIn, TryIt } from './Ask';
import { ClaimComposer, ConnectForm, ElementSelect } from './ClaimComposer';
import { Explanation } from './Explanation';
import { ClaimRow, Muted, NodeChip, PanelSection } from './parts';
import { t, tn } from '../../i18n';

/**
 * One thing in the atlas, told as a short story (what it is, what happened
 * lately, one thing the Atlas noticed) and then asked about: five questions,
 * each answered in place, each answer opening one level deeper on request.
 */
export function NodeView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const adoptNode = useAtlas((s) => s.adoptNode);
  const deleteNode = useAtlas((s) => s.deleteNode);
  const closeInspector = useUI((s) => s.closeInspector);
  const route = useRoute();
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const node = data.nodes[id];
  const display = displayNode(data, id);
  const moments = useMemo(() => momentsOf(data, { kind: 'node', id }).filter((h) => h.mode === 'actual'), [data, id]);
  const reasons = useMemo(() => reasonsFor(data, id), [data, id]);
  const repeat = useMemo(() => strongestPattern(data, id), [data, id]);
  const loops = useMemo(() => loopsThrough(data, id), [data, id]);
  const linked = useMemo(
    () => [
      ...new Set(
        neighbors(data, id)
          .filter((n) => n.relation.family === 'link')
          .map((n) => n.otherId),
      ),
    ],
    [data, id],
  );

  if (!node || !display) return null;
  const Icon = KIND_ICONS[node.kind];
  const color = display.color;
  const layer = route.key === 'network' ? 'network' : 'orbit';
  const lately = moments.filter((h) => h.kind !== 'reading').slice(0, 3);
  const noticed =
    repeat && repeat.stats.instances >= 2
      ? t('Something like this has happened {n} times since {month}.', { n: repeat.stats.instances, month: formatMonth(repeat.stats.firstObserved!) })
      : loops.length
        ? loops[0].type === 'reinforcing'
          ? t('It sits in a cycle that feeds itself.')
          : t('It sits in a cycle that holds itself back.')
        : node.concern && !reasons.length
          ? t('You care about this, and nothing explains it yet.')
          : undefined;

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[2px] border" style={{ borderColor: `${color}66` }}>
            <Icon size={13} color={color} strokeWidth={1.8} aria-hidden />
          </span>
          <span className="label">
            {KIND_META[node.kind].label} · {AREA_META[node.area].label}
          </span>
          <span className="ml-auto">
            <KnowledgeTag kind={node.adopted ? (node.origin === 'inferred' ? 'observed' : 'declared') : 'suggested'} />
          </span>
        </div>

        {editing ? (
          <EditForm id={id} onDone={() => setEditing(false)} />
        ) : (
          <>
            <h2 className="mt-2.5 display text-[21px] leading-[1.2] text-ink">{node.label}</h2>
            {node.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{node.summary}</p>}
            {(node.since || node.until || node.concern || node.external) && (
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                {(node.since || node.until) && (
                  <span>
                    {node.since ? formatDate(node.since, { year: true }) : '…'} – {node.until ? formatDate(node.until, { year: true }) : t('now')}
                  </span>
                )}
                {node.concern && <span className="text-ink-2">{t('Something you want explained or changed')}</span>}
                {node.external && <span>{t('Outside your control')}</span>}
              </p>
            )}
          </>
        )}

        {node.adopted && !editing && (
          <div className="mt-3.5">
            <div className="label mb-1">{t('Lately')}</div>
            <Lately items={lately} empty={t('Nothing dated is about this yet.')} />
            {noticed && (
              <p className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-snug text-ink">
                <Sparkle size={12} className="mt-[3px] shrink-0 text-accent" aria-hidden />
                <span>{noticed}</span>
              </p>
            )}
            {linked.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-ink-3">{t('Linked to')}</span>
                {linked.slice(0, 6).map((x) => (
                  <NodeChip key={x} id={x} />
                ))}
              </div>
            )}
          </div>
        )}

        {!node.adopted && (
          <div className="mt-3 rounded-[2px] border border-dashed border-line-strong p-3">
            <p className="text-[12.5px] leading-snug text-ink-2">{t('The Atlas noticed this in your notes. It stays off the map until you say it fits.')}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" icon={Check} onClick={() => adoptNode(id)}>
                {t('It fits, add it')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                onClick={() => {
                  deleteNode(id);
                  closeInspector();
                }}
              >
                {t('It does not fit')}
              </Button>
            </div>
          </div>
        )}

        {!editing && node.adopted && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" icon={Crosshair} onClick={() => showOnMap(layer, id)}>
              {t('Show on map')}
            </Button>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              {t('Edit')}
            </Button>
            <Button size="sm" variant="ghost" icon={Ellipsis} onClick={() => setMore((m) => !m)} aria-expanded={more}>
              {t('More')}
            </Button>
          </div>
        )}
        {more && !editing && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
            <Button size="sm" variant="ghost" icon={Link2} onClick={() => setConnecting((c) => !c)} aria-expanded={connecting}>
              {t('Connect')}
            </Button>
            <span className="ml-auto">
              <ConfirmButton
                onConfirm={() => {
                  deleteNode(id);
                  closeInspector();
                }}
              />
            </span>
          </div>
        )}
        {connecting && <ConnectForm id={id} onDone={() => setConnecting(false)} />}
      </div>

      {node.adopted && (
        <>
          <Question
            id="happening"
            title={t("What's been happening?")}
            hint={moments.length ? tn(moments.length, '{n} moment so far', '{n} moments so far') : t('Nothing dated yet')}
          >
            {() => <Happening id={id} />}
          </Question>
          <Question
            id="why"
            title={t('Why might this be happening?')}
            hint={reasons.length ? tn(reasons.length, '{n} possible reason', '{n} possible reasons') : t('Nothing explains it yet')}
          >
            {() => <Explanation id={id} />}
          </Question>
          <Question id="around" title={t('What usually comes before or after?')}>
            {() => <Around id={id} />}
          </Question>
          <Question
            id="before"
            title={t('Has this happened before?')}
            hint={repeat ? tn(repeat.stats.instances, 'Something like it, {n} time', 'Something like it, {n} times') : undefined}
          >
            {() => <Before id={id} />}
          </Question>
          <Question id="whatif" title={t('What if I change it?')}>
            {() => <WhatIf id={id} />}
          </Question>
        </>
      )}

      {node.kind === 'belief' && <BeliefSection id={id} />}
      {node.kind === 'question' && <QuestionSection id={id} />}

      <div className="border-t border-line px-4 py-3 text-[11.5px] text-ink-3">
        {t('Added {date}', { date: formatDate(node.createdAt, { year: true }) })} ·{' '}
        {node.origin === 'inferred' ? t('noticed by the Atlas in your notes') : t('written by you')}
        {node.origin === 'inferred' && node.adopted && ` · ${t('kept by you')}`}
      </div>
    </div>
  );
}

/* ---------------- the five answers ---------------- */

function Happening({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const node = data.nodes[id]!;
  const moments = momentsOf(data, { kind: 'node', id }).filter((h) => h.mode === 'actual' && h.kind !== 'reading');
  return (
    <>
      {node.kind === 'state' && <Readings id={id} />}
      <RecordCoverage id={id} />
      <Lately items={moments.slice(0, 8)} empty={t('Nothing in your notes is about this yet. Write about it, and it shows up here.')} />
      {moments.length > 8 && <p className="mt-1 text-[11.5px] text-ink-3">{t('+{n} more', { n: moments.length - 8 })}</p>}
      <SeeIn route="timeline">{t('See it all in Time')}</SeeIn>
    </>
  );
}

function Around({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const node = data.nodes[id]!;
  const around = useMemo(() => aroundInTime(data, id), [data, id]);
  const [proposing, setProposing] = useState<{ id: ID; direction: 'into' | 'out' } | null>(null);
  if (!around.moments) return <Muted>{t('Nothing dated is about this yet, so there is nothing to line up.')}</Muted>;
  const list = (items: Neighbour[], direction: 'into' | 'out') =>
    items.length ? (
      <ul className="space-y-1">
        {items.map((n) => (
          <li key={n.id}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <NodeChip id={n.id} />
              <span className="text-[11.5px] text-ink-3">{t('{n} of {m} times', { n: n.count, m: around.moments })}</span>
              {n.linked ? (
                <span className="text-[11.5px] text-ink-3">{direction === 'into' ? t('already a possible reason') : t('already a possible effect')}</span>
              ) : (
                <button
                  type="button"
                  className="text-[11.5px] text-accent hover:underline"
                  onClick={() => setProposing(proposing?.id === n.id ? null : { id: n.id, direction })}
                >
                  {direction === 'into' ? t('Could this be a reason?') : t('Could this be an effect?')}
                </button>
              )}
            </div>
            {proposing?.id === n.id && proposing.direction === direction && (
              <div className="mt-1.5">
                <AddReason to={id} area={node.area} direction={direction} initial={data.nodes[n.id]?.label} onDone={() => setProposing(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <Muted>{t('Nothing comes up often enough to say.')}</Muted>
    );
  return (
    <>
      <p className="text-[12px] text-ink-3">
        {tn(around.moments, 'Looking at the three weeks around the {n} time it came up.', 'Looking at the three weeks around the {n} times it came up.')}
      </p>
      <div className="label mt-2.5 mb-1">{t('Often before')}</div>
      {list(around.before, 'into')}
      <div className="label mt-3 mb-1">{t('Often after')}</div>
      {list(around.after, 'out')}
      <p className="mt-3 text-[11.5px] text-ink-3">{t('Coming before is not the same as causing. It is worth a look, not a conclusion.')}</p>
    </>
  );
}

function Before({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const patterns = patternsForNode(data, id);
  return (
    <>
      {patterns.length ? (
        <ul className="-mx-1.5">
          {patterns.map((p) => (
            <RepeatRow key={p.id} id={p.id} />
          ))}
        </ul>
      ) : (
        <Muted>{t('Not that the Atlas can see yet. A repeat shows once something similar happens in separate weeks.')}</Muted>
      )}
      <SeeIn route="patterns">{t('See everything that repeats')}</SeeIn>
    </>
  );
}

function WhatIf({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const addExpectation = useAtlas((s) => s.addExpectation);
  const node = data.nodes[id]!;
  const [change, setChange] = useState<'more' | 'less'>('more');
  const consequences = useMemo(() => whatIf(data, id, change), [data, id, change]);
  const loops = useMemo(() => loopsThrough(data, id), [data, id]);
  const options = useMemo(() => optionsTouching(data, [id]), [data, id]);
  const [adding, setAdding] = useState(false);
  const [kept, setKept] = useState<ID[]>([]);
  const direct = claimsOutOf(data, id);
  const test = direct[0] ?? claimsInto(data, id).sort(byStrength(data))[0];
  const behaviour = node.kind === 'behaviour';
  const label = (c: Consequence) => data.nodes[c.id]?.label ?? '';
  const readsFor = (c: Consequence) =>
    data.nodes[c.id]?.kind === 'behaviour' ? (c.lean === 'more' ? 'present' : 'absent') : c.lean === 'more' ? 'up' : 'down';
  return (
    <>
      <Segmented<'more' | 'less'>
        label={t('Which way it changes')}
        size="sm"
        value={change}
        onChange={setChange}
        options={[
          { value: 'more', label: behaviour ? t('If you did it more') : t('If it went up') },
          { value: 'less', label: behaviour ? t('If you did it less') : t('If it went down') },
        ]}
      />
      {consequences.length ? (
        <>
          <p className="mt-2 mb-1.5 text-[12px] text-ink-3">
            {t('Following the reasons on your map, one step at a time. An estimate from the model as it stands, not a forecast.')}
          </p>
          <ul className="space-y-2">
            {consequences.slice(0, 8).map((c) => (
              <li key={c.id} className="rounded-[2px] border border-line p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <NodeChip id={c.id} />
                  <span className="text-[12.5px] text-ink-2">
                    {c.lean === 'mixed'
                      ? t('can’t tell which way: the routes disagree')
                      : c.lean === 'more'
                        ? t('would go up')
                        : c.lean === 'less'
                          ? t('would go down')
                          : ''}
                  </span>
                  <span className="ml-auto">
                    <StatusBadge status={c.weakest} />
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-3">
                  {c.routes
                    .slice(0, 3)
                    .map((r) =>
                      r.claims.length === 1
                        ? t('directly')
                        : t('through {names}', {
                            names: r.claims
                              .slice(0, -1)
                              .map((m) => data.nodes[m.to]?.label)
                              .join(', '),
                          }),
                    )
                    .join(' · ')}
                  {' · '}
                  {c.window[1] <= c.window[0] || c.window[0] === 0
                    ? t('within about {n} days', { n: c.window[1] })
                    : t('within about {a}–{b} days', { a: c.window[0], b: c.window[1] })}
                  {c.routes.some((r) => r.gated) && ` · ${t('one step only makes it possible, or limits it')}`}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  {tn(basisOf(c).length, 'It rests on one reason, as sure as it is.', 'It rests on {n} reasons, only as sure as the least sure of them.')}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  {c.ifYouChange === 'tested'
                    ? t('Tested: when you changed it yourself, this followed.')
                    : c.ifYouChange === 'confounded'
                      ? t('Something else may move both: if you change it yourself, this may not follow at all.')
                      : t('Seen, not tested: if you change it yourself, this may not follow.')}
                </p>
                {c.lean !== 'mixed' && c.lean !== 'usual' && (
                  <div className="mt-1.5">
                    {kept.includes(c.id) ? (
                      <span className="text-[11.5px] text-ink-3">{t('Written down: it will be checked against what you record.')}</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const today = todayISO();
                          const occ = addExpectation({
                            factor: c.id,
                            reads: readsFor(c),
                            from: today,
                            until: addDays(today, Math.max(7, c.window[1])),
                            label: t('{what}, if {cause} {change}', {
                              what: expectSentence(label(c), readsFor(c)),
                              cause: node.label,
                              change: change === 'more' ? t('goes up') : t('goes down'),
                            }),
                            basis: basisOf(c),
                          });
                          setKept([...kept, c.id]);
                          open({ kind: 'occurrence', id: occ });
                        }}
                      >
                        {t('Keep it as a prediction')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Muted>{t('Nothing on the map says what this changes yet.')}</Muted>
      )}
      {loops.length > 0 && (
        <>
          <div className="label mt-3 mb-1">{t('It comes back around')}</div>
          <ul className="-mx-1.5">
            {loops.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink/[0.035]"
                  onClick={() => open({ kind: 'loop', id: l.id })}
                >
                  <LoopIcon size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 text-[13px] text-ink-2 group-hover:text-ink">
                    {loopName(l)}
                    <span className="block text-[11.5px] text-ink-3">{tn(l.nodeIds.length, '{n} thing in the cycle', '{n} things in the cycle')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {options.length > 0 && (
        <>
          <div className="label mt-3 mb-1">{t('Directions that count on it')}</div>
          <ul className="-mx-1.5">
            {options.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink/[0.035]"
                  onClick={() => open({ kind: 'path', id: p.id })}
                >
                  <PLACE_ICONS.ahead size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 text-[13px] text-ink-2 group-hover:text-ink">{p.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {test && <TryIt claimId={test.id} />}
        {!adding && (
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
            {t('Something else it might change?')}
          </Button>
        )}
      </div>
      {adding && (
        <div className="mt-2">
          <AddReason to={id} area={node.area} direction="out" onDone={() => setAdding(false)} />
        </div>
      )}
      <SeeIn route="paths">{t('See what could come next')}</SeeIn>
    </>
  );
}

/** A belief is also a claim about how things work: show the claim and how it is holding up. */
function BeliefSection({ id }: { id: ID }) {
  const node = useAtlas((s) => s.data.nodes[id]);
  const updateNode = useAtlas((s) => s.updateNode);
  const [composing, setComposing] = useState(false);
  if (!node) return null;
  return (
    <PanelSection title={t('As a reason')}>
      <Muted>{t('A belief is something you hold, and also an idea about how things work that the record can bear out or not.')}</Muted>
      {node.claimId ? (
        <ul className="-mx-1.5 mt-1.5">
          <ClaimRow id={node.claimId} />
        </ul>
      ) : composing ? (
        <div className="mt-2">
          <ClaimComposer
            hint={t('What does this belief say changes what?')}
            onCreated={(cid) => {
              updateNode(id, { claimId: cid });
              setComposing(false);
            }}
            onCancel={() => setComposing(false)}
          />
        </div>
      ) : (
        <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setComposing(true)}>
          {t('State it as a reason')}
        </Button>
      )}
    </PanelSection>
  );
}

const INVESTIGATION_KINDS: { value: Investigation['kind']; label: () => string; hint: () => string }[] = [
  { value: 'why', label: () => t('Why?'), hint: () => t('Explain something that happened, against what you expected instead.') },
  { value: 'what_if', label: () => t('What if?'), hint: () => t('Follow a change forward through what it acts on.') },
  { value: 'value', label: () => t('What matters?'), hint: () => t('A question only you can settle. Evidence can inform it, not decide it.') },
];

/** An open question, worked as an investigation: why, what if, or what matters. */
function QuestionSection({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const updateNode = useAtlas((s) => s.updateNode);
  const updateInvestigation = useAtlas((s) => s.updateInvestigation);
  const node = data.nodes[id];
  const [conclusion, setConclusion] = useState(node?.investigation?.conclusion ?? node?.resolution ?? '');
  const [contrast, setContrast] = useState(node?.investigation?.contrast ?? '');
  if (!node) return null;
  const inv = node.investigation;
  const kind = inv?.kind ?? 'why';
  const anchor = inv?.anchorId;
  const gathered = inv?.claimIds ?? [];
  const candidates = anchor
    ? (kind === 'what_if' ? claimsOutOf(data, anchor) : claimsInto(data, anchor)).filter((c) => !gathered.includes(c.id)).sort(byStrength(data))
    : [];
  const set = (patch: Partial<Investigation>) => updateInvestigation(id, patch);

  return (
    <>
      <PanelSection title={t('Status')}>
        <Segmented<QuestionStatus>
          label={t('Question status')}
          size="sm"
          value={node.status ?? 'open'}
          onChange={(status) => updateNode(id, { status })}
          options={(['open', 'exploring', 'resolved'] as const).map((s) => ({ value: s, label: QUESTION_STATUS_LABEL[s] }))}
        />
      </PanelSection>
      <PanelSection title={t('Investigation')}>
        <Segmented<Investigation['kind']>
          label={t('Kind of question')}
          size="sm"
          value={kind}
          onChange={(k) => set({ kind: k })}
          options={INVESTIGATION_KINDS.map((k) => ({ value: k.value, label: k.label(), title: k.hint() }))}
        />
        <p className="mt-1.5 text-[12px] text-ink-3">{INVESTIGATION_KINDS.find((k) => k.value === kind)!.hint()}</p>
        {kind !== 'value' && (
          <div className="mt-2.5 space-y-2">
            <label className="block">
              <span className="label">{kind === 'why' ? t('What is being explained') : t('What would change')}</span>
              <div className="mt-1">
                <ElementSelect value={anchor ?? ''} onChange={(v) => set({ anchorId: v || undefined })} label={t('Element')} />
              </div>
            </label>
            {kind === 'why' && (
              <label className="block">
                <span className="label">{t('Rather than what?')}</span>
                <input
                  className="field mt-1"
                  value={contrast}
                  onChange={(e) => setContrast(e.target.value)}
                  onBlur={() => contrast !== (inv?.contrast ?? '') && set({ contrast: contrast.trim() || undefined })}
                  placeholder={t('e.g. finishing on time, like the short film did')}
                />
              </label>
            )}
            <div>
              <div className="label">{kind === 'why' ? t('Possible contributors') : t('Possible consequences')}</div>
              {gathered.length ? (
                <ul className="-mx-1.5 mt-1">
                  {gathered.map((cid) => (
                    <li key={cid} className="flex items-start">
                      <ul className="min-w-0 flex-1">
                        <ClaimRow id={cid} />
                      </ul>
                      <button
                        type="button"
                        className="mt-1.5 rounded-[2px] p-1 text-ink-3 hover:text-ink"
                        aria-label={t('Remove from this investigation')}
                        onClick={() => set({ claimIds: gathered.filter((x) => x !== cid) })}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Muted>{t('None gathered yet.')}</Muted>
              )}
              {candidates.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11.5px] text-ink-3">{t('Reasons on the map that could belong here:')}</div>
                  <div className="mt-1 flex flex-col items-start gap-1">
                    {candidates.slice(0, 5).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left text-[12.5px] text-ink-2 hover:text-ink"
                        onClick={() => set({ claimIds: [...gathered, c.id] })}
                      >
                        <Plus size={12} aria-hidden />
                        {displayNode(data, kind === 'what_if' ? c.to : c.from)?.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <label className="mt-3 block">
          <span className="label">{t('What you conclude, for now')}</span>
          <textarea
            className="field mt-1 min-h-[64px]"
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            onBlur={() => conclusion !== (inv?.conclusion ?? '') && set({ conclusion: conclusion.trim() || undefined })}
            placeholder={t('A provisional answer, and what would change it.')}
          />
        </label>
      </PanelSection>
    </>
  );
}

/**
 * How well something is recorded, which decides how far "no record" can be
 * read: recorded regularly, a missing reading is unknown; recorded when
 * notable, a week without it is unknown, never "it did not happen".
 */
function RecordCoverage({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const c = coverage(data, id);
  const usual = usualLevel(data, id);
  const node = data.nodes[id];
  if (!node || c === 'none') return null;
  const phases = phasesOf(data, id);
  const lately = trajectory(data, id);
  const text =
    c === 'tracked'
      ? usual
        ? phases.length > 1
          ? t(
              'Recorded regularly. Its usual level moved over time ({levels}); high and low are read against the usual level of the time, not against anyone else.',
              {
                levels: phases.map((p) => t('{v} from {date}', { v: p.usual, date: formatDate(p.from) })).join(', '),
              },
            )
          : t('Recorded regularly. Its usual level is {v}; high and low are read against that, not against anyone else.', { v: usual.value })
        : t('Recorded regularly.')
      : c === 'recorded'
        ? t('What it did is written down now and then, when it was notable. Times without a record are unknown, not absent.')
        : t('It comes up in your notes, but nothing says which way it went. Saying what changed lets the Atlas compare it.');
  const direction =
    lately.direction === 'rising'
      ? t('Lately it has been rising.')
      : lately.direction === 'falling'
        ? t('Lately it has been falling.')
        : lately.direction === 'steady'
          ? t('Lately it has been steady.')
          : lately.direction === 'unsettled'
            ? t('Lately it has been going up and down.')
            : '';
  return (
    <p className="mb-2 text-[11.5px] leading-snug text-ink-3">
      {text}
      {direction && ` ${direction}`}
    </p>
  );
}

/** A state is read over time: its readings as a small line. */
function Readings({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const node = data.nodes[id];
  const readings = useMemo(() => readingsOf(data, id), [data, id]);
  if (!node) return null;
  if (readings.length < 2) return null;
  const min = node.scale?.min ?? Math.min(...readings.map((r) => r.value));
  const max = node.scale?.max ?? Math.max(...readings.map((r) => r.value));
  const w = 300;
  const h = 56;
  const x = (i: number) => 4 + (i / (readings.length - 1)) * (w - 8);
  const y = (v: number) => 4 + (1 - (v - min) / Math.max(1, max - min)) * (h - 8);
  const d = readings.map((r, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`).join(' ');
  const last = readings[readings.length - 1];
  return (
    <div className="mb-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label={t('Readings over time')}>
        <path d={d} fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={x(readings.length - 1)} cy={y(last.value)} r="2.5" fill="var(--color-ink)" />
      </svg>
      <p className="mt-1 text-[11.5px] text-ink-3">
        {t('From {a} to {b}. Latest {v} of {max}.', {
          a: formatDate(readings[0].date),
          b: formatDate(last.date),
          v: last.value,
          max,
        })}
      </p>
    </div>
  );
}

function EditForm({ id, onDone }: { id: ID; onDone(): void }) {
  const node = useAtlas((s) => s.data.nodes[id]);
  const updateNode = useAtlas((s) => s.updateNode);
  const [label, setLabel] = useState(node?.label ?? '');
  const [kind, setKind] = useState<ElementKind>(node?.kind ?? 'state');
  const [summary, setSummary] = useState(node?.summary ?? '');
  const [area, setArea] = useState<AreaKey>(node?.area ?? 'self');
  const [since, setSince] = useState(node?.since ?? '');
  const [until, setUntil] = useState(node?.until ?? '');
  const [concern, setConcern] = useState(Boolean(node?.concern));
  if (!node) return null;
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        updateNode(id, {
          label: label.trim(),
          kind,
          summary: summary.trim(),
          area,
          since: since || undefined,
          until: until || undefined,
          concern: concern || undefined,
        });
        onDone();
      }}
    >
      <label className="block">
        <span className="label">{t('Name')}</span>
        <input className="field mt-1" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
      <label className="block">
        <span className="label">{t('What kind of thing it is')}</span>
        <select className="field mt-1" value={kind} onChange={(e) => setKind(e.target.value as ElementKind)}>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">{t('Description')}</span>
        <textarea className="field mt-1 min-h-[72px] resize-y" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">{t('Area of life')}</span>
        <select className="field mt-1" value={area} onChange={(e) => setArea(e.target.value as AreaKey)}>
          {AREAS.map((a) => (
            <option key={a.key} value={a.key}>
              {AREA_META[a.key].label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">{t('Since')}</span>
          <input type="date" className="field mt-1" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('Until')}</span>
          <input type="date" className="field mt-1" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <label className="tap flex items-start gap-2 text-[12.5px] text-ink-2">
        <input type="checkbox" className="mt-[3px]" checked={concern} onChange={(e) => setConcern(e.target.checked)} />
        <span>{t('Something I want explained or changed')}</span>
      </label>
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
