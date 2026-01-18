import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@app/contexts/ThemeContext'
import { UserProvider } from '@app/contexts/UserContext'
import type { UserProfile } from '@app/contexts/UserContext'
import { router } from './router'

export function mountApp(user: UserProfile) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <UserProvider user={user}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </UserProvider>
    </StrictMode>,
  )
}

export default mountApp
