import { authFetchJson } from './authFetch'
import type { Workspace, WorkspaceMember, WorkspaceMemberCreateInput, Role } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api/v3'

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ============================================================================
// Workspaces API
// ============================================================================

export async function fetchWorkspacesByOrganization(organizationId: string): Promise<Workspace[]> {
  const data = await authFetchJson<PaginatedResponse<Workspace>>(
    `${API_BASE}/workspaces/?organization=${organizationId}`
  )
  return data.results
}

export async function fetchWorkspace(id: string): Promise<Workspace> {
  return authFetchJson<Workspace>(`${API_BASE}/workspaces/${id}/`)
}

// ============================================================================
// Workspace Members API
// ============================================================================

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const data = await authFetchJson<PaginatedResponse<WorkspaceMember>>(
    `${API_BASE}/workspace-members/?workspace=${workspaceId}`
  )
  return data.results
}

export async function addWorkspaceMember(
  input: WorkspaceMemberCreateInput
): Promise<WorkspaceMember> {
  return authFetchJson<WorkspaceMember>(`${API_BASE}/workspace-members/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updateWorkspaceMember(
  memberId: string,
  roleId: string
): Promise<WorkspaceMember> {
  return authFetchJson<WorkspaceMember>(`${API_BASE}/workspace-members/${memberId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: roleId }),
  })
}

export async function removeWorkspaceMember(memberId: string): Promise<void> {
  await authFetchJson(`${API_BASE}/workspace-members/${memberId}/`, {
    method: 'DELETE',
  })
}

// ============================================================================
// Workspace Roles API
// ============================================================================

export async function fetchWorkspaceRoles(): Promise<Role[]> {
  const data = await authFetchJson<Role[]>(`${API_BASE}/roles/workspace_roles/`)
  return data
}
