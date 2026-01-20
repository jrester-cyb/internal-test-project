import { authFetchJson } from './authFetch'
import type {
  Organization,
  OrganizationMember,
  OrganizationCreateInput,
  OrganizationUpdateInput,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api/v3'

interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface FetchOrganizationsOptions {
  limit?: number
  offset?: number
  search?: string
}

// ============================================================================
// Organizations API
// ============================================================================

export async function fetchOrganizations(options?: FetchOrganizationsOptions): Promise<PaginatedResponse<Organization>> {
  const params = new URLSearchParams()
  if (options?.limit !== undefined) params.set('limit', String(options.limit))
  if (options?.offset !== undefined) params.set('offset', String(options.offset))
  if (options?.search) params.set('search', options.search)

  const queryString = params.toString()
  const url = `${API_BASE}/organizations/${queryString ? `?${queryString}` : ''}`
  return authFetchJson<PaginatedResponse<Organization>>(url)
}

export async function fetchOrganization(id: string): Promise<Organization> {
  return authFetchJson<Organization>(`${API_BASE}/organizations/${id}/`)
}

export async function createOrganization(input: OrganizationCreateInput): Promise<Organization> {
  return authFetchJson<Organization>(`${API_BASE}/organizations/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description || '',
    }),
  })
}

export async function updateOrganization(id: string, input: OrganizationUpdateInput): Promise<Organization> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description

  return authFetchJson<Organization>(`${API_BASE}/organizations/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteOrganization(id: string): Promise<void> {
  await authFetchJson(`${API_BASE}/organizations/${id}/`, {
    method: 'DELETE',
  })
}

// ============================================================================
// Organization Members API
// ============================================================================

export async function fetchOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const data = await authFetchJson<PaginatedResponse<OrganizationMember>>(
    `${API_BASE}/organizations/${organizationId}/members/`
  )
  return data.results
}

export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' = 'member'
): Promise<OrganizationMember> {
  return authFetchJson<OrganizationMember>(
    `${API_BASE}/organizations/${organizationId}/members/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userId,
        role,
      }),
    }
  )
}

export async function updateOrganizationMember(
  organizationId: string,
  memberId: string,
  role: 'owner' | 'admin' | 'member'
): Promise<OrganizationMember> {
  return authFetchJson<OrganizationMember>(
    `${API_BASE}/organizations/${organizationId}/members/${memberId}/`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  )
}

export async function removeOrganizationMember(
  organizationId: string,
  memberId: string
): Promise<void> {
  await authFetchJson(
    `${API_BASE}/organizations/${organizationId}/members/${memberId}/`,
    {
      method: 'DELETE',
    }
  )
}
