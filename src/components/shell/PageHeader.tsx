import type { ReactNode } from 'react';
import { VIEWS, type ViewKey } from '../../domain/constants';
import { HowItWorks } from '../ui/HowItWorks';

/** The question the page answers, stated plainly at the top. */
export function PageHeader({
  view,
  title,
  description,
  actions,
  help,
  className,
}: {
  view?: ViewKey;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Page key for the "how this page works" note. */
  help?: string;
  className?: string;
}) {
  const v = view ? VIEWS[view] : undefined;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[20px] leading-tight font-medium tracking-[-0.015em] text-ink">{title ?? v?.question}</h1>
          {(description ?? v?.blurb) && <p className="mt-1 max-w-[62ch] text-[13px] text-ink-2">{description ?? v?.blurb}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {help && <HowItWorks page={help} className="mt-3" />}
    </div>
  );
}
