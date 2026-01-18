import { useEffect } from 'react'
import { useRouteLoaderData, useNavigate } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { useOrganization } from '@app/contexts/OrganizationContext'
import type { Workspace } from '@app/types'

interface LoaderData {
  workspaces: Workspace[]
  organizationId: string
}

export default function OrganizationIndexPage() {
  const { workspaces, organizationId } = useRouteLoaderData('organization') as LoaderData
  const navigate = useNavigate()
  const { setWorkspaces, setActiveWorkspace } = useOrganization()

  useEffect(() => {
    // Store workspaces in context
    setWorkspaces(workspaces)

    // Try to restore active workspace from localStorage, or use first one
    const savedWorkspaceId = localStorage.getItem('activeWorkspaceId')
    const savedWorkspace = savedWorkspaceId
      ? workspaces.find(w => w.id === savedWorkspaceId)
      : null

    const activeWorkspace = savedWorkspace || null
    setActiveWorkspace(activeWorkspace)

    // Navigate to the map
    if (activeWorkspace) {
      navigate(`/organizations/${organizationId}/workspaces/${activeWorkspace.id}/map`, { replace: true })
    } else {
      // No workspaces, go to organization-level map
      navigate(`/organizations/${organizationId}/map`, { replace: true })
    }
  }, [workspaces, organizationId, setWorkspaces, setActiveWorkspace, navigate])

  return (
    <Box display="flex" justifyContent="center" alignItems="center" height="100%" width="100%">
      <CircularProgress />
    </Box>
  )
}
