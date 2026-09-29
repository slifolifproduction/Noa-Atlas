import { CONFIDENCE_BAND_LABEL, CONFIDENCE_EXPLAINER, confidenceBand } from '../../domain/confidence';
import { cn } from '../../lib/cn';

/**
 * Confidence is shown as a number, a qualitative band and a bar with a tick at
 * the 50% prior, so it reads as "how far the evidence has moved" rather than
 * as a grade.
 */
export function ConfidenceMeter({
  value,
  size = 'md',
  className,
  showBand = true,
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showBand?: boolean;
}) {
  const pct = Math.round(value * 100);
  const band = CONFIDENCE_BAND_LABEL[confidenceBand(value)];
  return (
    <div className={cn('min-w-0', className)} title={CONFIDENCE_EXPLAINER}>
      <div className="flex items-baseline gap-2">
        <span className={cn('num text-ink', size === 'lg' ? 'text-[22px] leading-none' : size === 'md' ? 'text-[14px]' : 'text-[12px]')}>{pct}%</span>
        {showBand && <span className={cn('text-ink-3', size === 'sm' ? 'text-[11px]' : 'text-[12px]')}>{band}</span>}
      </div>
      <div className={cn('relative mt-1.5 w-full rounded-full bg-ink/[0.07]', size === 'lg' ? 'h-[4px]' : 'h-[3px]')}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-ink-2" style={{ width: `${pct}%` }} />
        <div className="absolute -top-[3px] -bottom-[3px] left-1/2 w-px bg-ink-3/60" aria-hidden />
      </div>
    </div>
  );
}

/** Model estimate for an interpretation: visually quieter than evidence-derived confidence. */
export function EstimateTag({ value }: { value: number }) {
  return (
    <span
      className="num inline-flex items-center rounded-[2px] border border-dashed border-line-strong px-1.5 text-[11px] text-ink-2"
      title="Model estimate for this interpretation. Not derived from evidence counts."
    >
      est. {Math.round(value * 100)}%
    </span>
  );
}
