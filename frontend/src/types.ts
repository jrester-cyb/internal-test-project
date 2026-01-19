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
  organization?: string
  organizationName?: string
  workspace?: string | null
  workspaceName?: string | null
  minRenderZoom?: number
  maxRenderZoom?: number
  createdAt?: string
  updatedAt?: string
  apiUrl: string
  workspaceCount: number | null
  assetCount: number | null
}

export interface AssetTypeSummary extends Omit<AssetType, 'workspaceCount' | 'assetCount'> {}

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

// Permission & Role types
export type RoleScope = 'instance' | 'organization' | 'workspace'

export interface Permission {
  id: string
  name: string
  codename: string
  description: string
  resourceType: string
  action: string
  createdAt: string
  updatedAt: string
}

export interface Role {
  id: string
  name: string
  description: string
  scope: RoleScope
  permissions: Permission[]
  isSystemRole: boolean
  createdAt: string
  updatedAt: string
}

export interface RoleCreateInput {
  name: string
  description?: string
  scope: RoleScope
  permissionIds?: string[]
}

export interface RoleUpdateInput {
  name?: string
  description?: string
  permissionIds?: string[]
}

// User types
export interface UserGroup {
  id: string
  name: string
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  avatar?: string
  phoneNumber?: string
  isActive: boolean
  isVerified: boolean
  groups: UserGroup[]
  dateJoined: string
  lastLogin?: string
  updatedAt: string
}

export interface UserCreateInput {
  email: string
  password: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  groupIds?: string[]
}

export interface UserUpdateInput {
  email?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  isActive?: boolean
}

// Instance membership types
export interface InstanceMember {
  id: string
  user: string
  userEmail: string
  userName: string
  role: string
  roleName: string
  grantedAt: string
  grantedBy?: string
}

export interface InstanceGroupMember {
  id: string
  group: string
  groupName: string
  role: string
  roleName: string
  grantedAt: string
  grantedBy?: string
}

// Group types
export interface Group {
  id: string
  name: string
  description: string
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface GroupMembership {
  id: string
  group: string
  user: string
  userEmail: string
  userName: string
  addedAt: string
  addedBy?: string
}

export interface GroupCreateInput {
  name: string
  description?: string
}

export interface GroupUpdateInput {
  name?: string
  description?: string
}

// Organization types
export interface OrganizationMember {
  id: string
  organization: string
  user: string
  username: string
  email: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

export interface OrganizationCreateInput {
  name: string
  description?: string
}

export interface OrganizationUpdateInput {
  name?: string
  description?: string
}

// Workspace member types
export interface WorkspaceMember {
  id: string
  workspace: string
  workspaceName: string
  user: string
  userEmail: string
  userName: string
  role: string
  roleName: string
  grantedAt: string
  grantedBy?: string
}

export interface WorkspaceMemberCreateInput {
  workspace: string
  user: string
  role: string
}

// ============================================================================
// Theme Types
// ============================================================================

export interface ThemeColorSet {
  main: string
  light?: string
  dark?: string
}

export interface ThemeCustomizations {
  primary?: ThemeColorSet
  secondary?: ThemeColorSet
  background?: {
    default?: string
    paper?: string
  }
  text?: {
    primary?: string
    secondary?: string
  }
  error?: ThemeColorSet
  warning?: ThemeColorSet
  info?: ThemeColorSet
  success?: ThemeColorSet
  appBar?: {
    background?: string
    text?: string
  }
}

export type ThemePreset = 'light' | 'dark' | 'blue' | 'high-contrast' | 'custom'
export type ThemeType = 'preset' | 'custom'

// A theme record from the backend
export interface Theme {
  id: string
  name: string
  themeType: ThemeType
  lightCustomizations: ThemeCustomizations
  darkCustomizations: ThemeCustomizations
  organization?: string | null
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

// Lightweight theme summary for lists
export interface ThemeSummary {
  id: string
  name: string
  themeType: ThemeType
}

// Effective theme returned by settings endpoints
export interface EffectiveTheme {
  id: string | null
  name: string
  themeType: ThemeType
  lightCustomizations: ThemeCustomizations
  darkCustomizations: ThemeCustomizations
  source?: 'workspace' | 'organization' | 'default'
}

// Legacy ThemeConfig for backwards compatibility with existing components
export interface ThemeConfig {
  preset: ThemePreset
  name?: string
  customizations: ThemeCustomizations
  source?: 'workspace' | 'organization' | 'default'
  savedThemeId?: string
}

// Legacy types for backwards compatibility
export interface SavedTheme {
  id: string
  name: string
  customizations: ThemeCustomizations
  organization?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export interface SavedThemeSummary {
  id: string
  name: string
}

export interface OrganizationSettings {
  id: string
  organization: string
  theme: string | null  // FK to Theme
  effectiveTheme: EffectiveTheme
  themes: ThemeSummary[]  // Available themes (presets + custom)
  createdAt: string
  updatedAt: string
  updatedBy?: string
}

export interface WorkspaceSettings {
  id: string
  workspace: string
  theme: string | null  // FK to Theme
  inheritTheme: boolean
  effectiveTheme: EffectiveTheme
  inheritedFromOrg: EffectiveTheme | null
  themes: ThemeSummary[]  // Available themes (presets + custom)
  createdAt: string
  updatedAt: string
  updatedBy?: string
}
