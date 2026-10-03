import { ArrowRight, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PatternCandidate } from '../../ai/types';
import { hrefFor } from '../../app/router';
import { StanceMark } from '../../components/evidence/EvidenceRow';
import { SourceLink } from '../../components/evidence/SourceLink';
import { Button } from '../../components/ui/Button';
import { useAtlas } from '../../state/atlasStore';
import { detectDecisionPatterns } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { t, tn } from '../../i18n';

const MIN_DECISIONS = 5;

/**
 * "Noticed in your decisions": repeats proposed from what you were optimising
 * for and how things turned out. Each shows the decisions it rests on, and
 * nothing joins the atlas until you say it rings true.
 */
export function DecisionRepeats() {
  const data = useAtlas((s) => s.data);
  const adopt = useAtlas((s) => s.adoptCandidate);
  const busy = useUI((s) => s.busy['decision-patterns']);
  const [candidates, setCandidates] = useState<PatternCandidate[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const count = Object.keys(data.decisions).length;
  const signatureKey = Object.values(data.decisions)
    .map((d) => `${d.id}:${d.optimizingFor.join(',')}:${d.outcomeRating ?? ''}`)
    .join('|');

  const run = async () => setCandidates(await detectDecisionPatterns());
  useEffect(() => {
    if (count >= MIN_DECISIONS) void run();
  }, [signatureKey, count]);

  const visible = (candidates ?? []).filter((c) => !hidden.includes(c.signature) && !c.existingPatternId);
  if (count < MIN_DECISIONS)
    return (
      <p className="mt-8 text-[12.5px] text-ink-3">
        {tn(
          count,
          'Repeats in your decisions show once there are {min} of them with what you were aiming for; there is {n} so far.',
          'Repeats in your decisions show once there are {min} of them with what you were aiming for; there are {n} so far.',
          { min: MIN_DECISIONS },
        )}
      </p>
    );
  if (candidates !== null && visible.length === 0) return null;

  return (
    <section className="mt-8 rounded-[2px] border border-line bg-surface" aria-labelledby="dp-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 id="dp-title" className="label text-ink-2!">
            {t('Noticed in your decisions')}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-3">{t('From what you were aiming for each time, and how it turned out. Does it ring true?')}</p>
        </div>
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} onClick={run}>
          {t('Look again')}
        </Button>
      </header>
      {candidates === null ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">{t('Reading your decisions…')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((c) => (
            <li key={c.signature} className="px-4 py-4">
              <p className="display text-[17px] leading-[1.2] text-ink">“{c.statement}”</p>
              <p className="mt-1.5 text-[12px] text-ink-3">
                {tn(c.supporting.length, 'Seen in {n} decision', 'Seen in {n} decisions')}
                {c.counter.length > 0 && ` · ${tn(c.counter.length, '{n} exception', '{n} exceptions')}`}
              </p>
              {/* What it rests on, folded: how it goes, what was seen, the decisions, and what is worth asking. */}
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-ink-2 hover:text-ink">{t('Show the decisions')}</summary>
                <div className="mt-2 space-y-2">
                  <div className="text-[11.5px] text-ink-3">{c.steps.reduce((acc, step) => t('{a}, then {b}', { a: acc, b: step }))}</div>
                  <p className="text-[12.5px] text-ink-2">{c.observation}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <RefList title={t('When it happened')} stance="supports" items={c.supporting} />
                    <RefList title={t('The exceptions')} stance="counters" items={c.counter} />
                  </div>
                  {c.explanation && (
                    <p className="text-[12.5px] text-ink-2">
                      <span className="text-ink-3">{t('Worth asking:')}</span> {c.explanation}
                    </p>
                  )}
                  <a href={hrefFor('timeline', 'decisions')} className="tap inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
                    {t('All decisions')} <ArrowRight size={12} aria-hidden />
                  </a>
                </div>
              </details>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const id = adopt(c);
                    toast(t('Added to Repeats.'), {
                      tone: 'success',
                      action: { label: t('Open it'), run: () => (window.location.hash = hrefFor('patterns', id)) },
                    });
                    void run();
                  }}
                >
                  {t('It rings true')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHidden([...hidden, c.signature])}>
                  {t('Not now')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RefList({ title, stance, items }: { title: string; stance: 'supports' | 'counters'; items: { decisionId: string; excerpt: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <StanceMark stance={stance} />
        <span className="text-[11.5px] text-ink-3">{title}</span>
      </div>
      <ul className="space-y-0.5 pl-6">
        {items.map((i) => (
          <li key={i.decisionId}>
            <SourceLink source={{ kind: 'decision', id: i.decisionId }} showTitle />
          </li>
        ))}
      </ul>
    </div>
  );
}
