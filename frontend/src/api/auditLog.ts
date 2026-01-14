const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api'

export interface AuditLogReference {
  id: string
  content_type: number
  content_type_name: string
  object_id: string
  object_repr: string
  role: string
}

export interface AuditLogEntry {
  type: 'entry'
  id: string
  action: string
  action_detail?: string
  message?: string
  target_type?: string
  target_object_id?: string
  target_repr?: string
  changes?: Record<string, any>
  metadata?: Record<string, any>
  references?: AuditLogReference[]
  created_at: string
  user_id?: string
  username?: string
  user_email?: string
  request_method?: string
  request_path?: string
  source?: string
  organization_id?: string
  organization_name?: string
  workspace_id?: string
  workspace_name?: string
}

export interface AuditLogGroup {
  type: 'group'
  group: {
    id: string
    description?: string
    source_type?: string
    source_name?: string
    metadata?: Record<string, any>
    created_at: string
  }
  entries: Omit<AuditLogEntry, 'type'>[]
  created_at: string
  user_id?: string
  username?: string
  user_email?: string
  request_method?: string
  request_path?: string
  source?: string
  organization_id?: string
  organization_name?: string
  workspace_id?: string
  workspace_name?: string
}

export type AuditLogItem = AuditLogEntry | AuditLogGroup

export interface AuditLogResponse {
  count: number
  next: string | null
  previous: string | null
  results: AuditLogItem[]
}

export interface AuditLogFilters {
  target_type?: string
  target_id?: string
  object_type?: string
  object_id?: string
  target_only?: boolean
  action?: string
  user_id?: string
  workspace_id?: string
  organization_id?: string
  start_date?: string
  end_date?: string
  ordering?: string
  page?: number
  page_size?: number
}

export async function fetchAuditLogEntries(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
  const params = new URLSearchParams()
  
  if (filters.target_type) params.append('target_type', filters.target_type)
  if (filters.target_id) params.append('target_id', filters.target_id)
  if (filters.object_type) params.append('object_type', filters.object_type)
  if (filters.object_id) params.append('object_id', filters.object_id)
  if (filters.target_only) params.append('target_only', 'true')
  if (filters.action) params.append('action', filters.action)
  if (filters.user_id) params.append('user_id', filters.user_id)
  if (filters.workspace_id) params.append('workspace_id', filters.workspace_id)
  if (filters.organization_id) params.append('organization_id', filters.organization_id)
  if (filters.start_date) params.append('start_date', filters.start_date)
  if (filters.end_date) params.append('end_date', filters.end_date)
  if (filters.ordering) params.append('ordering', filters.ordering)
  if (filters.page) params.append('page', filters.page.toString())
  if (filters.page_size) params.append('page_size', filters.page_size.toString())
  
  const url = `${API_BASE}/audit/entries/?${params}`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error('Failed to fetch audit log entries')
  }
  
  return response.json()
}

export async function fetchAssetAuditLog(assetId: string, pageSize: number = 10): Promise<AuditLogResponse> {
  return fetchAuditLogEntries({
    object_type: 'assets.asset',
    object_id: assetId,
    ordering: '-created_at',
    page_size: pageSize,
  })
}

export async function fetchAssetTypeAuditLog(assetTypeId: string, workspaceId?: string, pageSize: number = 10): Promise<AuditLogResponse> {
  return fetchAuditLogEntries({
    object_type: 'assets.assettype',
    object_id: assetTypeId,
    workspace_id: workspaceId,
    ordering: '-created_at',
    page_size: pageSize,
  })
}

export async function fetchAttributeAuditLog(attributeId: string, workspaceId?: string, pageSize: number = 10): Promise<AuditLogResponse> {
  // Fetch entries where the attribute is either the target or referenced
  // The attribute could be logged as any of the polymorphic subclasses
  return fetchAuditLogEntries({
    object_id: attributeId,
    workspace_id: workspaceId,
    ordering: '-created_at',
    page_size: pageSize,
  })
}
