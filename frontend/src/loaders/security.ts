import { authFetch } from '../api/authFetch'

const PAGE_SIZE = 20

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

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
}

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
 * Loader for the security layout - fetches user ID
 */
export async function securityLayoutLoader(): Promise<SecurityLayoutLoaderData> {
  const response = await authFetch('/api/auth/v2/whoami/')
  if (!response.ok) {
    throw new Response('Failed to fetch user profile', { status: response.status })
  }
  const data: UserProfile = await response.json()
  return { userId: data.id }
}

/**
 * Loader for the sessions page - fetches initial sessions with pagination
 */
export async function sessionsLoader({ params }: { params: { userId?: string } }): Promise<SessionsLoaderData> {
  // Get userId from parent route data or fetch it
  let userId = params.userId

  if (!userId) {
    const profileResponse = await authFetch('/api/auth/v2/whoami/')
    if (!profileResponse.ok) {
      throw new Response('Failed to fetch user profile', { status: profileResponse.status })
    }
    const profile: UserProfile = await profileResponse.json()
    userId = profile.id
  }

  const response = await authFetch(
    `/api/auth/v2/users/${userId}/sessions/?limit=${PAGE_SIZE}&offset=0`
  )

  if (!response.ok) {
    throw new Response('Failed to fetch sessions', { status: response.status })
  }

  const data = await response.json()

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
  const response = await authFetch('/api/auth/v2/mfa-devices/')

  if (!response.ok) {
    throw new Response('Failed to fetch MFA devices', { status: response.status })
  }

  const devices: MFADevice[] = await response.json()
  return { devices }
}

/**
 * Password page doesn't need a loader - it's just a form
 */
export async function passwordLoader(): Promise<Record<string, never>> {
  return {}
}
