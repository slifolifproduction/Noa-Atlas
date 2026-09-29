import type { Edge, Node } from '@xyflow/react';
import type { AreaKey, ClaimStatus, Effect, ElementKind, LayerKey, LinkType, Origin, QuestionStatus, SkillStatus } from '../domain/types';

/** The person at the centre, or an area's marker on the outer edge of its sector. */
export type HubNodeData = {
  area: AreaKey;
  /** The person at the centre of the map. */
  center: boolean;
  label: string;
  statement: string;
  color: string;
  /** Share of recent notes touching this area, relative to the busiest area (0–1). */
  activity: number;
  activityCount: number;
  patternCount: number;
  itemCount: number;
  collapsed: boolean;
  matched: boolean;
  /** Terra incognita: elements on the map but nothing written about them lately. */
  quiet: boolean;
  /** Labels sit on the side facing away from the centre. */
  labelSide: 'top' | 'bottom';
  /** Small screens: show the area name only until the hub is selected. */
  compact: boolean;
};

export type LabelSide = 'top' | 'right' | 'bottom' | 'left';

/** An element of the map, placed by its area (angle) and layer (ring). */
export type ItemNodeData = {
  label: string;
  color: string;
  area: AreaKey;
  kind: ElementKind;
  layer: LayerKey;
  /** In the centre, with the person: what defines them. */
  core: boolean;
  origin: Origin;
  /** An outcome of concern: something the person wants explained or changed. */
  concern: boolean;
  /** Outside the person's control. */
  external: boolean;
  level?: SkillStatus;
  status?: QuestionStatus;
  /** Past its lifespan: kept on the map faintly, as history. */
  ended: boolean;
  evidenceCount: number;
  labelSide: LabelSide;
  matched: boolean;
  /** Neighbour of the selection: keep the label visible at any zoom. */
  near: boolean;
  /** Worth naming without being asked: something you care about, or that moved lately. */
  salient: boolean;
};

export type RingsNodeData = {
  radii: number[];
  labels: string[];
  stretch: { x: number; y: number };
  /** Sector boundaries, in degrees, and how far out they reach. */
  spokes: number[];
  spokeInner: number;
  spokeRadius: number;
};

export type SemanticEdgeData = {
  /**
   * A claim says one thing changes another; a link only organises the map.
   * `area` lines are derived, never stored: they sum up the claims and links
   * running between two areas of life. `member` ties an element to its area.
   */
  family: 'claim' | 'link' | 'area' | 'member';
  /** Area lines: what they sum up. */
  claimIds?: string[];
  linkIds?: string[];
  effect?: Effect;
  status?: ClaimStatus;
  linkType?: LinkType;
  claimId?: string;
  active: boolean;
  label: string;
  note?: string;
  /** Stored links and claims can be opened and edited; derived lines cannot. */
  stored: boolean;
  /** A proposal from the analysis, not yet adopted. */
  suggested?: boolean;
  /** Secondary lines (across areas) stay faint until selected. */
  secondary?: boolean;
  /** Carries animated flow pulses (living graphs). */
  flow?: boolean;
  /** Dimmed because something else is selected: no pulses. */
  dim?: boolean;
  /** Under the pointer's hovered node. */
  hover?: boolean;
  /** Part of the highlighted loop. */
  loop?: boolean;
};

export type HubNode = Node<HubNodeData, 'hub'>;
export type ItemNode = Node<ItemNodeData, 'item'>;
export type RingsNode = Node<RingsNodeData, 'rings'>;
export type AtlasFlowNode = HubNode | ItemNode | RingsNode;
export type SemanticEdge = Edge<SemanticEdgeData, 'semantic'>;

export const CIRCLE_NODE_TYPES = new Set(['hub', 'item']);
