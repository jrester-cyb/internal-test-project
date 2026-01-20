import { redirect } from 'react-router-dom'
import { authFetch } from '../api/authFetch'
import { getCachedFetch, cacheKeys } from '../utils/prefetchCache'
import type { UserProfile } from '../contexts/UserContext'

const PAGE_SIZE = 20

// Access the user data set during app initialization
function getAuthUser(): UserProfile {
  const auth = (window as any).__AUTH__
  if (!auth?.user) {
    throw new Error('User not authenticated')
  }
  return auth.user
}

export interface Session {
  id: string
  device: string | null
  location: string | null
  ipAddress: string | null
  deviceType: string
  browser: string
  operatingSystem: string
  createdAt: string
  lastActivityAt: string
  loggedOutAt: string | null
  isCurrent: boolean
}

export interface MFADevice {
  id: string
  name: string
  type: 'app' | 'sms' | 'email'
  maskedDestination: string | null
  confirmedAt: string
  lastUsedAt: string | null
  createdAt: string
}

export type { UserProfile }

export interface SessionsLoaderData {
  sessions: Map<number, Session>
  totalCount: number
  userId: string
}

export interface MFADevicesLoaderData {
  devices: MFADevice[]
}

export interface SecurityLayoutLoaderData {
  userId: string
  isOwnProfile: boolean
}

/**
 * Get user profile from the app's auth state (set at initialization)
 */
export function getUserProfile(): UserProfile {
  return getAuthUser()
}

/**
 * Loader for the security layout - gets user ID from auth state or route params
 */
export async function securityLayoutLoader({ params }: { params: { userId?: string } }): Promise<SecurityLayoutLoaderData> {
  const currentUser = getAuthUser()

  // If userId param exists, we're viewing another user's profile
  const userId = params.userId || currentUser.id
  const isOwnProfile = !params.userId || params.userId === currentUser.id

  return { userId, isOwnProfile }
}

/**
 * Loader for the sessions page - fetches initial sessions with pagination
 */
export async function sessionsLoader({ params }: { params: { userId?: string } }): Promise<SessionsLoaderData> {
  // Get userId from parent route data or from auth state
  let userId = params.userId

  if (!userId) {
    const user = getAuthUser()
    userId = user.id
  }

  // Use cache to avoid duplicate fetches (prefetch may have already started this)
  const key = cacheKeys.sessions(userId)
  const data = await getCachedFetch(key, async () => {
    const response = await authFetch(
      `/api/v3/auth/users/${userId}/sessions/?limit=${PAGE_SIZE}&offset=0`
    )

    if (!response.ok) {
      throw new Response('Failed to fetch sessions', { status: response.status })
    }

    return response.json()
  })

  // Convert results array to Map with indices
  const sessionsMap = new Map<number, Session>()
  data.results.forEach((session: Session, index: number) => {
    sessionsMap.set(index, session)
  })

  return {
    sessions: sessionsMap,
    totalCount: data.count,
    userId,
  }
}

/**
 * Loader for the MFA devices page
 */
export async function mfaDevicesLoader(): Promise<MFADevicesLoaderData> {
  // Use cache to avoid duplicate fetches (prefetch may have already started this)
  const key = cacheKeys.mfaDevices()
  const devices = await getCachedFetch(key, async () => {
    const response = await authFetch('/api/v3/auth/mfa-devices/')

    if (!response.ok) {
      throw new Response('Failed to fetch MFA devices', { status: response.status })
    }

    return response.json() as Promise<MFADevice[]>
  })

  return { devices }
}

/**
 * Password page loader - only accessible for own profile
 */
export async function passwordLoader({ params }: { params: { userId?: string } }): Promise<Record<string, never>> {
  const currentUser = getAuthUser()

  // If viewing another user's profile, redirect to sessions
  if (params.userId && params.userId !== currentUser.id) {
    throw redirect('../sessions')
  }

  return {}
}
