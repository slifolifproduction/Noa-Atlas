import { useEffect, useRef } from 'react';
import { EFFECTS, LINKS } from '../../domain/constants';
import { displayNode } from '../../domain/selectors';
import type { Effect, ID, LinkType } from '../../domain/types';
import type { AtlasFlowNode } from '../../graph/types';
import { t } from '../../i18n';
import { useAtlas } from '../../state/atlasStore';
import { toast, useUI } from '../../state/uiStore';
import { EffectSwatch, LinkSwatch } from './Legend';

/**
 * Shown after dragging from one element to another. Two different things can
 * be said: a claim that one changes the other (a hypothesis, checked against
 * the record), or a declared link (true because you say so).
 */
export function RelationPicker({
  x,
  y,
  sourceId,
  targetId,
  onClose,
}: {
  x: number;
  y: number;
  source?: AtlasFlowNode;
  target?: AtlasFlowNode;
  sourceId: ID;
  targetId: ID;
  onClose(): void;
}) {
  const data = useAtlas((s) => s.data);
  const addLink = useAtlas((s) => s.addLink);
  const addClaim = useAtlas((s) => s.addClaim);
  const openEntity = useUI((s) => s.openEntity);
  const ref = useRef<HTMLDivElement>(null);
  const a = displayNode(data, sourceId);
  const b = displayNode(data, targetId);
  const bothElements = Boolean(data.nodes[sourceId] && data.nodes[targetId]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const claim = (effect: Effect) => {
    const id = addClaim({ from: sourceId, to: targetId, effect, author: 'user', state: 'adopted' });
    toast(t('Added as a hunch. It becomes surer as your notes show it.'), { tone: 'success' });
    openEntity({ kind: 'claim', id });
    onClose();
  };
  const link = (type: LinkType) => {
    addLink(sourceId, targetId, type);
    toast(t('Linked: {a} {verb} {b}.', { a: a?.label ?? '', verb: LINKS.find((r) => r.key === type)?.verb ?? '', b: b?.label ?? '' }), { tone: 'success' });
    onClose();
  };

  const left = Math.max(12, Math.min(x + 12, (ref.current?.parentElement?.clientWidth ?? 9999) - 316));
  const top = Math.max(12, Math.min(y - 20, (ref.current?.parentElement?.clientHeight ?? 9999) - 560));
  const row = 'flex w-full items-center gap-2.5 rounded-[2px] px-2 py-1.5 text-left hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05] focus-visible:outline-none';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('Connect two things')}
      className="absolute z-20 max-h-[min(560px,80vh)] w-[300px] animate-rise overflow-y-auto rounded-[2px] border border-line-strong bg-overlay p-1.5 shadow-2xl"
      style={{ left, top }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }}
    >
      <div className="px-2 pt-1 pb-2 text-[12px] leading-snug text-ink-2">
        <span className="text-ink">{a?.label}</span> → <span className="text-ink">{b?.label}</span>
      </div>
      {bothElements && (
        <>
          <div className="px-2 pt-1">
            <div className="label">{t('A possible reason: one changes the other')}</div>
            <p className="mt-0.5 text-[11px] text-ink-3">{t('It starts as a hunch and becomes surer only as your notes show it.')}</p>
          </div>
          {EFFECTS.map((e) => (
            <button key={e.key} type="button" onClick={() => claim(e.key)} className={row}>
              <EffectSwatch effect={e.key} />
              <span className="min-w-0">
                <span className="block text-[12.5px] text-ink">{e.label}</span>
                <span className="block text-[11px] text-ink-3">{e.description}</span>
              </span>
            </button>
          ))}
        </>
      )}
      <div className="mt-1 border-t border-line px-2 pt-2">
        <div className="label">{t('A link')}</div>
        <p className="mt-0.5 text-[11px] text-ink-3">{t('How they relate, in your own terms. True because you say so; it says nothing about causes.')}</p>
      </div>
      {LINKS.map((r) => (
        <button key={r.key} type="button" onClick={() => link(r.key)} className={row}>
          <LinkSwatch type={r.key} />
          <span className="min-w-0">
            <span className="block text-[12.5px] text-ink">{r.label}</span>
            <span className="block text-[11px] text-ink-3">{r.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
