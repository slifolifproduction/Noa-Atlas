import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { computeConfidence } from '../../domain/confidence';
import { CATEGORY_META, DOMAIN_META, hubKey, isHubId, PATTERN_COLOR, PATTERN_STATUS_LABEL, RELATION_META } from '../../domain/constants';
import { evidenceForNode, neighbors, patternsForNode } from '../../domain/selectors';
import type { AtlasData, ID, RelationType } from '../../domain/types';
import { useSpace } from '../../graph/space';
import type { AtlasFlowNode, SemanticEdge } from '../../graph/types';
import { pad2 } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';
import { t, tn } from '../../i18n';

const WIDTH = 264;
const GAP = 16;

interface ProbeInfo {
  kind: string;
  color: string;
  title: string;
  body?: string;
  facts: string[];
  links: { relation: RelationType; count: number }[];
}

function describe(data: AtlasData, id: ID): ProbeInfo | null {
  const links = (exclude: RelationType[] = ['part_of']) => {
    const counts = new Map<RelationType, number>();
    for (const n of neighbors(data, id)) if (!exclude.includes(n.relation)) counts.set(n.relation, (counts.get(n.relation) ?? 0) + 1);
    return [...counts.entries()]
      .map(([relation, count]) => ({ relation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  };
  const records = (n: number) => tn(n, '{n} record', '{n} records');
  const inPatterns = (n: number) => tn(n, '{n} pattern', '{n} patterns');

  if (isHubId(id)) {
    const key = hubKey(id);
    const meta = DOMAIN_META[key];
    const ev = evidenceForNode(data, id);
    const satellites = Object.values(data.nodes).filter((n) => n.domain === key).length;
    return {
      kind: t('Domain · ring {n}', { n: meta.ring }),
      color: meta.color,
      title: meta.label,
      body: data.domains[key]?.statement || meta.description,
      facts: [
        tn(satellites, '{n} satellite', '{n} satellites'),
        records(ev.entries.length + ev.decisions.length),
        inPatterns(patternsForNode(data, id).length),
      ],
      links: links(),
    };
  }
  const pattern = data.patterns[id];
  if (pattern) {
    const supports = pattern.evidence.filter((e) => e.stance === 'supports').length;
    return {
      kind: `${t('Pattern')} ${pad2(pattern.code)} · ${PATTERN_STATUS_LABEL[pattern.status].toLowerCase()}`,
      color: PATTERN_COLOR,
      title: pattern.chain.length ? pattern.chain.join(' → ') : pattern.title,
      body: pattern.observation,
      facts: [
        t('{n} supporting', { n: supports }),
        t('{n} counter', { n: pattern.evidence.length - supports }),
        t('confidence {pct}', { pct: `${Math.round(computeConfidence(pattern.evidence) * 100)}%` }),
      ],
      links: [],
    };
  }
  const node = data.nodes[id];
  if (!node) return null;
  const ev = evidenceForNode(data, id);
  const kind = node.category ? CATEGORY_META[node.category].label : node.domain ? DOMAIN_META[node.domain].label : t('Node');
  const color = node.category ? CATEGORY_META[node.category].color : node.domain ? DOMAIN_META[node.domain].color : '#aab2bc';
  const facts = [records(ev.entries.length + ev.decisions.length)];
  const patternCount = patternsForNode(data, id).length;
  if (patternCount) facts.push(tn(patternCount, 'in {n} pattern', 'in {n} patterns'));
  if (node.origin === 'inferred')
    facts.push(node.confidence !== undefined ? t('inferred ~{pct}', { pct: `${Math.round(node.confidence * 100)}%` }) : t('inferred'));
  return { kind: node.origin === 'inferred' ? `${kind} · ${t('inferred')}` : kind, color, title: node.label, body: node.summary, facts, links: links() };
}

/**
 * A quick look at a hovered node: what it is, what it rests on and how it
 * connects, without opening the panel. It tracks the node through pans and
 * zooms by writing its own transform, so the canvas never re-renders for it.
 */
export function NodeProbe({ id, occludedRight, hint }: { id: ID; occludedRight: number; hint: string }) {
  const data = useAtlas((s) => s.data);
  const info = useMemo(() => describe(data, id), [data, id]);
  const rf = useReactFlow<AtlasFlowNode, SemanticEdge>();
  const store = useStoreApi();
  const space = useSpace();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured once: the card's content does not change while it follows the node.
    const ch = el.offsetHeight;
    const place = () => {
      const n = rf.getInternalNode(id);
      if (!n) return;
      const { transform, width, height } = store.getState();
      const [tx, ty, k] = transform;
      // Where the node is drawn: its stored box, moved and scaled by the space engine.
      const o = space?.offset(id) ?? { dx: 0, dy: 0, s: 1 };
      const w = (n.measured.width ?? 0) * o.s;
      const h = (n.measured.height ?? 0) * o.s;
      const p = {
        x: n.internals.positionAbsolute.x + ((n.measured.width ?? 0) - w) / 2 + o.dx,
        y: n.internals.positionAbsolute.y + ((n.measured.height ?? 0) - h) / 2 + o.dy,
      };
      const right = (p.x + w) * k + tx + GAP;
      const left = p.x * k + tx - GAP - WIDTH;
      const x = right + WIDTH > width - occludedRight - 8 && left > 8 ? left : right;
      const y = Math.min(height - ch - 8, Math.max(8, (p.y + h / 2) * k + ty - ch / 2));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    place();
    const offStore = store.subscribe(place);
    const offSpace = space?.subscribe(place);
    return () => {
      offStore();
      offSpace?.();
    };
  }, [id, rf, store, space, occludedRight, info]);

  if (!info) return null;
  return (
    <div ref={ref} className="atlas-probe pointer-events-none absolute top-0 left-0 z-[5]" style={{ width: WIDTH }} role="tooltip">
      <div className="atlas-probe-card rounded-[2px] border border-line-strong bg-surface/[0.94] px-3 py-2.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: info.color }} />
          <span className="label truncate">{info.kind}</span>
        </div>
        <div className="mt-1 text-[13px] leading-snug font-medium text-ink">{info.title}</div>
        {info.body && <p className="mt-1 line-clamp-3 text-[12px] leading-[1.45] text-ink-2">{info.body}</p>}
        <div className="num mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5 border-t border-line pt-2 text-[10.5px] text-ink-3">
          {info.facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        {info.links.length > 0 && (
          <div className="num mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px]">
            {info.links.map((l) => (
              <span key={l.relation} style={{ color: RELATION_META[l.relation].color }}>
                {RELATION_META[l.relation].verb} {l.count}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 text-[10.5px] text-ink-3">{hint}</div>
      </div>
    </div>
  );
}
