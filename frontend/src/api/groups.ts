import { authFetchJson } from './authFetch'
import type {
  Group,
  GroupMembership,
  GroupCreateInput,
  GroupUpdateInput,
  InstanceMember,
  InstanceGroupMember,
  Role,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api'

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ============================================================================
// Groups API
// ============================================================================

export async function fetchGroups(): Promise<Group[]> {
  const data = await authFetchJson<PaginatedResponse<Group>>(`${API_BASE}/groups/`)
  return data.results
}

export async function fetchGroup(id: string): Promise<Group> {
  return authFetchJson<Group>(`${API_BASE}/groups/${id}/`)
}

export async function createGroup(input: GroupCreateInput): Promise<Group> {
  return authFetchJson<Group>(`${API_BASE}/groups/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description || '',
    }),
  })
}

export async function updateGroup(id: string, input: GroupUpdateInput): Promise<Group> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description

  return authFetchJson<Group>(`${API_BASE}/groups/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteGroup(id: string): Promise<void> {
  await authFetchJson(`${API_BASE}/groups/${id}/`, {
    method: 'DELETE',
  })
}

// ============================================================================
// Group Memberships API
// ============================================================================

export async function fetchGroupMemberships(groupId?: string): Promise<GroupMembership[]> {
  const url = groupId
    ? `${API_BASE}/group-memberships/?group=${groupId}`
    : `${API_BASE}/group-memberships/`
  const data = await authFetchJson<PaginatedResponse<GroupMembership>>(url)
  return data.results
}

export async function addUserToGroup(groupId: string, userId: string): Promise<GroupMembership> {
  return authFetchJson<GroupMembership>(`${API_BASE}/group-memberships/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group: groupId,
      user: userId,
    }),
  })
}

export async function removeUserFromGroup(membershipId: string): Promise<void> {
  await authFetchJson(`${API_BASE}/group-memberships/${membershipId}/`, {
    method: 'DELETE',
  })
}

// ============================================================================
// Instance Members API (user role assignments at instance level)
// ============================================================================

export async function fetchInstanceMembers(userId?: string): Promise<InstanceMember[]> {
  const url = userId
    ? `${API_BASE}/instance-members/?user=${userId}`
    : `${API_BASE}/instance-members/`
  const data = await authFetchJson<PaginatedResponse<InstanceMember>>(url)
  return data.results
}

export async function assignInstanceRole(userId: string, roleId: string): Promise<InstanceMember> {
  return authFetchJson<InstanceMember>(`${API_BASE}/instance-members/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: userId,
      role: roleId,
    }),
  })
}

export async function removeInstanceRole(memberId: string): Promise<void> {
  await authFetchJson(`${API_BASE}/instance-members/${memberId}/`, {
    method: 'DELETE',
  })
}

// ============================================================================
// Instance Group Members API (group role assignments at instance level)
// ============================================================================

export async function fetchInstanceGroupMembers(groupId?: string): Promise<InstanceGroupMember[]> {
  const url = groupId
    ? `${API_BASE}/instance-group-members/?group=${groupId}`
    : `${API_BASE}/instance-group-members/`
  const data = await authFetchJson<PaginatedResponse<InstanceGroupMember>>(url)
  return data.results
}

export async function assignInstanceGroupRole(groupId: string, roleId: string): Promise<InstanceGroupMember> {
  return authFetchJson<InstanceGroupMember>(`${API_BASE}/instance-group-members/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group: groupId,
      role: roleId,
    }),
  })
}

export async function removeInstanceGroupRole(memberId: string): Promise<void> {
  await authFetchJson(`${API_BASE}/instance-group-members/${memberId}/`, {
    method: 'DELETE',
  })
}
