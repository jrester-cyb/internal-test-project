import { useEffect } from 'react'
import { Outlet, useRouteLoaderData } from 'react-router-dom'
import { useOrganization } from '@app/contexts/OrganizationContext'
import type { Workspace } from '@app/types'

interface LoaderData {
  workspaces: Workspace[]
  organizationId: string
}

export default function OrganizationLayout() {
  const { workspaces, organizationId } = useRouteLoaderData('organization') as LoaderData
  const { setWorkspaces, organizations, setActiveOrganization } = useOrganization()

  useEffect(() => {
    // Set workspaces in context
    setWorkspaces(workspaces)

    // Set active organization based on route
    const org = organizations.find(o => o.id === organizationId)
    if (org) {
      setActiveOrganization(org)
    }
  }, [workspaces, organizationId, setWorkspaces, organizations, setActiveOrganization])

  return <Outlet />
}
