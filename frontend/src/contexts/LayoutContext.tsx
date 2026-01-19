import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useMatches } from 'react-router-dom'
import { useOrganization } from './OrganizationContext'

interface LayoutContextType {
  // Sidebar state
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  // Responsive state
  isMobile: boolean
  windowWidth: number

  // Route-based layout flags
  hideSidebar: boolean
  hideBreadcrumbs: boolean
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined)

interface LayoutProviderProps {
  children: ReactNode
}

export function LayoutProvider({ children }: LayoutProviderProps) {
  const matches = useMatches()
  const { workspaces } = useOrganization()

  const [sidebarOpen, setSidebarOpenState] = useState(() => {
    const stored = localStorage.getItem('sidebarOpen')
    return stored !== null ? JSON.parse(stored) : true
  })

  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  const isMobile = windowWidth < 768

  // Check the most specific (last) matched route for layout flags
  const lastMatch = matches[matches.length - 1]
  const hideBreadcrumbs = (lastMatch?.handle as any)?.hideBreadcrumbs ?? false
  const routeHideSidebar = (lastMatch?.handle as any)?.hideSidebar ?? false

  // Hide sidebar if route requests it OR if no workspaces are loaded yet
  const hideSidebar = routeHideSidebar || workspaces?.length === 0

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const setSidebarOpen = (open: boolean) => {
    setSidebarOpenState(open)
    localStorage.setItem('sidebarOpen', JSON.stringify(open))
  }

  return (
    <LayoutContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        isMobile,
        windowWidth,
        hideSidebar,
        hideBreadcrumbs,
      }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider')
  }
  return context
}
