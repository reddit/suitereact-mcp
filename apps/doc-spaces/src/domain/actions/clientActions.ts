import { handleRestletAction } from 'suitereact';

import type {
  Doc,
  DynCriteria,
  DynGroup,
  Employee,
  Permission,
  PermissionLevel,
  PrincipalType,
  Space,
  SpaceType,
  TargetType,
  UserPrefs,
} from '../types';

const LOCAL_PROXY_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL
  : undefined;
const LOCAL_PROXY_TOKEN = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN
  : undefined;

const call = async <T>(action: string, data?: unknown): Promise<T> => {
  const result = await handleRestletAction(
    action,
    data ?? {},
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );
  if (result && typeof result === 'object' && 'success' in result) {
    const r = result as {
      success: boolean;
      data?: T;
      error?: string;
      message?: string;
    };
    if (!r.success) {
      throw new Error(r.error || r.message || `${action} failed`);
    }
    return r.data as T;
  }
  return result as T;
};

export const dsGetSpaces = (): Promise<Space[]> => call('dsGetSpaces');

export const dsGetSpaceDocs = (params: {
  spaceId: string;
  includeArchived?: boolean;
}): Promise<Doc[]> => call('dsGetSpaceDocs', params);

export const dsGetDocHtml = (params: {
  docId: string;
  draft?: boolean;
}): Promise<{ html: string }> => call('dsGetDocHtml', params);

export const dsCreateSpace = (params: {
  slug: string;
  name: string;
  type?: SpaceType;
  description?: string;
  everyoneView?: boolean;
}): Promise<{ spaceId: string }> => call('dsCreateSpace', params);

export const dsUpdateSpace = (params: {
  spaceId: string;
  name?: string;
  description?: string;
  type?: SpaceType;
}): Promise<{ ok: true }> => call('dsUpdateSpace', params);

export const dsArchiveSpace = (params: {
  spaceId: string;
}): Promise<{ ok: true }> => call('dsArchiveSpace', params);

export const dsSaveDocDraft = (params: {
  spaceId: string;
  docSlug: string;
  title: string;
  html: string;
}): Promise<{ docId: string }> => call('dsSaveDocDraft', params);

export const dsPublishDoc = (params: {
  docId: string;
}): Promise<{ ok: true }> => call('dsPublishDoc', params);

export const dsSetLandingDoc = (params: {
  spaceId: string;
  docId: string | null;
}): Promise<{ ok: true }> => call('dsSetLandingDoc', params);

export const dsAddPermission = (params: {
  targetType: TargetType;
  targetId: string;
  principalType: PrincipalType;
  principalId?: string;
  level: PermissionLevel;
}): Promise<{ permissionId: string }> => call('dsAddPermission', params);

export const dsRevokePermission = (params: {
  permissionId: string;
}): Promise<{ ok: true }> => call('dsRevokePermission', params);

export const dsListPermissions = (params: {
  targetType: TargetType;
  targetId: string;
}): Promise<Permission[]> => call('dsListPermissions', params);

export const dsGetEmployees = (params: {
  spaceId: string;
  q?: string;
  limit?: number;
}): Promise<Employee[]> => call('dsGetEmployees', params);

export const dsEvaluateDynGroup = (params: {
  criteria?: DynCriteria;
  groupId?: string;
  userId?: string;
  limit?: number;
}): Promise<{ ids: string[]; total: number }> =>
  call('dsEvaluateDynGroup', params);

export const dsListDynGroups = (): Promise<DynGroup[]> =>
  call('dsListDynGroups');

export const dsSaveDynGroup = (params: {
  groupId?: string;
  name: string;
  description?: string;
  criteria: DynCriteria;
}): Promise<{ groupId: string }> => call('dsSaveDynGroup', params);

export const dsCheckAccess = (params: {
  targetType: TargetType;
  targetId: string;
}): Promise<{ level: PermissionLevel | null }> => call('dsCheckAccess', params);

export const dsSetUserDefaultSpace = (params: {
  spaceId: string | null;
}): Promise<{ ok: true }> => call('dsSetUserDefaultSpace', params);

export const dsGetUserPrefs = (): Promise<UserPrefs> => call('dsGetUserPrefs');
