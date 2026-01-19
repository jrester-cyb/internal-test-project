import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { EffectiveTheme, ThemeConfig, ThemePreset } from '@app/types'
import {
  buildMuiTheme,
  buildMuiThemeFromEffective,
  DEFAULT_THEME_CONFIG,
  DEFAULT_EFFECTIVE_THEME,
  PRESET_NAMES,
} from '@app/theme'
import { fetchOrganizationTheme, fetchWorkspaceTheme } from '@app/api/settings'

const THEME_CACHE_KEY = 'app_theme_config'
const DARK_MODE_KEY = 'app_dark_mode'
const THEME_CACHE_EXPIRY = 5 * 60 * 1000 // 5 minutes

interface CachedTheme {
  effectiveTheme: EffectiveTheme
  timestamp: number
  orgId?: string
  wsId?: string
}

interface ThemeContextType {
  // New API
  effectiveTheme: EffectiveTheme
  isDarkMode: boolean
  setDarkMode: (dark: boolean) => void
  toggleDarkMode: () => void
  isLoading: boolean
  refreshTheme: (orgId?: string, wsId?: string) => Promise<void>
  syncWithOrganization: (orgId: string, wsId?: string) => void

  // Legacy support for existing components
  themeConfig: ThemeConfig
  setThemeConfig: (config: ThemeConfig) => void
  presetNames: typeof PRESET_NAMES
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: ReactNode
}

/**
 * Load cached theme from localStorage.
 */
function loadCachedTheme(orgId?: string, wsId?: string): EffectiveTheme | null {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY)
    if (!cached) return null

    const parsed: CachedTheme = JSON.parse(cached)
    const isExpired = Date.now() - parsed.timestamp > THEME_CACHE_EXPIRY
    const isSameContext = parsed.orgId === orgId && parsed.wsId === wsId

    if (!isExpired && isSameContext) {
      return parsed.effectiveTheme
    }
  } catch {
    // Invalid cache
  }
  return null
}

/**
 * Save theme config to localStorage cache.
 */
function saveCachedTheme(effectiveTheme: EffectiveTheme, orgId?: string, wsId?: string) {
  const cacheData: CachedTheme = {
    effectiveTheme,
    timestamp: Date.now(),
    orgId,
    wsId,
  }
  localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cacheData))
}

/**
 * Load dark mode preference from localStorage or use system preference.
 */
function loadDarkModePreference(systemPrefersDark: boolean): boolean {
  try {
    const saved = localStorage.getItem(DARK_MODE_KEY)
    if (saved !== null) {
      return JSON.parse(saved)
    }
    // Fall back to legacy darkMode setting
    const legacySaved = localStorage.getItem('darkMode')
    if (legacySaved !== null) {
      return JSON.parse(legacySaved)
    }
  } catch {
    // Invalid saved preference
  }
  return systemPrefersDark
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Track current org/workspace for caching
  const currentOrgId = useRef<string | undefined>()
  const currentWsId = useRef<string | undefined>()

  // Detect system dark mode preference
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)')

  // Dark mode state
  const [isDarkMode, setIsDarkModeState] = useState(() => loadDarkModePreference(systemPrefersDark))

  // Update dark mode when system preference changes (if user hasn't set a preference)
  useEffect(() => {
    const hasUserPreference = localStorage.getItem(DARK_MODE_KEY) !== null
    if (!hasUserPreference) {
      setIsDarkModeState(systemPrefersDark)
    }
  }, [systemPrefersDark])

  const setDarkMode = useCallback((dark: boolean) => {
    setIsDarkModeState(dark)
    localStorage.setItem(DARK_MODE_KEY, JSON.stringify(dark))
    // Also update legacy setting for backwards compatibility
    localStorage.setItem('darkMode', JSON.stringify(dark))
  }, [])

  const toggleDarkMode = useCallback(() => {
    setDarkMode(!isDarkMode)
  }, [isDarkMode, setDarkMode])

  // Effective theme state (new API)
  const [effectiveTheme, setEffectiveThemeState] = useState<EffectiveTheme>(() => {
    return DEFAULT_EFFECTIVE_THEME
  })

  const [isLoading, setIsLoading] = useState(false)

  const refreshTheme = useCallback(async (orgId?: string, wsId?: string) => {
    const targetOrgId = orgId ?? currentOrgId.current
    const targetWsId = wsId ?? currentWsId.current

    if (!targetOrgId) return

    // Clear cache to force fresh fetch
    localStorage.removeItem(THEME_CACHE_KEY)

    setIsLoading(true)
    try {
      let theme: EffectiveTheme

      if (targetWsId) {
        // Fetch workspace theme (includes inheritance logic)
        theme = await fetchWorkspaceTheme(targetOrgId, targetWsId)
      } else {
        // Fetch organization theme
        theme = await fetchOrganizationTheme(targetOrgId)
      }

      setEffectiveThemeState(theme)
      saveCachedTheme(theme, targetOrgId, targetWsId)
    } catch (error) {
      console.error('Failed to fetch theme:', error)
      // Keep current theme on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const syncWithOrganization = useCallback((orgId: string, wsId?: string) => {
    // Check if context actually changed
    if (currentOrgId.current === orgId && currentWsId.current === wsId) {
      return
    }

    currentOrgId.current = orgId
    currentWsId.current = wsId

    // Try to load from cache first
    const cached = loadCachedTheme(orgId, wsId)
    if (cached) {
      setEffectiveThemeState(cached)
      return
    }

    // Fetch from backend
    refreshTheme(orgId, wsId)
  }, [refreshTheme])

  // Build MUI theme from effective theme and dark mode preference
  const muiTheme = useMemo(
    () => buildMuiThemeFromEffective(effectiveTheme, isDarkMode),
    [effectiveTheme, isDarkMode]
  )

  // Legacy support: Convert effective theme to ThemeConfig for older components
  const themeConfig = useMemo((): ThemeConfig => {
    const customizations = isDarkMode
      ? effectiveTheme.darkCustomizations
      : effectiveTheme.lightCustomizations

    return {
      preset: isDarkMode ? 'dark' : 'light',
      name: effectiveTheme.name,
      customizations: customizations || {},
      source: effectiveTheme.source || 'default',
      savedThemeId: effectiveTheme.id || undefined,
    }
  }, [effectiveTheme, isDarkMode])

  const setThemeConfig = useCallback(
    (config: ThemeConfig) => {
      // Convert legacy ThemeConfig update to new format
      // This is primarily used by the ThemeConfigurator component
      const newEffective: EffectiveTheme = {
        id: config.savedThemeId || null,
        name: config.name || config.preset,
        themeType: config.savedThemeId ? 'custom' : 'preset',
        lightCustomizations: config.preset !== 'dark' ? config.customizations : effectiveTheme.lightCustomizations,
        darkCustomizations: config.preset === 'dark' ? config.customizations : effectiveTheme.darkCustomizations,
        source: config.source,
      }
      setEffectiveThemeState(newEffective)
      saveCachedTheme(newEffective, currentOrgId.current, currentWsId.current)
    },
    [effectiveTheme]
  )

  // Legacy toggleTheme (alias for toggleDarkMode)
  const toggleTheme = toggleDarkMode

  const value = useMemo(
    () => ({
      // New API
      effectiveTheme,
      isDarkMode,
      setDarkMode,
      toggleDarkMode,
      isLoading,
      refreshTheme,
      syncWithOrganization,

      // Legacy support
      themeConfig,
      setThemeConfig,
      presetNames: PRESET_NAMES,
      toggleTheme,
    }),
    [
      effectiveTheme,
      isDarkMode,
      setDarkMode,
      toggleDarkMode,
      isLoading,
      refreshTheme,
      syncWithOrganization,
      themeConfig,
      setThemeConfig,
      toggleTheme,
    ]
  )

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  )
}
