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

  // Skip syncing during navigation - the old component is still mounted while
  // loading the new route, and we don't want to overwrite the pending navigation
  const isNavigating = navigation.state === 'loading'

  useEffect(() => {
    // Don't sync during navigation - this prevents the old org from being set
    // while we're loading data for the new org
    if (isNavigating) {
      return
    }

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
