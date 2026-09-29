import { CircleQuestionMark, Crosshair, Plus } from 'lucide-react';
import { useState } from 'react';
import { showOnMap } from '../../app/showOnMap';
import { AddNodeModal } from '../../components/graph/AddNodeModal';
import { NodeChip } from '../../components/inspector/parts';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState, Segmented } from '../../components/ui/primitives';
import { QUESTION_STATUS_LABEL } from '../../domain/constants';
import { experimentCode, neighbors, questionNodes } from '../../domain/selectors';
import type { AtlasNode, QuestionStatus } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';

export function QuestionsPage() {
  const data = useAtlas((s) => s.data);
  const [adding, setAdding] = useState(false);
  const questions = questionNodes(data);
  const groups: { status: QuestionStatus; hint: string }[] = [
    { status: 'exploring', hint: 'Actively gathering evidence' },
    { status: 'open', hint: 'Worth keeping open' },
    { status: 'resolved', hint: 'Provisionally answered' },
  ];

  return (
    <div className="mx-auto max-w-[900px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        view="questions"
        help="questions"
        description="Questions worth keeping open instead of answering too early. Each one also appears on the Mind map."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
            New question
          </Button>
        }
      />
      {questions.length === 0 ? (
        <EmptyState icon={CircleQuestionMark} title="No open questions" className="mt-6">
          Good questions to start with: what you are actually optimising for, which opportunities to stop accepting, and which assumptions about your work have
          never been tested.
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
      {adding && <AddNodeModal layer="mind" defaultCategory="question" onClose={() => setAdding(false)} />}
    </div>
  );
}

function QuestionCard({ question: q }: { question: AtlasNode }) {
  const data = useAtlas((s) => s.data);
  const update = useAtlas((s) => s.updateNode);
  const open = useUI((s) => s.openEntity);
  const linked = neighbors(data, q.id);
  const experiments = Object.values(data.experiments).filter((x) => x.questionIds.includes(q.id));
  return (
    <li className={cn('rounded-[2px] border border-line bg-surface px-4 py-3.5', q.status === 'resolved' && 'opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => open({ kind: 'node', id: q.id })} className="min-w-0 flex-1 text-left">
          <p className="display text-[23px] leading-[1.12] text-ink hover:underline">{q.label}</p>
          {q.summary && <p className="mt-1 text-[12.5px] text-ink-2">{q.summary}</p>}
        </button>
        <Segmented<QuestionStatus>
          label="Status"
          size="sm"
          value={q.status ?? 'open'}
          onChange={(status) => update(q.id, { status })}
          options={(['open', 'exploring', 'resolved'] as const).map((s) => ({ value: s, label: QUESTION_STATUS_LABEL[s] }))}
        />
      </div>
      {q.resolution && (
        <p className="mt-2 border-l-2 border-line-strong pl-2.5 text-[12.5px] text-ink-2">
          <span className="text-ink-3">Provisional answer: </span>
          {q.resolution}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11.5px] text-ink-3">{linked.length ? 'Examines' : 'Not linked to anything yet'}</span>
        {linked.map((l) => (
          <NodeChip key={l.otherId} id={l.otherId} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-3">
        <span>Opened {formatDate(q.createdAt.slice(0, 10), { year: true })}</span>
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
          onClick={() => showOnMap('mind', q.id, { kind: 'node', id: q.id })}
        >
          <Crosshair size={12} aria-hidden /> Show in Mind
        </button>
      </div>
    </li>
  );
}
