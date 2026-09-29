import { Crosshair, Plus } from 'lucide-react';
import { KIND_ICONS } from '../../components/icons';
import { StatusBadge } from '../../components/evidence/Status';
import { claimStatus } from '../../domain/claims';
import { useState } from 'react';
import { showOnMap } from '../../app/showOnMap';
import { AddNodeModal } from '../../components/graph/AddNodeModal';
import { NodeChip } from '../../components/inspector/parts';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState, Segmented } from '../../components/ui/primitives';
import { QUESTION_STATUS_LABEL, STATUS_META } from '../../domain/constants';
import { experimentCode, neighbors, questionNodes } from '../../domain/selectors';
import type { AtlasNode, ClaimStatus, Investigation, QuestionStatus } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { t } from '../../i18n';

const INVESTIGATION_LABEL: Record<Investigation['kind'], () => string> = {
  why: () => t('Why?'),
  what_if: () => t('What if?'),
  value: () => t('What matters?'),
};

export function QuestionsPage() {
  const data = useAtlas((s) => s.data);
  const [adding, setAdding] = useState(false);
  const questions = questionNodes(data);
  const groups: { status: QuestionStatus; hint: string }[] = [
    { status: 'exploring', hint: t('Actively gathering evidence') },
    { status: 'open', hint: t('Worth keeping open') },
    { status: 'resolved', hint: t('Provisionally answered') },
  ];

  return (
    <div className="mx-auto max-w-[900px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        view="questions"
        help="questions"
        description={t(
          'Questions worth keeping open instead of answering too early. A why-question needs a contrast; a what-if follows a change forward; a question of value is yours to settle.',
        )}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
            {t('New question')}
          </Button>
        }
      />
      {questions.length === 0 ? (
        <EmptyState icon={KIND_ICONS.question} title={t('No open questions')} className="mt-6">
          {t(
            'Good questions to start with: what you are actually optimising for, which opportunities to stop accepting, and which assumptions about your work have never been tested.',
          )}
        </EmptyState>
      ) : (
        groups.map((g) => {
          const list = questions.filter((q) => (q.status ?? 'open') === g.status);
          if (!list.length) return null;
          return (
            <section key={g.status} className="mt-7">
              <h2 className="label mb-2.5">
                {QUESTION_STATUS_LABEL[g.status]} · {list.length} <span className="ml-2 tracking-normal normal-case">{g.hint}</span>
              </h2>
              <ul className="space-y-2.5">
                {list.map((q) => (
                  <QuestionCard key={q.id} question={q} />
                ))}
              </ul>
            </section>
          );
        })
      )}
      {adding && <AddNodeModal defaultKind="question" defaultArea="self" onClose={() => setAdding(false)} />}
    </div>
  );
}

function QuestionCard({ question: q }: { question: AtlasNode }) {
  const data = useAtlas((s) => s.data);
  const update = useAtlas((s) => s.updateNode);
  const open = useUI((s) => s.openEntity);
  const linked = neighbors(data, q.id).filter((l) => l.relation.family === 'link');
  const inv = q.investigation;
  const statuses = (inv?.claimIds ?? []).flatMap((id) => (data.claims[id] ? [claimStatus(data, data.claims[id]!)] : []));
  const weakest = statuses.sort((a, b) => STATUS_META[a].rank - STATUS_META[b].rank)[0] as ClaimStatus | undefined;
  const conclusion = inv?.conclusion ?? q.resolution;
  const experiments = Object.values(data.experiments).filter((x) => x.questionIds.includes(q.id));
  return (
    <li className={cn('rounded-[2px] border border-line bg-surface px-4 py-3.5', q.status === 'resolved' && 'opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => open({ kind: 'node', id: q.id })} className="min-w-0 flex-1 text-left">
          {inv && <span className="label mb-1 block">{INVESTIGATION_LABEL[inv.kind]()}</span>}
          <p className="display text-[17px] leading-[1.2] text-ink hover:underline">{q.label}</p>
          {q.summary && <p className="mt-1 text-[12.5px] text-ink-2">{q.summary}</p>}
        </button>
        <Segmented<QuestionStatus>
          label={t('Status')}
          size="sm"
          value={q.status ?? 'open'}
          onChange={(status) => update(q.id, { status })}
          options={(['open', 'exploring', 'resolved'] as const).map((s) => ({ value: s, label: QUESTION_STATUS_LABEL[s] }))}
        />
      </div>
      {inv && inv.kind !== 'value' && (inv.anchorId || inv.contrast) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          {inv.anchorId && (
            <>
              {inv.kind === 'why' ? t('Explaining') : t('Changing')} <NodeChip id={inv.anchorId} />
            </>
          )}
          {inv.contrast && <span>{t('rather than: {c}', { c: inv.contrast })}</span>}
        </div>
      )}
      {inv && inv.claimIds.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          {inv.kind === 'what_if'
            ? t('{n} possible consequences gathered', { n: inv.claimIds.length })
            : t('{n} possible contributors gathered', { n: inv.claimIds.length })}
          {weakest && (
            <>
              · {t('the least certain is')} <StatusBadge status={weakest} />
            </>
          )}
        </p>
      )}
      {inv?.kind === 'value' && <p className="mt-1.5 text-[12px] text-ink-3">{t('A question of value: evidence can inform it, only you can settle it.')}</p>}
      {conclusion && (
        <p className="mt-2 border-l-2 border-line-strong pl-2.5 text-[12.5px] text-ink-2">
          <span className="text-ink-3">{t('Provisional answer:')} </span>
          {conclusion}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11.5px] text-ink-3">{linked.length ? t('Examines') : t('Not linked to anything yet')}</span>
        {linked.map((l) => (
          <NodeChip key={l.otherId} id={l.otherId} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-3">
        <span>{t('Opened {date}', { date: formatDate(q.createdAt, { year: true }) })}</span>
        {experiments.map((x) => (
          <button
            key={x.id}
            type="button"
            className="text-ink-2 underline decoration-ink-3/50 underline-offset-2 hover:text-ink"
            onClick={() => open({ kind: 'experiment', id: x.id })}
          >
            {experimentCode(x.code)} {x.title}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-ink-2 hover:text-ink"
          onClick={() => showOnMap('orbit', q.id, { kind: 'node', id: q.id })}
        >
          <Crosshair size={12} aria-hidden /> {t('Show on map')}
        </button>
      </div>
    </li>
  );
}
