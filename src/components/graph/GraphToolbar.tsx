import { useReactFlow, type FitViewOptions } from '@xyflow/react';
import { Maximize2, Minus, Plus, Search, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { IconButton } from '../ui/Button';

/** Search within the current graph. Enter cycles through matches. */
export function GraphSearch({ query, onQuery, matches, onPick, placeholder = 'Find a node' }: { query: string; onQuery(q: string): void; matches: string[]; onPick(id: string): void; placeholder?: string }) {
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-[7px] border border-line bg-surface/95 pr-1 pl-2.5 backdrop-blur focus-within:border-accent/50">
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
          <button type="button" className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear search" onClick={() => onQuery('')}>
            <X size={12} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

export function ZoomControls({ padding = 0.12 }: { padding?: FitViewOptions['padding'] }) {
  const rf = useReactFlow();
  const fit = () => rf.fitView({ padding, duration: 400, nodes: rf.getNodes().filter((n) => n.type !== 'rings' && !n.hidden) });
  return (
    <div className="flex items-center rounded-[7px] border border-line bg-surface/95 backdrop-blur">
      <IconButton icon={Minus} label="Zoom out (−)" size="sm" onClick={() => rf.zoomOut({ duration: 200 })} />
      <IconButton icon={Plus} label="Zoom in (+)" size="sm" onClick={() => rf.zoomIn({ duration: 200 })} />
      <IconButton icon={Maximize2} label="Fit to screen (F)" size="sm" onClick={fit} />
    </div>
  );
}

export function ToolGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center rounded-[7px] border border-line bg-surface/95 backdrop-blur', className)}>{children}</div>;
}
