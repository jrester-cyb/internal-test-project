// Boot loader: minimal public entry that confirms auth before importing the full app

import type { UserProfile } from './contexts/UserContext'

function redirectToLogin(): void {
  window.location.href = '/auth/login/?redirect_uri=' + encodeURIComponent(window.location.pathname)
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/v2/token/refresh/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return res.ok
  } catch {
    return false
  }
}

async function checkAuth(): Promise<UserProfile | null> {
  try {
    let res = await fetch('/api/auth/v2/whoami/', { credentials: 'include' })

    // If access token expired, try refreshing it
    if (res.status === 401) {
      const refreshed = await refreshToken()
      if (refreshed) {
        res = await fetch('/api/auth/v2/whoami/', { credentials: 'include' })
      }
    }

    if (!res.ok) {
      redirectToLogin()
      return null
    }
    return res.json()
  } catch {
    // Network error, redirect to login page
    redirectToLogin()
    return null
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

// Random loading messages
const loadingMessages = [
  'Loading Power-View',
  'Warming up the engines...',
  'Fetching your data...',
  'Setting up your dashboard...',
  'Initializing components...',
  'Checking authentication...',
  'Preparing workspace...',
  'Almost there...'
]
const randomMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)]

// SVG-based loading indicator that honors the page's text color
const spinnerSvg = `
  <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="4" fill="none" stroke-dasharray="28 28" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="1s" repeatCount="indefinite"/>
    </circle>
  </svg>
`
root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:rgba(255,255,255,0.87);gap:10px">${spinnerSvg}<span>${randomMessage}</span></div>`

  ; (async () => {
    let user: UserProfile | null = null
    try {
      user = await checkAuth()
        ; (window as any).__AUTH__ = { authed: !!user, user }
    } catch (e) {
      ; (window as any).__AUTH__ = { authed: false, user: null }
    }

    if (user) {
      const m = await import('./mainApp')
      m.mountApp(user)
    }
  })()