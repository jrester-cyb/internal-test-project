import { fetchWorkspaces } from '@app/api/assets'
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
