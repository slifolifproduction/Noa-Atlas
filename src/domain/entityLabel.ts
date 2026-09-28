import { DOMAIN_META } from './constants';
import { decisionCode, displayNode, entryCode, experimentCode, pathCode, patternCode } from './selectors';
import type { AtlasData, DomainKey, EntityRef } from './types';

/** Short human label for any inspectable entity. */
export function entityLabel(data: AtlasData, ref: EntityRef): string {
  switch (ref.kind) {
    case 'domain':
      return DOMAIN_META[ref.id as DomainKey]?.label ?? 'Domain';
    case 'node':
      return displayNode(data, ref.id)?.label ?? 'Node';
    case 'entry': {
      const e = data.entries[ref.id];
      return e ? `${entryCode(e.seq)} ${e.title}` : 'Entry';
    }
    case 'decision': {
      const d = data.decisions[ref.id];
      return d ? decisionCode(d.seq) : 'Decision';
    }
    case 'pattern': {
      const p = data.patterns[ref.id];
      return p ? patternCode(p.code) : 'Pattern';
    }
    case 'experiment': {
      const x = data.experiments[ref.id];
      return x ? experimentCode(x.code) : 'Experiment';
    }
    case 'path': {
      const p = data.paths[ref.id];
      return p ? pathCode(p.code) : 'Path';
    }
  }
}

export function entityExists(data: AtlasData, ref: EntityRef): boolean {
  switch (ref.kind) {
    case 'domain':
      return Boolean(DOMAIN_META[ref.id as DomainKey]);
    case 'node':
      return Boolean(data.nodes[ref.id]);
    case 'entry':
      return Boolean(data.entries[ref.id]);
    case 'decision':
      return Boolean(data.decisions[ref.id]);
    case 'pattern':
      return Boolean(data.patterns[ref.id]);
    case 'experiment':
      return Boolean(data.experiments[ref.id]);
    case 'path':
      return Boolean(data.paths[ref.id]);
  }
}
