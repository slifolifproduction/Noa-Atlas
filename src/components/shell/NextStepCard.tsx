import { ArrowRight, Check } from 'lucide-react';
import { navigate } from '../../app/router';
import { nextStep, type NextStepAction } from '../../domain/nextStep';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { toast, useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';

/** One clear thing to do now. Recomputed from the data, so it moves on as you do. */
export function NextStepCard({ className }: { className?: string }) {
  const data = useAtlas((s) => s.data);
  const setActionStatus = useAtlas((s) => s.setActionStatus);
  const openCapture = useUI((s) => s.openCapture);
  const openEntity = useUI((s) => s.openEntity);
  const step = nextStep(data);

  const run = (a: NextStepAction) => {
    if (a.kind === 'capture') openCapture(a.capture);
    else if (a.kind === 'open') openEntity(a.ref);
    else if (a.kind === 'route') navigate(a.route);
    else {
      setActionStatus(a.actionId, 'done');
      toast('Done. Here is what comes next.', { tone: 'success' });
    }
  };

  return (
    <section className={cn('rounded-[8px] border border-accent/30 bg-accent-dim/40 px-3 py-2.5', className)} aria-label="Do this next">
      <div className="label text-accent!">Do this next</div>
      <p className="mt-1 text-[13.5px] leading-snug font-medium text-ink">{step.title}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{step.detail}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={step.action.kind === 'done' ? Check : ArrowRight} onClick={() => run(step.action)}>
          {step.cta}
        </Button>
        {step.also && (
          <button type="button" className="text-[12px] text-ink-2 hover:text-ink hover:underline" onClick={() => run(step.also!.action)}>
            {step.also.label}
          </button>
        )}
      </div>
    </section>
  );
}
