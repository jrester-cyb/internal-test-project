import { fetchFileTree } from '@app/api/assets'
import { getCachedFetch, cacheKeys } from '@app/utils/prefetchCache'
import type { LoaderFunctionArgs } from 'react-router-dom'

export async function libraryLoader({ params }: LoaderFunctionArgs) {
  const { organizationId, workspaceId, directoryId } = params

  if (!organizationId) {
    throw new Error('Organization ID is required')
  }

  // Use cached fetch - if prefetch was triggered on hover, this returns the in-flight promise
  const key = cacheKeys.library(organizationId, workspaceId, directoryId)
  const fileTree = await getCachedFetch(key, () =>
    fetchFileTree(
      organizationId,
      workspaceId,
      directoryId,
      undefined, // no search
      100, // initial page size
      0 // offset
    )
  )

  return fileTree
}
