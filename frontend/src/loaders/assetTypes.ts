import { fetchAssetTypes } from '../api/assets'

export async function assetTypesLoader() {
  const types = await fetchAssetTypes()
  return Array.isArray(types) ? types : types.results || []
}