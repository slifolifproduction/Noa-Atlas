import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { entityExists, entityLabel } from '../../domain/entityLabel';
import { useInspectorWidth } from '../../hooks/useMediaQuery';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { IconButton } from '../ui/Button';
import { EmptyState } from '../ui/primitives';
import { DecisionView } from './DecisionView';
import { EntryView } from './EntryView';
import { ExperimentView } from './ExperimentView';
import { NodeView } from './NodeView';
import { PathView, PatternView } from './SummaryViews';

/**
 * The contextual panel. It keeps a trail of what was opened, so drilling from
 * a node into its evidence and back never loses the user's place.
 */
export function Inspector() {
  const stack = useUI((s) => s.inspector);
  const back = useUI((s) => s.back);
  const close = useUI((s) => s.closeInspector);
  const data = useAtlas((s) => s.data);
  const panelWidth = useInspectorWidth();
  const body = useRef<HTMLDivElement>(null);
  const top = stack[stack.length - 1];
  const prev = stack[stack.length - 2];

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [top?.kind, top?.id]);

  if (!top) return null;
  const exists = entityExists(data, top);

  const header = (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-2">
      {prev ? (
        <button
          type="button"
          onClick={back}
          className="flex min-w-0 items-center gap-1.5 rounded-[2px] px-2 py-1 text-[12px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink"
          title="Back (Alt + ←)"
        >
          <ArrowLeft size={13} className="shrink-0" aria-hidden />
          <span className="truncate">{entityLabel(data, prev)}</span>
        </button>
      ) : (
        <span className="label px-2">Inspector</span>
      )}
      {stack.length > 2 && <span className="num shrink-0 text-[10.5px] text-ink-3">+{stack.length - 2}</span>}
      <IconButton icon={X} label="Close panel (Esc)" size="sm" className="ml-auto" onClick={close} />
    </div>
  );

  const content = !exists ? (
    <div className="p-4">
      <EmptyState title="This item no longer exists">It may have been deleted. Go back to continue where you were.</EmptyState>
    </div>
  ) : top.kind === 'node' || top.kind === 'domain' ? (
    <NodeView id={top.kind === 'domain' ? `domain:${top.id}` : top.id} />
  ) : top.kind === 'entry' ? (
    <EntryView id={top.id} />
  ) : top.kind === 'decision' ? (
    <DecisionView id={top.id} />
  ) : top.kind === 'pattern' ? (
    <PatternView id={top.id} />
  ) : top.kind === 'experiment' ? (
    <ExperimentView id={top.id} />
  ) : (
    <PathView id={top.id} />
  );

  if (panelWidth) {
    return (
      <aside
        aria-label="Inspector"
        className="absolute top-0 right-0 bottom-0 z-20 flex animate-slide-in-right flex-col border-l border-line-strong bg-surface/[0.97] shadow-[-40px_0_80px_-40px_rgb(0_0_0/0.8)] backdrop-blur-md"
        style={{ width: panelWidth }}
      >
        {header}
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto" key={`${top.kind}:${top.id}`}>
          <div className="animate-fade-in">{content}</div>
        </div>
      </aside>
    );
  }
  return (
    <aside
      aria-label="Inspector"
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] animate-slide-in-up flex-col rounded-t-[14px] border-t border-line-strong bg-surface shadow-[0_-24px_48px_-12px_rgb(0_0_0/0.7)]"
    >
      <div className="flex justify-center pt-2" aria-hidden>
        <span className="h-1 w-9 rounded-full bg-ink/15" />
      </div>
      {header}
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]" key={`${top.kind}:${top.id}`}>
        {content}
      </div>
    </aside>
  );
}
