import { createTheme, type Components, type Theme } from '@mui/material/styles'
import type { ThemeConfig, ThemeCustomizations, EffectiveTheme } from '@app/types'
import { getPresetTheme, mergeThemeCustomizations } from './presets'

/**
 * Check if a hex color is dark (for determining text color).
 */
function isColorDark(hexColor: string): boolean {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.5
}

/**
 * Generate shared component overrides that work with any theme.
 */
function getSharedComponents(): Components<Theme> {
  return {
    MuiLink: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
          textDecorationColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
          '&:hover': {
            color: theme.palette.mode === 'dark' ? theme.palette.secondary.light : theme.palette.primary.main,
            textDecorationColor: theme.palette.mode === 'dark' ? theme.palette.secondary.light : theme.palette.primary.main,
          },
        }),
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focused': {
            color: theme.palette.primary.main,
          },
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: ({ theme }) => ({
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
          },
        }),
        textPrimary: ({ theme }) => ({
          color: theme.palette.primary.main,
          '&:hover': {
            backgroundColor: `rgba(${parseInt(theme.palette.primary.main.slice(1, 3), 16)}, ${parseInt(theme.palette.primary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.primary.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
        outlinedPrimary: ({ theme }) => ({
          color: theme.palette.primary.main,
          borderColor: theme.palette.primary.main,
          '&:hover': {
            borderColor: theme.palette.primary.dark,
            backgroundColor: `rgba(${parseInt(theme.palette.primary.main.slice(1, 3), 16)}, ${parseInt(theme.palette.primary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.primary.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
        outlinedWarning: ({ theme }) => ({
          '&:hover': {
            borderColor: theme.palette.warning.main,
            backgroundColor: `rgba(${parseInt(theme.palette.warning.main.slice(1, 3), 16)}, ${parseInt(theme.palette.warning.main.slice(3, 5), 16)}, ${parseInt(theme.palette.warning.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
        outlinedSuccess: ({ theme }) => ({
          '&:hover': {
            borderColor: theme.palette.success.main,
            backgroundColor: `rgba(${parseInt(theme.palette.success.main.slice(1, 3), 16)}, ${parseInt(theme.palette.success.main.slice(3, 5), 16)}, ${parseInt(theme.palette.success.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
        outlinedInfo: ({ theme }) => ({
          '&:hover': {
            borderColor: theme.palette.info.main,
            backgroundColor: `rgba(${parseInt(theme.palette.info.main.slice(1, 3), 16)}, ${parseInt(theme.palette.info.main.slice(3, 5), 16)}, ${parseInt(theme.palette.info.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
        outlinedError: ({ theme }) => ({
          '&:hover': {
            borderColor: theme.palette.error.main,
            backgroundColor: `rgba(${parseInt(theme.palette.error.main.slice(1, 3), 16)}, ${parseInt(theme.palette.error.main.slice(3, 5), 16)}, ${parseInt(theme.palette.error.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
        containedSuccess: ({ theme }) => ({
          backgroundColor: theme.palette.success.main,
          '&:hover': {
            backgroundColor: theme.palette.success.dark,
          },
        }),
        containedError: ({ theme }) => ({
          backgroundColor: theme.palette.error.main,
          '&:hover': {
            backgroundColor: theme.palette.error.dark,
          },
        }),
        containedInfo: ({ theme }) => ({
          backgroundColor: theme.palette.info.main,
          '&:hover': {
            backgroundColor: theme.palette.info.dark,
          },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        colorPrimary: ({ theme }) => ({
          color: theme.palette.primary.main,
          '&:hover': {
            backgroundColor: `rgba(${parseInt(theme.palette.primary.main.slice(1, 3), 16)}, ${parseInt(theme.palette.primary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.primary.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        colorPrimary: ({ theme }) => ({
          color: theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
        }),
      },
    },
  }
}

/**
 * Get dark mode specific component overrides.
 */
function getDarkModeComponents(): Components<Theme> {
  return {
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: `rgba(${parseInt(theme.palette.secondary.main.slice(1, 3), 16)}, ${parseInt(theme.palette.secondary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.secondary.main.slice(5, 7), 16)}, 0.8)`,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.secondary.light,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.secondary.light,
          },
        }),
      },
    },
  }
}

/**
 * Build a complete MUI theme from a ThemeConfig (legacy).
 */
export function buildMuiTheme(config: ThemeConfig): Theme {
  // Start with the preset base
  const baseCustomizations = getPresetTheme(config.preset)

  // Merge in any custom overrides
  const finalCustomizations = mergeThemeCustomizations(
    baseCustomizations,
    config.customizations || {}
  )

  // Determine if this is a dark theme
  const isDark =
    config.preset === 'dark' ||
    (finalCustomizations.background?.default &&
      isColorDark(finalCustomizations.background.default))

  return buildThemeFromCustomizations(finalCustomizations, isDark)
}

/**
 * Build a complete MUI theme from an EffectiveTheme (new API).
 * @param effectiveTheme - The theme from the backend
 * @param prefersDarkMode - Whether the user prefers dark mode (system preference or user selection)
 */
export function buildMuiThemeFromEffective(
  effectiveTheme: EffectiveTheme,
  prefersDarkMode: boolean
): Theme {
  // Select light or dark customizations based on user preference
  const customizations = prefersDarkMode
    ? effectiveTheme.darkCustomizations
    : effectiveTheme.lightCustomizations

  // If the selected customizations are empty, fallback to the other mode
  const hasCustomizations = customizations && Object.keys(customizations).length > 0
  const fallbackCustomizations = prefersDarkMode
    ? effectiveTheme.lightCustomizations
    : effectiveTheme.darkCustomizations

  const finalCustomizations = hasCustomizations ? customizations : fallbackCustomizations

  return buildThemeFromCustomizations(finalCustomizations || {}, prefersDarkMode)
}

/**
 * Internal function to build MUI theme from customizations.
 */
function buildThemeFromCustomizations(
  customizations: ThemeCustomizations,
  isDark: boolean
): Theme {
  // Build the palette
  const palette: any = {
    mode: isDark ? 'dark' : 'light',
  }

  // Add colors from customizations
  if (customizations.primary) {
    palette.primary = customizations.primary
  }
  if (customizations.secondary) {
    palette.secondary = customizations.secondary
  }
  if (customizations.background) {
    palette.background = customizations.background
  }
  if (customizations.text) {
    palette.text = customizations.text
  }
  if (customizations.error) {
    palette.error = customizations.error
  }
  if (customizations.warning) {
    palette.warning = customizations.warning
  }
  if (customizations.info) {
    palette.info = customizations.info
  }
  if (customizations.success) {
    palette.success = customizations.success
  }

  // Build component overrides
  const sharedComponents = getSharedComponents()
  const components: Components<Theme> = {
    ...sharedComponents,
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: ({ theme }) => ({
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
        }),
      },
    },
    ...(isDark ? getDarkModeComponents() : {}),
  }

  return createTheme({
    palette,
    components,
  })
}

/**
 * Default theme config to use when no settings are available (legacy).
 */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  preset: 'light',
  customizations: {},
  source: 'default',
}

/**
 * Default effective theme to use when no settings are available.
 */
export const DEFAULT_EFFECTIVE_THEME: EffectiveTheme = {
  id: null,
  name: 'Light',
  themeType: 'preset',
  lightCustomizations: {
    primary: { main: '#003162', light: '#42a5f5', dark: '#1565c0' },
    secondary: { main: '#fecf18', light: '#fed54a', dark: '#cab210' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
    text: { primary: '#212121', secondary: '#757575' },
    appBar: { background: '#003162', text: '#ffffff' },
  },
  darkCustomizations: {
    primary: { main: '#42a5f5', light: '#80d6ff', dark: '#0077c2' },
    secondary: { main: '#fecf18', light: '#fed54a', dark: '#cab210' },
    background: { default: '#121212', paper: '#1e1e1e' },
    text: { primary: '#ffffff', secondary: '#b0b0b0' },
    appBar: { background: '#1e1e1e', text: '#ffffff' },
  },
  source: 'default',
}
