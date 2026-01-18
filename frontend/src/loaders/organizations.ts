import { fetchOrganizations } from '@app/api/assets'
import type { Organization } from '@app/types'

export async function organizationsLoader() {
  const data = await fetchOrganizations()
  const organizations: Organization[] = Array.isArray(data) ? data : data.results || []
  return { organizations }
}
