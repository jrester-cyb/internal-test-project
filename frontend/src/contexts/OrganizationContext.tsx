import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Organization, Workspace } from '@app/types'

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
}

export function OrganizationProvider({ children, organizations }: OrganizationProviderProps) {
  const [activeOrganization, setActiveOrganizationState] = useState<Organization | null>(() => {
    const savedOrgId = localStorage.getItem('activeOrganizationId')
    if (savedOrgId) {
      const savedOrg = organizations.find(org => org.id === savedOrgId)
      if (savedOrg) return savedOrg
    }
    return organizations[0] || null
  })

  const [workspaces, setWorkspacesState] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null)

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
