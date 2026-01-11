export interface AssetType {
  id: string
  name: string
  description?: string
}

export interface AssetTypeAttribute {
  id: string
  name: string
  apiKey: string
  attribute_type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'json'
  is_required: boolean
  default_value?: any
  description?: string
  order: number
}

export interface Asset {
  id: string
  name: string
  assetTypeId: string
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
