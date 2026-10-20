export type SpaceType = 'adhoc' | 'team' | 'personal';
export type DocStatus = 'draft' | 'published';
export type PermissionLevel = 'view' | 'comment' | 'review' | 'edit' | 'admin';
export type PrincipalType = 'employee' | 'dyngroup' | 'everyone';
export type TargetType = 'space' | 'doc';

export const PERMISSION_LEVELS: PermissionLevel[] = [
  'view',
  'comment',
  'review',
  'edit',
  'admin',
];

export const SPACE_TYPES: SpaceType[] = ['adhoc', 'team', 'personal'];
export const DOC_STATUSES: DocStatus[] = ['draft', 'published'];

export interface Space {
  id: string;
  slug: string;
  name: string;
  type: SpaceType;
  description?: string;
  ownerId?: string;
  landingDocId?: string | null;
  fcFolderId?: number | null;
  archived?: boolean;
}

export interface Doc {
  id: string;
  slug: string;
  title: string;
  spaceId: string;
  fcFileId?: number | null;
  status: DocStatus;
  isLanding?: boolean;
  archived?: boolean;
  authorId?: string;
  updatedAt?: string;
}

export interface Permission {
  id: string;
  targetType: TargetType;
  targetId: string;
  principalType: PrincipalType;
  principalId?: string;
  principalLabel?: string;
  level: PermissionLevel;
  grantedBy?: string;
}

export interface DynGroup {
  id: string;
  name: string;
  description?: string;
  criteriaJson: string;
  ownerId?: string;
}

export interface Employee {
  id: string;
  entityId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  department?: string;
  subsidiary?: string;
  inactive?: boolean;
}

export interface UserPrefs {
  defaultSpaceId: string | null;
}

export type DynRuleOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'anyOf'
  | 'noneOf'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'gt'
  | 'lt'
  | 'between'
  | 'before'
  | 'after'
  | 'is';

export interface DynRule {
  field: string;
  op: DynRuleOperator;
  value?: unknown;
  value2?: unknown;
}

export interface DynCriteria {
  logic: 'and' | 'or';
  rules: DynRule[];
}

export const OPERATORS_BY_TYPE: Record<string, DynRuleOperator[]> = {
  string: [
    'equals',
    'notEquals',
    'contains',
    'startsWith',
    'endsWith',
    'isEmpty',
    'isNotEmpty',
  ],
  number: ['equals', 'notEquals', 'gt', 'lt', 'between'],
  boolean: ['is'],
  date: ['before', 'after', 'between'],
  list: ['equals', 'notEquals', 'anyOf', 'noneOf'],
  enum: ['equals', 'notEquals', 'anyOf', 'noneOf'],
};

export type ViewKind =
  | { kind: 'home' }
  | { kind: 'space'; slug: string }
  | { kind: 'doc'; spaceSlug: string; docSlug: string }
  | { kind: 'edit'; spaceSlug: string; docSlug: string }
  | { kind: 'settings'; spaceSlug: string }
  | { kind: 'members'; spaceSlug: string }
  | { kind: 'dyngroups' }
  | { kind: 'prefs' };
