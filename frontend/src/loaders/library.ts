import { fetchFileTree } from '@app/api/assets'
import type { LoaderFunctionArgs } from 'react-router-dom'

export async function libraryLoader({ params }: LoaderFunctionArgs) {
  const { organizationId, workspaceId, directoryId } = params

  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  // Fetch the initial file tree for the current directory
  const fileTree = await fetchFileTree(
    organizationId,
    workspaceId,
    directoryId,
    undefined, // no search
    100, // initial page size
    0 // offset
  )

  return fileTree
}
