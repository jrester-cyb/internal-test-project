export interface Organization {
  id: string
  name: string
  description?: string
  created_at?: string
  updated_at?: string
}

export interface Workspace {
  id: string
  name: string
  organization: string
  description?: string
  created_at?: string
  updated_at?: string
}

export interface AssetType {
  id: string
  name: string
  description?: string
}

export interface AssetTypeAttributeChoice {
  id: string
  value: any
  icon?: string
  color?: string
  order: number
}

export interface LinkValue {
  url: string
  text: string
}

export interface AssetTypeAttribute {
  id: string
  name: string
  apiKey: string
  attributeType: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'link'
  isRequired: boolean
  defaultValue?: any
  description?: string
  tags?: string[]
  order: number
  unit?: string
  cannotOverride?: boolean
  lockedToGlobal?: boolean
  assetCountUrl?: string | null
  apiUrl?: string | null
  choices?: AssetTypeAttributeChoice[]
  hasChoices?: boolean  // Indicates if choices exist (for lazy loading)
  // Workspace extension fields
  workspace?: string | null
  workspaceName?: string | null
  organizationId?: string | null
  scope?: 'global' | 'override' | 'local'
  baseAttributeId?: string | null
  isHidden?: boolean
  isOverride?: boolean
}

export interface UnitInfo {
  code: string
  symbol: string
  name: string
  isBase: boolean
}

export interface UnitCategory {
  key: string
  name: string
  baseUnit: string
  units: UnitInfo[]
}

export interface Asset {
  id: string
  name: string
  organization?: string
  organizationName?: string
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
  /** Optional bounding box for client-side clusters [minLon, minLat, maxLon, maxLat] */
  bbox?: [number, number, number, number]
}

export interface SearchFilter {
  type?: string
  field?: string
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
  limit?: number
  offset?: number
}

export interface SearchResponse<T = Asset> {
  results: T[]
  count: number
  limit: number
  offset: number
  next: string | null
  previous: string | null
}
