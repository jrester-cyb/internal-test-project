import { authFetchJson } from './authFetch'
import type { Role, Permission, RoleCreateInput, RoleUpdateInput, RoleScope } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api/v3'

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ============================================================================
// Roles API
// ============================================================================

export async function fetchRoles(): Promise<Role[]> {
  const data = await authFetchJson<PaginatedResponse<Role>>(`${API_BASE}/roles/`)
  return data.results
}

export async function fetchRolesByScope(scope: RoleScope): Promise<Role[]> {
  const data = await authFetchJson<Role[]>(`${API_BASE}/roles/${scope}_roles/`)
  return data
}

export async function fetchInstanceRoles(): Promise<Role[]> {
  return fetchRolesByScope('instance')
}

export async function fetchOrganizationRoles(): Promise<Role[]> {
  return fetchRolesByScope('organization')
}

export async function fetchWorkspaceRoles(): Promise<Role[]> {
  return fetchRolesByScope('workspace')
}

export async function fetchRole(id: string): Promise<Role> {
  return authFetchJson<Role>(`${API_BASE}/roles/${id}/`)
}

export async function createRole(input: RoleCreateInput): Promise<Role> {
  return authFetchJson<Role>(`${API_BASE}/roles/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description || '',
      scope: input.scope,
      permission_ids: input.permissionIds || [],
    }),
  })
}

export async function updateRole(id: string, input: RoleUpdateInput): Promise<Role> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description
  if (input.permissionIds !== undefined) body.permission_ids = input.permissionIds

  return authFetchJson<Role>(`${API_BASE}/roles/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteRole(id: string): Promise<void> {
  await authFetchJson(`${API_BASE}/roles/${id}/`, {
    method: 'DELETE',
  })
}

// ============================================================================
// Permissions API
// ============================================================================

export async function fetchPermissions(): Promise<Permission[]> {
  const data = await authFetchJson<PaginatedResponse<Permission>>(`${API_BASE}/permissions/`)
  return data.results
}

export async function fetchPermissionsByResource(resourceType: string): Promise<Permission[]> {
  const data = await authFetchJson<PaginatedResponse<Permission>>(
    `${API_BASE}/permissions/?resource_type=${resourceType}`
  )
  return data.results
}

// Group permissions by resource type for UI display
export function groupPermissionsByResource(permissions: Permission[]): Map<string, Permission[]> {
  const grouped = new Map<string, Permission[]>()
  for (const perm of permissions) {
    const existing = grouped.get(perm.resourceType) || []
    existing.push(perm)
    grouped.set(perm.resourceType, existing)
  }
  return grouped
}
