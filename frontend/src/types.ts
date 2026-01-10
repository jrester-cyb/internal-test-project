export interface Asset {
  id: string
  name: string
  assetTypeId: string
  geohash: string
  geometry: {
    type: string
    coordinates: number[]
  }
  attributes?: Record<string, any>
}

export interface Cluster {
  geohash: string
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
