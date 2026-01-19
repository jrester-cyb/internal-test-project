import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
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

    let cancelled = false
    setCurrentOrgId(activeOrganization.id)

    async function loadWorkspaces() {
      try {
        const data = await fetchWorkspaces(activeOrganization!.id)
        if (cancelled) return

        const workspaceList: Workspace[] = Array.isArray(data) ? data : data.results || []
        setWorkspacesState(workspaceList)
        setActiveWorkspaceState(null) // Reset workspace when org changes
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

  const setActiveOrganization = (org: Organization) => {
    setActiveOrganizationState(org)
    localStorage.setItem('activeOrganizationId', org.id)
  }

  const setWorkspaces = (newWorkspaces: Workspace[]) => {
    setWorkspacesState(newWorkspaces)
  }

  const setActiveWorkspace = (workspace: Workspace | null) => {
    setActiveWorkspaceState(workspace)
    if (workspace) {
      localStorage.setItem('activeWorkspaceId', workspace.id)
    } else {
      localStorage.removeItem('activeWorkspaceId')
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
