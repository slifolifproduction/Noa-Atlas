import type { Edge, Node } from '@xyflow/react';
import type { AreaKey, ClaimStatus, Effect, ElementKind, ID, LayerKey, LinkType, Origin, QuestionStatus, SkillStatus } from '../domain/types';
import type { HelixSpec } from './helix';
import type { FigureShape } from './shapes';

/** The person at the centre, or an area's marker on the outer edge of its sector. */
export type HubNodeData = {
  area: AreaKey;
  /** The person at the centre of the map. */
  center: boolean;
  /** Seated on a constellation shape's star. */
  onFigure?: boolean;
  /** On a constellation shape: its star's depth (see graph/shapes.ts). */
  figureZ?: number;
  label: string;
  statement: string;
  color: string;
  /** Share of recent notes touching this area, relative to the busiest area (0–1). */
  activity: number;
  activityCount: number;
  patternCount: number;
  itemCount: number;
  /** Elements folded into the marker while the map shows each area's essentials. */
  hiddenCount: number;
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
  /** On the Causes helix: its seat, which the space engine turns about the axis. */
  helix?: { slot: number; phase: number; side: 1 | -1; r?: number };
  /** On a still globe: round the far side, so its name hides (with depth on, the space engine decides as it turns). */
  far?: boolean;
  /** On a constellation shape: the star (hub) it orbits. */
  orbitHub?: ID;
  /** On a constellation shape: its depth, its star's by its ring (see graph/shapes.ts). */
  figureZ?: number;
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

/** A constellation shape's figure: its lines, its other stars and each area's orbit (see graph/shapes.ts). */
export type FigureNodeData = {
  figure: FigureShape;
  /** The constellation's name, set small under the figure. */
  name: string;
};

/** The Causes helix's backbone: strands, base pairs, emitter rings and captions (see graph/helix.ts). */
export type HelixNodeData = {
  spec: HelixSpec;
  captions: { lead: string; follow: string; inner: string; around: string; empty?: string };
  /** On the globe: each meridian's area, named on the equator in its colour (same order as spec.meridians). */
  areas?: { label: string; color: string }[];
};

export type SemanticEdgeData = {
  /**
   * A claim says one thing changes another; a link only organises the map.
   * `area` lines are derived, never stored: they sum up the claims and links
   * running between two areas of life. `member` ties an element to its area.
   */
  family: 'claim' | 'link' | 'area' | 'member';
  /** A member line that reaches a folded part of another area, rather than the element's own. */
  reach?: boolean;
  /** Area and reach lines: what they sum up. */
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
  /** A fixed bend, in graph units, to the left of its direction (the helix's rising steps arc outward). */
  arc?: number;
};

export type HubNode = Node<HubNodeData, 'hub'>;
export type ItemNode = Node<ItemNodeData, 'item'>;
export type RingsNode = Node<RingsNodeData, 'rings'>;
export type FigureNode = Node<FigureNodeData, 'figure'>;
export type HelixNode = Node<HelixNodeData, 'helix'>;
export type AtlasFlowNode = HubNode | ItemNode | RingsNode | FigureNode | HelixNode;
/** Backdrops: drawn behind the graph, never selected, hovered, linked or travelled to. */
export const isBackdrop = (n: { type?: string }) => n.type === 'rings' || n.type === 'figure' || n.type === 'helix';
export const BACKDROP_IDS = new Set(['__rings', '__helix']);
export type SemanticEdge = Edge<SemanticEdgeData, 'semantic'>;

export const CIRCLE_NODE_TYPES = new Set(['hub', 'item']);
