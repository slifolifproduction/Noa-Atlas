import { claimCode } from './claims';
import { AREA_META } from './constants';
import { loopById } from './loops';
import { decisionCode, displayNode, entryCode, experimentCode, pathCode, patternCode } from './selectors';
import type { AreaKey, AtlasData, EntityRef } from './types';
import { t } from '../i18n';

/** Short human label for any inspectable entity. */
export function entityLabel(data: AtlasData, ref: EntityRef): string {
  switch (ref.kind) {
    case 'area':
      return AREA_META[ref.id as AreaKey]?.label ?? t('Area');
    case 'node':
      return displayNode(data, ref.id)?.label ?? t('Element');
    case 'entry': {
      const e = data.entries[ref.id];
      return e ? `${entryCode(e.seq)} ${e.title}` : t('Entry');
    }
    case 'decision': {
      const d = data.decisions[ref.id];
      return d ? decisionCode(d.seq) : t('Decision');
    }
    case 'pattern': {
      const p = data.patterns[ref.id];
      return p ? patternCode(p.code) : t('Pattern');
    }
    case 'experiment': {
      const x = data.experiments[ref.id];
      return x ? experimentCode(x.code) : t('Experiment');
    }
    case 'path': {
      const p = data.paths[ref.id];
      return p ? pathCode(p.code) : t('Path');
    }
    case 'claim': {
      const c = data.claims[ref.id];
      return c ? claimCode(c.code) : t('Claim');
    }
    case 'occurrence':
      return data.occurrences[ref.id]?.label ?? t('Event');
    case 'loop': {
      const l = loopById(data, ref.id);
      return l?.name || (l?.type === 'balancing' ? t('Balancing loop') : t('Reinforcing loop'));
    }
  }
}

export function entityExists(data: AtlasData, ref: EntityRef): boolean {
  switch (ref.kind) {
    case 'area':
      return Boolean(AREA_META[ref.id as AreaKey]);
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
    case 'claim':
      return Boolean(data.claims[ref.id]);
    case 'occurrence':
      return Boolean(data.occurrences[ref.id]);
    case 'loop':
      return Boolean(loopById(data, ref.id));
  }
}
