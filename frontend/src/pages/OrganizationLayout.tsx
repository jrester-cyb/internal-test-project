import { useEffect } from 'react'
import { Outlet, useRouteLoaderData, useNavigation } from 'react-router-dom'
import { useOrganization } from '@app/contexts/OrganizationContext'
import type { Workspace } from '@app/types'

interface LoaderData {
  workspaces: Workspace[]
  organizationId: string
}

export default function OrganizationLayout() {
  const { workspaces, organizationId } = useRouteLoaderData('organization') as LoaderData
  const { setWorkspaces, organizations, setActiveOrganization } = useOrganization()
  const navigation = useNavigation()

  // Skip syncing during navigation to prevent race conditions where old layout
  // overwrites the new org selection
  const isNavigating = navigation.state === 'loading'

  useEffect(() => {
    if (isNavigating) return

    // Set workspaces in context
    setWorkspaces(workspaces)

    // Set active organization based on route
    const org = organizations.find(o => o.id === organizationId)
    if (org) {
      setActiveOrganization(org)
    }
  }, [workspaces, organizationId, setWorkspaces, organizations, setActiveOrganization, isNavigating])

  return <Outlet />
}
