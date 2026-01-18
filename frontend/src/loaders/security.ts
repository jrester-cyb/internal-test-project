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
}

/**
 * Get user profile from the app's auth state (set at initialization)
 */
export function getUserProfile(): UserProfile {
  return getAuthUser()
}

/**
 * Loader for the security layout - gets user ID from auth state
 */
export async function securityLayoutLoader(): Promise<SecurityLayoutLoaderData> {
  const user = getAuthUser()
  return { userId: user.id }
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
      `/api/auth/v2/users/${userId}/sessions/?limit=${PAGE_SIZE}&offset=0`
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
    const response = await authFetch('/api/auth/v2/mfa-devices/')

    if (!response.ok) {
      throw new Response('Failed to fetch MFA devices', { status: response.status })
    }

    return response.json() as Promise<MFADevice[]>
  })

  return { devices }
}

/**
 * Password page doesn't need a loader - it's just a form
 */
export async function passwordLoader(): Promise<Record<string, never>> {
  return {}
}
