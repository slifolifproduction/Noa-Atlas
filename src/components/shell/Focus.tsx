import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { focusLabel } from '../../domain/ask';
import { AREA_META, KIND_META } from '../../domain/constants';
import type { AreaKey, EntityRef } from '../../domain/types';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { AREA_ICONS, KIND_ICONS } from '../icons';

/** The focus, if it still exists: what every lens is answering about. */
export function useFocus(): EntityRef | null {
  const focus = useUI((s) => s.focus);
  const exists = useAtlas((s) => (!focus ? false : focus.kind === 'area' ? Boolean(AREA_META[focus.id as AreaKey]) : Boolean(s.data.nodes[focus.id])));
  return focus && exists ? focus : null;
}

function FocusMark({ focus, size = 13 }: { focus: EntityRef; size?: number }) {
  const node = useAtlas((s) => (focus.kind === 'node' ? s.data.nodes[focus.id] : undefined));
  const area = (focus.kind === 'area' ? focus.id : node?.area) as AreaKey;
  const Icon = focus.kind === 'area' ? AREA_ICONS[area] : node ? KIND_ICONS[node.kind] : AREA_ICONS.self;
  return <Icon size={size} color={AREA_META[area]?.color} strokeWidth={1.8} className="shrink-0" aria-hidden />;
}

/**
 * "Looking at …" in the top bar: the thing every lens is about. Clicking it
 * opens it; the cross lets go of it.
 */
export function FocusChip({ className }: { className?: string }) {
  const focus = useFocus();
  const data = useAtlas((s) => s.data);
  const openEntity = useUI((s) => s.openEntity);
  const setFocus = useUI((s) => s.setFocus);
  if (!focus) return null;
  const node = focus.kind === 'node' ? data.nodes[focus.id] : undefined;
  return (
    <div className={cn('flex h-8 max-w-[300px] min-w-0 items-center rounded-[2px] border border-line-strong bg-surface/80', className)}>
      <button
        type="button"
        onClick={() => openEntity(focus)}
        className="flex min-w-0 items-center gap-2 py-1 pr-1 pl-2.5 text-left"
        title={node ? KIND_META[node.kind].label : t('Area of life')}
      >
        <span className="label-sm shrink-0 text-ink-3">{t('Looking at')}</span>
        <FocusMark focus={focus} />
        <span className="truncate text-[12.5px] text-ink">{focusLabel(data, focus)}</span>
      </button>
      <button
        type="button"
        onClick={() => setFocus(null)}
        className="flex h-full shrink-0 items-center px-2 text-ink-3 hover:text-ink"
        aria-label={t('Let go of {name}', { name: focusLabel(data, focus) })}
        title={t('Let go (Esc)')}
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}

/**
 * On a list lens: whether it shows only what concerns the focus. It starts on
 * whenever there is a focus, and "Show everything" is local to the page, so
 * the focus itself stays for the other lenses.
 */
export function useFocusFilter() {
  const focus = useFocus();
  const [on, setOn] = useState(true);
  const key = focus ? `${focus.kind}:${focus.id}` : '';
  useEffect(() => setOn(true), [key]);
  return { focus, on: Boolean(focus) && on, setOn };
}

export function FocusBanner({
  focus,
  on,
  setOn,
  shown,
  total,
  className,
}: {
  focus: EntityRef | null;
  on: boolean;
  setOn(on: boolean): void;
  shown: number;
  total: number;
  className?: string;
}) {
  const data = useAtlas((s) => s.data);
  const setFocus = useUI((s) => s.setFocus);
  if (!focus) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[2px] border border-line bg-surface px-3 py-2', className)}>
      <FocusMark focus={focus} />
      <span className="min-w-0 flex-1 text-[12.5px] text-ink-2">
        {on
          ? t('Showing what concerns {name}: {n} of {total}.', { name: focusLabel(data, focus), n: shown, total })
          : t('Showing everything. You are still looking at {name}.', { name: focusLabel(data, focus) })}
      </span>
      <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => setOn(!on)}>
        {on ? t('Show everything') : t('Only {name}', { name: focusLabel(data, focus) })}
      </button>
      <button type="button" className="text-[12px] text-ink-3 hover:text-ink" onClick={() => setFocus(null)}>
        {t('Let go')}
      </button>
    </div>
  );
}
