import { authFetchJson } from './authFetch'
import type {
  OrganizationSettings,
  WorkspaceSettings,
  EffectiveTheme,
  Theme,
  ThemeSummary,
  ThemeCustomizations,
} from '@app/types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:80/api/v3'

// ============================================================================
// Organization Settings API
// ============================================================================

export async function fetchOrganizationSettings(
  orgId: string
): Promise<OrganizationSettings> {
  return authFetchJson<OrganizationSettings>(
    `${API_BASE}/organizations/${orgId}/settings/`
  )
}

export async function updateOrganizationSettings(
  orgId: string,
  data: {
    theme?: string | null  // Theme ID
  }
): Promise<OrganizationSettings> {
  return authFetchJson<OrganizationSettings>(
    `${API_BASE}/organizations/${orgId}/settings/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
}

export async function fetchOrganizationTheme(orgId: string): Promise<EffectiveTheme> {
  return authFetchJson<EffectiveTheme>(
    `${API_BASE}/organizations/${orgId}/settings/theme/`
  )
}

export async function fetchOrganizationThemes(orgId: string): Promise<ThemeSummary[]> {
  return authFetchJson<ThemeSummary[]>(
    `${API_BASE}/organizations/${orgId}/settings/themes/`
  )
}

// ============================================================================
// Workspace Settings API
// ============================================================================

export async function fetchWorkspaceSettings(
  orgId: string,
  wsId: string
): Promise<WorkspaceSettings> {
  return authFetchJson<WorkspaceSettings>(
    `${API_BASE}/organizations/${orgId}/workspaces/${wsId}/settings/`
  )
}

export async function updateWorkspaceSettings(
  orgId: string,
  wsId: string,
  data: {
    theme?: string | null  // Theme ID
    inheritTheme?: boolean
  }
): Promise<WorkspaceSettings> {
  return authFetchJson<WorkspaceSettings>(
    `${API_BASE}/organizations/${orgId}/workspaces/${wsId}/settings/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
}

export async function fetchWorkspaceTheme(
  orgId: string,
  wsId: string
): Promise<EffectiveTheme> {
  return authFetchJson<EffectiveTheme>(
    `${API_BASE}/organizations/${orgId}/workspaces/${wsId}/settings/theme/`
  )
}

export async function fetchWorkspaceThemes(
  orgId: string,
  wsId: string
): Promise<ThemeSummary[]> {
  return authFetchJson<ThemeSummary[]>(
    `${API_BASE}/organizations/${orgId}/workspaces/${wsId}/settings/themes/`
  )
}

// ============================================================================
// Themes API (Custom Organization Themes)
// ============================================================================

export async function fetchThemes(orgId: string): Promise<Theme[]> {
  return authFetchJson<Theme[]>(
    `${API_BASE}/organizations/${orgId}/themes/`
  )
}

export async function fetchTheme(
  orgId: string,
  themeId: string
): Promise<Theme> {
  return authFetchJson<Theme>(
    `${API_BASE}/organizations/${orgId}/themes/${themeId}/`
  )
}

export async function createTheme(
  orgId: string,
  data: {
    name: string
    lightCustomizations: ThemeCustomizations
    darkCustomizations: ThemeCustomizations
  }
): Promise<Theme> {
  return authFetchJson<Theme>(
    `${API_BASE}/organizations/${orgId}/themes/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
}

export async function updateTheme(
  orgId: string,
  themeId: string,
  data: {
    name?: string
    lightCustomizations?: ThemeCustomizations
    darkCustomizations?: ThemeCustomizations
  }
): Promise<Theme> {
  return authFetchJson<Theme>(
    `${API_BASE}/organizations/${orgId}/themes/${themeId}/`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
}

export async function deleteTheme(
  orgId: string,
  themeId: string
): Promise<void> {
  await authFetchJson(
    `${API_BASE}/organizations/${orgId}/themes/${themeId}/`,
    {
      method: 'DELETE',
    }
  )
}

// ============================================================================
// Legacy API functions for backwards compatibility
// ============================================================================

// Kept for backwards compatibility - these alias to the new Theme functions
export const fetchSavedThemes = fetchThemes
export const fetchSavedTheme = fetchTheme
export const deleteSavedTheme = deleteTheme

export async function createSavedTheme(
  orgId: string,
  data: {
    name: string
    customizations: ThemeCustomizations
  }
): Promise<Theme> {
  // Convert old format to new format
  return createTheme(orgId, {
    name: data.name,
    lightCustomizations: data.customizations,
    darkCustomizations: {},  // Default to empty dark customizations
  })
}

export async function updateSavedTheme(
  orgId: string,
  themeId: string,
  data: {
    name?: string
    customizations?: ThemeCustomizations
  }
): Promise<Theme> {
  // Convert old format to new format
  return updateTheme(orgId, themeId, {
    name: data.name,
    lightCustomizations: data.customizations,
  })
}
