import {
  Anchor,
  BookOpen,
  Briefcase,
  CalendarCheck,
  CircleDashed,
  CircleQuestionMark,
  Eye,
  Flame,
  FolderKanban,
  Gem,
  House,
  Milestone,
  Repeat,
  Repeat2,
  Shapes,
  ShieldAlert,
  Split,
  Target,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { CaptureKind, DomainKey, MindCategory } from '../domain/types';

export const DOMAIN_ICONS: Record<DomainKey, LucideIcon> = {
  identity: UserRound,
  values: Gem,
  goals: Target,
  career: Briefcase,
  skills: Wrench,
  projects: FolderKanban,
  finance: Wallet,
  relationships: Users,
  environment: House,
  habits: Repeat,
};

export const CATEGORY_ICONS: Record<MindCategory, LucideIcon> = {
  belief: Anchor,
  assumption: CircleDashed,
  motivation: Flame,
  fear: ShieldAlert,
  value: Gem,
  mental_model: Shapes,
  decision: Split,
  question: CircleQuestionMark,
  experience: Milestone,
};

export const PatternIcon = Repeat2;

export const CAPTURE_ICONS: Record<CaptureKind, LucideIcon> = {
  journal: BookOpen,
  decision: Split,
  reflection: Eye,
  experience: Milestone,
  problem: TriangleAlert,
  observation: Eye,
  goal: Target,
  project: FolderKanban,
  habit: CalendarCheck,
};
