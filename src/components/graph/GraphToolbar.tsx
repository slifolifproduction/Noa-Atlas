import { useReactFlow, type FitViewOptions } from '@xyflow/react';
import { Maximize2, Minus, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Menu, MenuSeparator } from '../ui/Menu';

/** Search within the current graph. Enter cycles through matches. */
export function GraphSearch({
  query,
  onQuery,
  matches,
  onPick,
  placeholder = 'Find a node',
}: {
  query: string;
  onQuery(q: string): void;
  matches: string[];
  onPick(id: string): void;
  placeholder?: string;
}) {
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-[2px] border border-line bg-surface/95 pr-1 pl-2.5 backdrop-blur focus-within:border-accent/50">
      <Search size={13} className="shrink-0 text-ink-3" aria-hidden />
      <input
        ref={input}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches.length) {
            e.preventDefault();
            onPick(matches[index % matches.length]);
            setIndex((i) => i + 1);
          }
          if (e.key === 'Escape') {
            onQuery('');
            input.current?.blur();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full min-w-0 bg-transparent text-[12.5px] text-ink placeholder:text-ink-3 focus:outline-none sm:w-40"
      />
      {query && (
        <>
          <span className="num shrink-0 text-[11px] text-ink-3" aria-live="polite">
            {matches.length}
          </span>
          <button type="button" className="rounded-[2px] p-1 text-ink-3 hover:text-ink" aria-label="Clear search" onClick={() => onQuery('')}>
            <X size={12} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

const zoomBtn =
  'flex h-8 items-center justify-center gap-1.5 rounded-[2px] border border-line bg-surface text-[12.5px] text-ink-2 outline-none hover:border-line-strong hover:text-ink focus-visible:border-accent/60';

/**
 * Every way of changing how the graph looks, behind one button: zoom, the
 * page's own options (passed as children), and its help.
 */
export function ViewMenu({ padding = 0.12, children }: { padding?: FitViewOptions['padding']; children: ReactNode }) {
  const rf = useReactFlow();
  const fit = () => rf.fitView({ padding, duration: 400, nodes: rf.getNodes().filter((n) => n.type !== 'rings' && !n.hidden) });
  return (
    <Menu label="View" icon={SlidersHorizontal} width="w-[268px]">
      <div role="group" aria-label="Zoom" className="flex gap-1 px-1 pt-1 pb-1.5">
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={`${zoomBtn} w-9`}
          aria-label="Zoom out (−)"
          title="Zoom out (−)"
          onClick={() => rf.zoomOut({ duration: 200 })}
        >
          <Minus size={14} aria-hidden />
        </button>
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={`${zoomBtn} w-9`}
          aria-label="Zoom in (+)"
          title="Zoom in (+)"
          onClick={() => rf.zoomIn({ duration: 200 })}
        >
          <Plus size={14} aria-hidden />
        </button>
        <button type="button" role="menuitem" tabIndex={-1} className={`${zoomBtn} flex-1`} onClick={fit}>
          <Maximize2 size={13} aria-hidden />
          Fit to screen
          <kbd className="num text-[10.5px] opacity-60">F</kbd>
        </button>
      </div>
      <MenuSeparator />
      {children}
    </Menu>
  );
}
