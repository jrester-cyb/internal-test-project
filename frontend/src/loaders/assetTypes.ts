import { fetchAssetTypes } from '@app/api/assets'

export async function assetTypesLoader(organizationId: string, workspaceId: string) {
  const types = await fetchAssetTypes(organizationId, workspaceId)
  return Array.isArray(types) ? types : types.results || []
}