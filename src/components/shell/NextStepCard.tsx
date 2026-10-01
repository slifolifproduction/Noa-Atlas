import { ArrowRight, Check } from 'lucide-react';
import { navigate } from '../../app/router';
import { nextStep, type NextStepAction } from '../../domain/nextStep';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useToday } from '../../lib/dates';
import { toast, useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { t } from '../../i18n';

/** One clear thing to do now. Recomputed from the data, so it moves on as you do. */
export function NextStepCard({ className }: { className?: string }) {
  const data = useAtlas((s) => s.data);
  const setActionStatus = useAtlas((s) => s.setActionStatus);
  const declineInquiry = useAtlas((s) => s.declineInquiry);
  const resolveSuggestion = useAtlas((s) => s.resolveSuggestion);
  const claimFromNote = useAtlas((s) => s.claimFromNote);
  const updateDecision = useAtlas((s) => s.updateDecision);
  const openCapture = useUI((s) => s.openCapture);
  const openEntity = useUI((s) => s.openEntity);
  useToday();
  const step = nextStep(data);

  const run = (a: NextStepAction) => {
    if (a.kind === 'capture') openCapture(a.capture);
    else if (a.kind === 'open') openEntity(a.ref);
    else if (a.kind === 'route') navigate(a.route);
    else if (a.kind === 'decline') declineInquiry(a.key, a.inquiryKind);
    else if (a.kind === 'offer') {
      // A hunch is made a claim; anything else is a plain yes or no.
      const sug = data.entries[a.entryId]?.analysis?.suggestions.find((x) => x.id === a.suggestionId);
      if (a.take && sug?.type === 'attribution') claimFromNote(a.entryId, a.suggestionId);
      else resolveSuggestion(a.entryId, a.suggestionId, a.take);
    } else if (a.kind === 'outcome') {
      updateDecision(a.decisionId, { outcomeRating: a.rating });
      toast(t('Kept with the decision. It counts toward what you learn from your choices.'), {
        tone: 'success',
        action: { label: t('Add what happened'), run: () => openEntity({ kind: 'decision', id: a.decisionId }) },
      });
    } else {
      setActionStatus(a.actionId, 'done');
      toast(t('Done. Here is what comes next.'), { tone: 'success' });
    }
  };

  return (
    <section
      className={cn('ticks relative border border-line-strong bg-ink/[0.02] px-3.5 pt-3 pb-3.5 [--tick-color:var(--color-accent)]', className)}
      aria-label={t('Do this next')}
    >
      <div className="label flex items-center gap-2 text-accent!">
        <span className="atlas-live-dot h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        {t('Do this next')}
      </div>
      <p className="display mt-2 text-[18px] leading-[1.2] text-ink">{step.title}</p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{step.detail}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {step.choices ? (
          <div className="flex flex-wrap gap-1.5">
            {step.choices.map((c) => (
              <Button key={c.label} size="sm" onClick={() => run(c.action)}>
                {c.label}
              </Button>
            ))}
          </div>
        ) : (
          <Button
            size="sm"
            variant="primary"
            icon={step.action.kind === 'done' || step.action.kind === 'offer' ? Check : ArrowRight}
            onClick={() => run(step.action)}
          >
            {step.cta}
          </Button>
        )}
        {step.also && (
          <button type="button" className="text-[12px] text-ink-2 hover:text-ink hover:underline" onClick={() => run(step.also!.action)}>
            {step.also.label}
          </button>
        )}
      </div>
    </section>
  );
}
