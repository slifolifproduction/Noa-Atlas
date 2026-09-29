import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CLAIM_STATUSES, EFFECT_META, EFFECTS, LINK_META } from '../../domain/constants';
import type { ClaimStatus, Effect, LinkType } from '../../domain/types';
import { cn } from '../../lib/cn';
import { t } from '../../i18n';

function Swatch({
  color,
  dash,
  arrow,
  bar,
  width = 28,
  stroke = 1.2,
}: {
  color: string;
  dash?: string;
  arrow?: boolean;
  bar?: boolean;
  width?: number;
  stroke?: number;
}) {
  return (
    <svg width={width} height="10" className="shrink-0 overflow-visible" aria-hidden>
      <line x1="1" y1="5" x2={width - (arrow ? 4 : 1)} y2="5" stroke={color} strokeWidth={stroke} strokeDasharray={dash} strokeLinecap="round" />
      {arrow && !bar && (
        <path
          d={`M ${width - 7} 1.5 L ${width - 1} 5 L ${width - 7} 8.5`}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {bar && <path d={`M ${width - 1} 1 L ${width - 1} 9`} stroke={color} strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

/** A declared link's line. */
export function LinkSwatch({ type, width }: { type: LinkType; width?: number }) {
  const m = LINK_META[type];
  return <Swatch color={m.color} dash={m.dash} arrow={m.arrow} width={width} />;
}

/** A claim's line: its effect's colour and end. */
export function EffectSwatch({ effect, width }: { effect: Effect; width?: number }) {
  return <Swatch color={EFFECT_META[effect].color} arrow bar={effect === 'constrains'} width={width} stroke={1.4} />;
}

/** How a claim's status draws its line. */
export function StatusSwatch({ status, width }: { status: ClaimStatus; width?: number }) {
  const m = CLAIM_STATUSES.find((s) => s.key === status)!;
  return (
    <span style={{ opacity: m.opacity }} className="inline-flex">
      <Swatch color="#ece8df" dash={m.dash} width={width} stroke={status === 'tested' ? 1.7 : status === 'supported' ? 1.4 : 1.1} />
    </span>
  );
}

/** Collapsible key for the lines on a canvas: what the colours, ends and dashes mean. */
export function Legend({
  links = [],
  claims = true,
  extra,
  className,
  defaultOpen = false,
}: {
  links?: LinkType[];
  claims?: boolean;
  extra?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('pointer-events-auto rounded-[2px] border border-line bg-surface/92 backdrop-blur-sm', open ? 'w-[228px]' : 'w-auto', className)}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2" aria-expanded={open}>
        <span className="label mr-3">{t('Key')}</span>
        <ChevronDown size={13} className={cn('text-ink-3 transition-transform', !open && '-rotate-90')} aria-hidden />
      </button>
      {open && (
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto border-t border-line px-3 pt-2 pb-3">
          {claims && (
            <>
              <div className="label pt-0.5">{t('What seems to affect what')}</div>
              {EFFECTS.map((e) => (
                <div key={e.key} className="flex items-center gap-2.5">
                  <EffectSwatch effect={e.key} />
                  <span className="text-[12px] text-ink-2">{e.label}</span>
                </div>
              ))}
              <div className="label pt-2">{t('How sure')}</div>
              {CLAIM_STATUSES.filter((s) => s.key !== 'retired').map((s) => (
                <div key={s.key} className="flex items-center gap-2.5" title={s.description}>
                  <StatusSwatch status={s.key} />
                  <span className="text-[12px] text-ink-2">{s.label}</span>
                </div>
              ))}
            </>
          )}
          {links.length > 0 && (
            <>
              <div className={cn('label', claims && 'pt-2')}>{t('Links you drew')}</div>
              {links.map((l) => (
                <div key={l} className="flex items-center gap-2.5">
                  <LinkSwatch type={l} />
                  <span className="text-[12px] text-ink-2">{LINK_META[l].label}</span>
                </div>
              ))}
            </>
          )}
          {extra && <div className="space-y-1.5 border-t border-line pt-2">{extra}</div>}
        </div>
      )}
    </div>
  );
}
