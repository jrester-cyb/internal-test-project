export interface AssetType {
  id: string
  name: string
  description?: string
}

export interface AssetTypeAttributeChoice {
  id: string
  value: any
  label: string
  icon?: string
  color?: string
  order: number
}

export interface AssetTypeAttribute {
  id: string
  name: string
  apiKey: string
  attributeType: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'json'
  isRequired: boolean
  defaultValue?: any
  description?: string
  tags?: string[]
  order: number
  assetCountUrl?: string | null
  apiUrl?: string | null
  choices?: AssetTypeAttributeChoice[]
  // Workspace extension fields
  workspace?: string | null
  workspaceName?: string | null
  organizationId?: string | null
  isExtension?: boolean
  isOverride?: boolean
  baseAttributeId?: string | null
  isHidden?: boolean
}

export interface Asset {
  id: string
  name: string
  assetType: string
  assetTypeName?: string
  parent?: string | null
  h3Index?: string
  geometry: {
    type: string
    coordinates: number[]
  }
  location?: {
    type: string
    coordinates: number[]
  }
  attributes?: Record<string, any>
  createdAt?: string
  updatedAt?: string
  apiUrl?: string
}

export interface Cluster {
  h3Index: string
  count: number
  center: {
    lat: number
    lon: number
  }
}

export interface SearchFilter {
  type?: string
  attribute?: string
  value?: any
  operator?: string
  hash?: string
  neighbors?: boolean
  assetTypeName?: string
  bounds?: number[]
  point?: number[]
  distance?: number
  unit?: string
  geometry?: any
}

export interface SearchRequest {
  logic?: 'AND' | 'OR'
  filters: SearchFilter[]
  page?: number
  limit?: number
}

export interface SearchResponse {
  results: Asset[]
  count: number
  page: number
  limit: number
  total_pages: number
}
