import { fetchWorkspaces } from '@app/api/assets'
import { redirect } from 'react-router-dom'
import type { LoaderFunctionArgs } from 'react-router-dom'

export async function workspacesLoader({ params }: LoaderFunctionArgs) {
  const { organizationId } = params
  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  const data = await fetchWorkspaces(organizationId)
  const workspaces = Array.isArray(data) ? data : data.results || []

  return { workspaces, organizationId }
}

// Loader for the organization index route - redirects to map
export async function organizationIndexLoader({ params }: LoaderFunctionArgs) {
  const { organizationId } = params
  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  // Check for saved workspace in localStorage
  const savedWorkspaceId = localStorage.getItem(`activeWorkspaceId_${organizationId}`)

  if (savedWorkspaceId) {
    // Redirect to workspace map
    return redirect(`/organizations/${organizationId}/workspaces/${savedWorkspaceId}/map`)
  }

  // Redirect to org-level map
  return redirect(`/organizations/${organizationId}/map`)
}
