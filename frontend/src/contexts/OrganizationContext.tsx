import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { Organization, Workspace } from '@app/types'
import { fetchWorkspaces } from '@app/api/assets'

interface OrganizationContextType {
  organizations: Organization[]
  activeOrganization: Organization | null
  setActiveOrganization: (org: Organization) => void
  workspaces: Workspace[]
  setWorkspaces: (workspaces: Workspace[]) => void
  activeWorkspace: Workspace | null
  setActiveWorkspace: (workspace: Workspace | null) => void
  isGlobalMode: boolean
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

interface OrganizationProviderProps {
  children: ReactNode
  organizations: Organization[]
  initialWorkspaces: Workspace[]
  initialActiveOrganizationId: string | null
  initialActiveWorkspaceId: string | null
}

export function OrganizationProvider({
  children,
  organizations,
  initialWorkspaces,
  initialActiveOrganizationId,
  initialActiveWorkspaceId,
}: OrganizationProviderProps) {
  const [activeOrganization, setActiveOrganizationState] = useState<Organization | null>(() => {
    if (initialActiveOrganizationId) {
      return organizations.find(org => org.id === initialActiveOrganizationId) || organizations[0] || null
    }
    return organizations[0] || null
  })

  const [workspaces, setWorkspacesState] = useState<Workspace[]>(initialWorkspaces)
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(() => {
    if (initialActiveWorkspaceId) {
      return initialWorkspaces.find(ws => ws.id === initialActiveWorkspaceId) || null
    }
    return null
  })

  // Fetch workspaces when active organization changes (after initial load)
  const [currentOrgId, setCurrentOrgId] = useState(activeOrganization?.id)

  useEffect(() => {
    // Skip if this is the initial org (already loaded by loader)
    if (activeOrganization?.id === currentOrgId) {
      return
    }

    if (!activeOrganization) {
      setWorkspacesState([])
      setActiveWorkspaceState(null)
      setCurrentOrgId(null)
      return
    }

    // Clear workspace immediately when org changes to prevent stale workspace being used
    setActiveWorkspaceState(null)

    let cancelled = false
    setCurrentOrgId(activeOrganization.id)

    async function loadWorkspaces() {
      try {
        const data = await fetchWorkspaces(activeOrganization!.id)
        if (cancelled) return

        const workspaceList: Workspace[] = Array.isArray(data) ? data : data.results || []
        setWorkspacesState(workspaceList)
      } catch (error) {
        console.error('Failed to fetch workspaces:', error)
        if (!cancelled) {
          setWorkspacesState([])
        }
      }
    }

    loadWorkspaces()

    return () => {
      cancelled = true
    }
  }, [activeOrganization, currentOrgId])

  // Use ref to track active org ID for stable callback
  const activeOrgIdRef = useRef(activeOrganization?.id)
  activeOrgIdRef.current = activeOrganization?.id

  const setActiveOrganization = useCallback((org: Organization) => {
    // Skip if already the active org to prevent race conditions during navigation
    if (activeOrgIdRef.current === org.id) {
      return
    }
    setActiveOrganizationState(org)
    localStorage.setItem('activeOrganizationId', org.id)
  }, [])

  const setWorkspaces = (newWorkspaces: Workspace[]) => {
    setWorkspacesState(newWorkspaces)
  }

  const setActiveWorkspace = (workspace: Workspace | null) => {
    setActiveWorkspaceState(workspace)
    // Store workspace ID scoped to the current organization
    const orgId = activeOrganization?.id
    if (workspace && orgId) {
      localStorage.setItem(`activeWorkspaceId_${orgId}`, workspace.id)
    } else if (orgId) {
      localStorage.removeItem(`activeWorkspaceId_${orgId}`)
    }
  }

  const isGlobalMode = activeWorkspace === null

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        activeOrganization,
        setActiveOrganization,
        workspaces,
        setWorkspaces,
        activeWorkspace,
        setActiveWorkspace,
        isGlobalMode,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider')
  }
  return context
}
