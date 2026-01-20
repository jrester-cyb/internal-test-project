/**
 * Authenticated fetch wrapper that handles JWT token refresh on 401 responses.
 *
 * When a request returns 401, this wrapper will:
 * 1. Attempt to refresh the access token using the refresh token cookie
 * 2. Retry the original request with the new access token
 * 3. If refresh fails, redirect to login
 *
 * This uses HTTP-only cookies for token storage, managed by the backend.
 */

const AUTH_REFRESH_ENDPOINT = '/api/v3/auth/token/refresh/'
const LOGIN_URL = '/auth/login/'

// Track if we're currently refreshing to prevent multiple simultaneous refresh attempts
let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

/**
 * Attempt to refresh the access token using the refresh token cookie.
 * Returns true if refresh was successful, false otherwise.
 */
async function refreshToken(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const response = await fetch(AUTH_REFRESH_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        return true
      }

      // Refresh failed - token is invalid or expired
      return false
    } catch (error) {
      console.error('Token refresh failed:', error)
      return false
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Redirect to login page with the current URL as the redirect target.
 */
function redirectToLogin(): void {
  const currentPath = window.location.pathname + window.location.search
  window.location.href = `${LOGIN_URL}?redirect_uri=${encodeURIComponent(currentPath)}`
}

/**
 * Authenticated fetch wrapper that handles 401 responses with token refresh.
 *
 * Usage:
 * ```typescript
 * const response = await authFetch('/api/auth/v2/users/123/sessions/', {
 *   method: 'GET',
 * })
 * ```
 *
 * Note: This function always adds `credentials: 'include'` to the request.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Ensure credentials are always included for cookie-based auth
  const fetchOptions: RequestInit = {
    ...init,
    credentials: 'include',
  }

  // Make the initial request
  let response = await fetch(input, fetchOptions)

  // If we get a 401, try to refresh the token and retry
  if (response.status === 401) {
    const refreshSuccess = await refreshToken()

    if (refreshSuccess) {
      // Retry the original request with the new token
      response = await fetch(input, fetchOptions)
    } else {
      // Refresh failed - redirect to login
      redirectToLogin()
      // Return the original 401 response (component can handle it if redirect doesn't happen immediately)
      return response
    }
  }

  return response
}

/**
 * Authenticated JSON fetch helper that handles 401 responses.
 * Automatically parses JSON response and throws on non-ok responses.
 *
 * Usage:
 * ```typescript
 * const data = await authFetchJson<Session[]>('/api/auth/v2/users/123/sessions/')
 * ```
 */
export async function authFetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await authFetch(input, init)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export default authFetch
