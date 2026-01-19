import { fetchOrganizations, fetchWorkspaces } from '@app/api/assets'
import type { Organization, Workspace } from '@app/types'

export interface OrganizationsLoaderData {
  organizations: Organization[]
  initialWorkspaces: Workspace[]
  activeOrganizationId: string | null
  activeWorkspaceId: string | null
}

export async function organizationsLoader(): Promise<OrganizationsLoaderData> {
  const data = await fetchOrganizations()
  const organizations: Organization[] = Array.isArray(data) ? data : data.results || []

  // Determine active organization from localStorage or default to first
  const savedOrgId = localStorage.getItem('activeOrganizationId')
  let activeOrg: Organization | null = null
  if (savedOrgId) {
    activeOrg = organizations.find(org => org.id === savedOrgId) || null
  }
  if (!activeOrg && organizations.length > 0) {
    activeOrg = organizations[0]
  }

  // Fetch workspaces for the active organization
  let initialWorkspaces: Workspace[] = []
  if (activeOrg) {
    try {
      const wsData = await fetchWorkspaces(activeOrg.id)
      initialWorkspaces = Array.isArray(wsData) ? wsData : wsData.results || []
    } catch (error) {
      console.error('Failed to fetch workspaces:', error)
    }
  }

  // Determine active workspace from localStorage
  const savedWorkspaceId = localStorage.getItem('activeWorkspaceId')
  const activeWorkspaceId = savedWorkspaceId && initialWorkspaces.some(ws => ws.id === savedWorkspaceId)
    ? savedWorkspaceId
    : null

  return {
    organizations,
    initialWorkspaces,
    activeOrganizationId: activeOrg?.id || null,
    activeWorkspaceId,
  }
}
