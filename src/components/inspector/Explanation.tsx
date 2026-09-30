import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { accountsFor } from '../../domain/accounts';
import { explainMoment, explainOutcome } from '../../domain/explain';
import { inquiriesFor } from '../../domain/inquiry';
import { ROLE_META, stateSentence } from '../../domain/constants';
import { claimSentence, claimStatus } from '../../domain/claims';
import type { HistoryItem } from '../../domain/history';
import type { FactorState } from '../../domain/factors';
import type { Claim, ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { t, tn } from '../../i18n';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { StatusBadge } from '../evidence/Status';
import { Button } from '../ui/Button';
import { AddReason, Lately, Reason } from './Ask';
import { AccountList, InquiryList } from './Inquiry';
import { Muted, NodeChip } from './parts';

/**
 * "Why might this be happening?", answered as an open explanation: what may
 * be contributing, by the part each plays; what competes; what happened from
 * outside; and what is still unexplained, which is always there. Nothing is
 * shared out in percentages, and nothing here closes the question.
 */
export function Explanation({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const node = data.nodes[id];
  const ex = useMemo(() => explainOutcome(data, id), [data, id]);
  const readings = useMemo(() => accountsFor(data, id), [data, id]);
  const asks = useMemo(() => inquiriesFor(data, { outcome: id }), [data, id]);
  const [adding, setAdding] = useState(false);
  if (!node) return null;
  const others = readings.accounts.filter((a) => a.kind !== 'claim' && a.kind !== 'remainder' && a.kind !== 'outside');
  const count = ex.groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-4">
      {count ? (
        ex.groups.map((g) => (
          <section key={g.role} aria-label={ROLE_META[g.role].heading}>
            <h4 className="label mb-1.5" title={ROLE_META[g.role].description}>
              {ROLE_META[g.role].heading}
            </h4>
            <ul className="space-y-1.5">
              {g.items.map((c) => (
                <Reason key={c.claim.id} claim={c.claim} route={ex.routes[c.claim.id]} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <Muted>
          {node.concern
            ? t('Nothing explains this yet. That is where the atlas is thinnest, and the most useful place to start.')
            : t('Nothing on the map explains this yet.')}
        </Muted>
      )}
      {count > 1 && (
        <p className="text-[11.5px] text-ink-3">
          {t('Several of these can be true at once. None of them has a share: they are possibilities, each with its own evidence.')}
          {Object.keys(ex.routes).length > 0 && ` ${t('Some are one cause acting through another: routes of one cause, not separate causes.')}`}
        </p>
      )}

      {ex.rivalries.length > 0 && (
        <section>
          <h4 className="label mb-1">{t('Competing explanations')}</h4>
          <ul className="space-y-1">
            {ex.rivalries.map(([a, b]) => (
              <li key={`${a.id}:${b.id}`} className="text-[12.5px] leading-snug text-ink-2">
                {t('“{a}” or “{b}”: if one holds, the other may not be needed.', { a: claimSentence(data, a), b: claimSentence(data, b) })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h4 className="label mb-1">{t('Other ways to read the same record')}</h4>
          <p className="mb-1.5 text-[11.5px] text-ink-3">
            {t('What else would leave the same trace. One is set aside only when something recorded rules it out; not finding it is not enough.')}
          </p>
          <AccountList accounts={others} />
        </section>
      )}

      {ex.outside.length > 0 && (
        <section>
          <h4 className="label mb-1">{t('From outside')}</h4>
          <p className="mb-1 text-[11.5px] text-ink-3">{t('Things that happened to you in the weeks before it came up. They can contribute too.')}</p>
          <Lately items={ex.outside} empty="" />
        </section>
      )}

      <section>
        <h4 className="label mb-1">{t('Still unexplained')}</h4>
        <ul className="space-y-1 text-[12.5px] leading-snug text-ink-2">
          {ex.moments > 0 &&
            (ex.unexplained > 0 ? (
              <li>
                {t('{n} of the {m} recorded times it moved, nothing on this list was recorded pushing it that way first.', {
                  n: ex.unexplained,
                  m: ex.moments,
                })}
              </li>
            ) : (
              <li>
                {t(
                  'Each recorded time it moved, at least one of these was recorded pushing it that way first. That shows they were there, not that they caused it.',
                )}
              </li>
            ))}
          {ex.unaccounted > 0 && (
            <li>
              {tn(
                ex.unaccounted,
                'Once more, part of this list was not recorded before it moved: unknown, not unexplained.',
                '{n} more times, part of this list was not recorded before it moved: unknown, not unexplained.',
              )}
            </li>
          )}
          {ex.unrecorded > 0 && (
            <li>{tn(ex.unrecorded, 'Once it came up with no record of which way it went.', '{n} times it came up with no record of which way it went.')}</li>
          )}
          {ex.elsewhere > 0 && <li>{tn(ex.elsewhere, 'Once it happened without one of these.', '{n} times it happened without one of these.')}</li>}
          <li className="text-ink-3">{t('Some of it may be chance, or something that is not on the map.')}</li>
        </ul>
      </section>

      {asks.length > 0 && (
        <section>
          <h4 className="label mb-1">{t('What would tell them apart')}</h4>
          <InquiryList items={asks} />
        </section>
      )}

      {ex.missing.length > 0 && (
        <section>
          <h4 className="label mb-1">{t('What would help')}</h4>
          <ul className="space-y-0.5">
            {ex.missing.map((m) => (
              <li key={m} className="text-[12.5px] leading-snug text-ink-2">
                · {m}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ex.questions.length > 0 && (
        <section>
          <h4 className="label mb-1">{t('Your questions about it')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {ex.questions.map((q) => (
              <NodeChip key={q.id} id={q.id} />
            ))}
          </div>
        </section>
      )}

      <div>
        {adding ? (
          <AddReason to={id} area={node.area} onDone={() => setAdding(false)} />
        ) : (
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
            {count ? t('Another explanation?') : t('Add a possible reason')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * One happening read against the possible reasons for it: which were there in
 * the weeks before, which were not, and what happened from outside. It shows
 * what was present, not what caused it.
 */
export function MomentExplanation({ item }: { item: HistoryItem }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const ex = useMemo(() => explainMoment(data, item), [data, item]);
  if (!ex.outcomes.length) return <Muted>{t('Not linked to anything on the map, so there is nothing to explain it against yet.')}</Muted>;
  if (!ex.present.length && !ex.against.length && !ex.absent.length)
    return <Muted>{t('Nothing on the map is a possible reason for {name} yet.', { name: ex.outcomes.map((id) => data.nodes[id]?.label).join(', ') })}</Muted>;
  const row = ({ claim, state }: { claim: Claim; state: FactorState }) => (
    <li key={claim.id}>
      <button type="button" onClick={() => open({ kind: 'claim', id: claim.id })} className="w-full text-left">
        <span className="block text-[12.5px] leading-snug text-ink-2 hover:text-ink">{claimSentence(data, claim)}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
          <StatusBadge status={claimStatus(data, claim)} />
          {t('{what}, {date}', { what: stateSentence(data.nodes[state.factor]?.label ?? '', state.reads), date: formatDate(state.date) })}
        </span>
      </button>
    </li>
  );
  return (
    <div className="space-y-3">
      {ex.moved.length > 0 && (
        <p className="text-[12.5px] text-ink-2">{ex.moved.map((m) => stateSentence(data.nodes[m.factor]?.label ?? '', m.reads)).join('; ')}.</p>
      )}
      {ex.present.length > 0 && (
        <div>
          <div className="mb-1 text-[11.5px] text-ink-3">{ex.moved.length ? t('Recorded before it, pushing the way it went') : t('Recorded before it')}</div>
          <ul className="space-y-1.5">{ex.present.map(row)}</ul>
        </div>
      )}
      {ex.against.length > 0 && (
        <div>
          <div className="mb-1 text-[11.5px] text-ink-3">{t('Recorded before it, but pointing the other way')}</div>
          <ul className="space-y-1.5">{ex.against.map(row)}</ul>
        </div>
      )}
      {ex.absent.length > 0 && (
        <div>
          <div className="mb-1 text-[11.5px] text-ink-3">{t('Not recorded either way before it')}</div>
          <ul className="space-y-0.5">
            {ex.absent.map((c) => (
              <li key={c.id} className="text-[12.5px] leading-snug text-ink-3">
                {claimSentence(data, c)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ex.outside.length > 0 && (
        <div>
          <div className="mb-1 text-[11.5px] text-ink-3">{t('From outside, in the weeks before')}</div>
          <Lately items={ex.outside} empty="" />
        </div>
      )}
      {ex.counterfactual.length > 0 && (
        <div>
          <div className="mb-1 text-[11.5px] text-ink-3">{t('Had it been otherwise (imagined, never counted)')}</div>
          <ul className="space-y-1">
            {ex.counterfactual.map((c) => (
              <li key={c.claim.id} className="text-[12.5px] leading-snug text-ink-2">
                {c.reading === 'might_not_have'
                  ? t('Without {cause}, this might not have happened.', { cause: data.nodes[c.claim.from]?.label ?? '' })
                  : t('Without {cause}, the Atlas cannot tell what would have happened.', { cause: data.nodes[c.claim.from]?.label ?? '' })}
                <span className="block text-[11.5px] text-ink-3">{c.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11.5px] text-ink-3">
        {ex.present.length
          ? t('Being recorded before it is not proof that it caused it. Some of it may be chance, or something not on the map.')
          : t('None of the possible reasons was recorded pushing this way before it: something else may have been at work.')}
      </p>
    </div>
  );
}
