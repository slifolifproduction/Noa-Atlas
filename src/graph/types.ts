import type { Edge, Node } from '@xyflow/react';
import type { DomainKey, MindCategory, Origin, PatternStatus, QuestionStatus, RelationType, SkillStatus } from '../domain/types';

export type HubNodeData = {
  key: DomainKey;
  label: string;
  statement: string;
  color: string;
  /** Share of recent entries touching this domain, relative to the busiest domain (0–1). */
  activity: number;
  activityCount: number;
  patternCount: number;
  itemCount: number;
  collapsed: boolean;
  center: boolean;
  matched: boolean;
  /** Labels sit on the side facing the centre, away from the satellites. */
  labelSide: 'top' | 'bottom';
  /** Small screens: show the domain name only until the hub is selected. */
  compact: boolean;
};

export type LabelSide = 'top' | 'right' | 'bottom' | 'left';

export type ItemNodeData = {
  label: string;
  color: string;
  domain: DomainKey;
  origin: Origin;
  mark?: SkillStatus;
  evidenceCount: number;
  labelSide: LabelSide;
  matched: boolean;
  /** Neighbour of the selection: keep the label visible at any zoom. */
  near: boolean;
};

export type MindNodeData = {
  label: string;
  category: MindCategory;
  color: string;
  origin: Origin;
  confidence?: number;
  status?: QuestionStatus;
  mirror: boolean;
  evidenceCount: number;
  matched: boolean;
};

export type PatternNodeData = {
  code: number;
  title: string;
  confidence: number;
  status: PatternStatus;
  matched: boolean;
};

export type RingsNodeData = { radii: number[]; labels: string[]; stretch: { x: number; y: number } };

export type SemanticEdgeData = {
  relation: RelationType;
  active: boolean;
  label: string;
  note?: string;
  /** Stored edges can be edited; structural and derived ones cannot. */
  stored: boolean;
  /** Secondary links (item to item across domains) stay faint until selected. */
  secondary?: boolean;
  /** Carries animated flow pulses (the living Orbit). */
  flow?: boolean;
  /** Dimmed because something else is selected: no pulses. */
  dim?: boolean;
  /** Under the pointer's hovered node. */
  hover?: boolean;
};

export type HubNode = Node<HubNodeData, 'hub'>;
export type ItemNode = Node<ItemNodeData, 'item'>;
export type MindNode = Node<MindNodeData, 'mind'>;
export type PatternNode = Node<PatternNodeData, 'pattern'>;
export type RingsNode = Node<RingsNodeData, 'rings'>;
export type AtlasFlowNode = HubNode | ItemNode | MindNode | PatternNode | RingsNode;
export type SemanticEdge = Edge<SemanticEdgeData, 'semantic'>;

export const CIRCLE_NODE_TYPES = new Set(['hub', 'item']);
