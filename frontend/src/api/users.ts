import { authFetchJson } from './authFetch'
import type { User, UserCreateInput, UserUpdateInput } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface FetchUsersOptions {
  limit?: number
  offset?: number
  search?: string
}

export async function fetchUsers(options?: FetchUsersOptions): Promise<PaginatedResponse<User>> {
  const params = new URLSearchParams()
  if (options?.limit !== undefined) params.set('limit', String(options.limit))
  if (options?.offset !== undefined) params.set('offset', String(options.offset))
  if (options?.search) params.set('search', options.search)

  const queryString = params.toString()
  const url = `${API_BASE}/users/${queryString ? `?${queryString}` : ''}`
  return authFetchJson<PaginatedResponse<User>>(url)
}

export async function fetchUser(id: string): Promise<User> {
  return authFetchJson<User>(`${API_BASE}/users/${id}/`)
}

export async function createUser(input: UserCreateInput): Promise<User> {
  return authFetchJson<User>(`${API_BASE}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      first_name: input.firstName || '',
      last_name: input.lastName || '',
      phone_number: input.phoneNumber || '',
      group_ids: input.groupIds || [],
    }),
  })
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<User> {
  const body: Record<string, unknown> = {}
  if (input.email !== undefined) body.email = input.email
  if (input.firstName !== undefined) body.first_name = input.firstName
  if (input.lastName !== undefined) body.last_name = input.lastName
  if (input.phoneNumber !== undefined) body.phone_number = input.phoneNumber
  if (input.isActive !== undefined) body.is_active = input.isActive

  return authFetchJson<User>(`${API_BASE}/users/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteUser(id: string): Promise<void> {
  await authFetchJson(`${API_BASE}/users/${id}/`, {
    method: 'DELETE',
  })
}
