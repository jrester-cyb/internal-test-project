// Boot loader: minimal public entry that confirms auth before importing the full app
import './index.css'

async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' })
    return res.ok
  } catch (e) {
    return false
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

// Simple minimal spinner while auth check runs
root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">Checking authentication</div>'

  (async () => {
    try {
      const authed = await checkAuth()
        ; (window as any).__AUTH__ = { authed }
    } catch (e) {
      ; (window as any).__AUTH__ = { authed: false }
    }

    const m = await import('./mainApp')
    m.mountApp()
  })()
