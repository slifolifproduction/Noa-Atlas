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
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line pb-5">
        <div className="min-w-0">
          {v && <div className="label mb-3 text-ink-3">{v.label}</div>}
          <h1 className="display text-[40px] text-ink md:text-[52px]">{title ?? v?.question}</h1>
          {(description ?? v?.blurb) && <p className="mt-3 max-w-[58ch] text-[13.5px] leading-relaxed text-ink-2">{description ?? v?.blurb}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {help && <HowItWorks page={help} className="mt-4" />}
    </div>
  );
}
