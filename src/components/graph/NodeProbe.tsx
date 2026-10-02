import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { claimsInto, claimsOutOf } from '../../domain/claims';
import { AREA_META, areaHubKey, isAreaHubId, KIND_META, LAYER_META, layerOf, YOU_ID } from '../../domain/constants';
import { loopsThrough } from '../../domain/loops';
import { mapElements, patternsForNode, recordsFor } from '../../domain/selectors';
import type { AtlasData, ID } from '../../domain/types';
import { useSpace } from '../../graph/space';
import type { AtlasFlowNode, SemanticEdge } from '../../graph/types';
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
  /** How it connects: what is claimed to act on it and what it is claimed to act on. */
  links: string[];
}

function describe(data: AtlasData, id: ID): ProbeInfo | null {
  const recordCount = (x: ID) => {
    const r = recordsFor(data, x);
    return tn(r.entries.length + r.decisions.length, '{n} record', '{n} records');
  };
  const inPatterns = (n: number) => tn(n, '{n} repeat', '{n} repeats');

  if (id === YOU_ID || isAreaHubId(id)) {
    const key = id === YOU_ID ? 'self' : areaHubKey(id);
    const meta = AREA_META[key];
    const elements = mapElements(data).filter((n) => n.area === key).length;
    return {
      kind: key === 'self' ? t('You · the centre') : t('Area of life'),
      color: meta.color,
      title: meta.label,
      body: data.areas[key]?.statement || meta.description,
      facts: [tn(elements, '{n} element', '{n} elements'), recordCount(id), inPatterns(patternsForNode(data, id).length)],
      links: [],
    };
  }
  const node = data.nodes[id];
  if (!node) return null;
  const facts = [recordCount(id)];
  const patternCount = patternsForNode(data, id).length;
  if (patternCount) facts.push(tn(patternCount, 'in {n} repeat', 'in {n} repeats'));
  const loops = loopsThrough(data, id).length;
  if (loops) facts.push(tn(loops, 'in {n} loop', 'in {n} loops'));
  if (node.origin === 'inferred') facts.push(t('noticed by the Atlas in your notes'));
  const into = claimsInto(data, id).length;
  const out = claimsOutOf(data, id).length;
  const links: string[] = [];
  if (into) links.push(tn(into, '{n} reason acts on it', '{n} reasons act on it'));
  if (out) links.push(tn(out, 'it acts on {n}', 'it acts on {n}'));
  const kind = `${KIND_META[node.kind].label} · ${AREA_META[node.area].label}${node.area === 'self' ? '' : ` · ${LAYER_META[layerOf(node.kind)].short}`}`;
  return {
    kind: node.concern ? `${kind} · ${t('concern')}` : kind,
    color: AREA_META[node.area].color,
    title: node.label,
    body: node.summary,
    facts,
    links,
  };
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
              <span key={l} className="text-ink-2">
                {l}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 text-[10.5px] text-ink-3">{hint}</div>
      </div>
    </div>
  );
}
