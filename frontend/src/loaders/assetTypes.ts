import { fetchAssetTypes } from '../api/assets'

export async function assetTypesLoader(workspaceId: string) {
  const types = await fetchAssetTypes(workspaceId)
  return Array.isArray(types) ? types : types.results || []
}