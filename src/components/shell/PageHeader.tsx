import type { ReactNode } from 'react';
import { SECTIONS, type SectionKey } from '../../domain/constants';
import { HowItWorks } from '../ui/HowItWorks';

/** The question each section answers, stated plainly at the top. */
export function PageHeader({
  section,
  title,
  eyebrow,
  description,
  actions,
  help,
  className,
}: {
  section?: SectionKey;
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Page key for the "how this page works" note. */
  help?: string;
  className?: string;
}) {
  const s = section ? SECTIONS.find((x) => x.key === section) : undefined;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="label">{eyebrow ?? (s ? `${s.num} · ${s.label}` : null)}</div>
          <h1 className="mt-1 text-[20px] leading-tight font-medium tracking-[-0.015em] text-ink">{title ?? s?.question}</h1>
          {(description ?? s?.blurb) && <p className="mt-1 max-w-[62ch] text-[13px] text-ink-2">{description ?? s?.blurb}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {help && <HowItWorks page={help} className="mt-3" />}
    </div>
  );
}
