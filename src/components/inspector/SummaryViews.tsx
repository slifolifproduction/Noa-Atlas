import { ArrowUpRight } from 'lucide-react';
import { navigate } from '../../app/router';
import { PATTERN_KIND_LABEL, PATTERN_STATUS_LABEL } from '../../domain/constants';
import { pathCode, patternCode, patternStats } from '../../domain/selectors';
import type { ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { ConfidenceMeter } from '../evidence/Confidence';
import { Button } from '../ui/Button';
import { NodeChip, PanelSection } from './parts';

export function PatternView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const close = useUI((s) => s.closeInspector);
  const p = data.patterns[id];
  if (!p) return null;
  const stats = patternStats(data, p);
  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="label">
          {patternCode(p.code)} · {PATTERN_KIND_LABEL[p.kind]} · {PATTERN_STATUS_LABEL[p.status]}
        </div>
        <h2 className="mt-2 display text-[28px] leading-[1.04] text-ink">{p.chain.join(' → ')}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          <span className="text-ink-3">Observed pattern: </span>
          {p.observation}
        </p>
        <ConfidenceMeter value={stats.confidence} className="mt-3.5" />
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div>
            <dt className="text-ink-3">Evidence</dt>
            <dd className="num text-ink-2">
              {stats.supportCount} for · {stats.counterCount} against
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Frequency</dt>
            <dd className="text-ink-2">{stats.frequency}</dd>
          </div>
          <div>
            <dt className="text-ink-3">First observed</dt>
            <dd className="num text-ink-2">{formatDate(stats.firstObserved)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Last observed</dt>
            <dd className="num text-ink-2">{formatDate(stats.lastObserved)}</dd>
          </div>
        </dl>
        <Button
          size="sm"
          className="mt-4"
          icon={ArrowUpRight}
          onClick={() => {
            close();
            navigate('patterns', id);
          }}
        >
          Open full evidence
        </Button>
      </div>
      {p.nodeIds.length > 0 && (
        <PanelSection title="Rests on" count={p.nodeIds.length}>
          <div className="flex flex-wrap gap-1.5">
            {p.nodeIds.map((n) => (
              <NodeChip key={n} id={n} />
            ))}
          </div>
        </PanelSection>
      )}
    </div>
  );
}

export function PathView({ id }: { id: ID }) {
  const path = useAtlas((s) => s.data.paths[id]);
  const close = useUI((s) => s.closeInspector);
  if (!path) return null;
  return (
    <div className="px-4 pt-4 pb-4">
      <div className="label">{pathCode(path.code)}</div>
      <h2 className="mt-2 display text-[28px] leading-[1.04] text-ink">{path.title}</h2>
      <p className="mt-2 text-[13px] text-ink-2">{path.objective}</p>
      {path.summary && <p className="mt-1.5 text-[12.5px] text-ink-3">{path.summary}</p>}
      <Button
        size="sm"
        className="mt-4"
        icon={ArrowUpRight}
        onClick={() => {
          close();
          navigate('paths');
        }}
      >
        Compare paths
      </Button>
    </div>
  );
}
