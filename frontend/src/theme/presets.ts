import type { ThemeCustomizations, ThemePreset } from '@app/types'

/**
 * Predefined theme presets.
 * Each preset provides a complete color scheme that can be customized.
 */
export const PRESET_THEMES: Record<ThemePreset, ThemeCustomizations> = {
  light: {
    primary: { main: '#003162', light: '#42a5f5', dark: '#1565c0' },
    secondary: { main: '#fecf18', light: '#fed54a', dark: '#cab210' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
    text: { primary: '#212121', secondary: '#757575' },
    appBar: { background: '#003162', text: '#ffffff' },
  },
  dark: {
    primary: { main: '#003162', light: '#42a5f5', dark: '#1565c0' },
    secondary: { main: '#fecf18', light: '#fed54a', dark: '#cab210' },
    background: { default: '#3a3a3a', paper: '#4a4a4a' },
    text: { primary: '#ffffff', secondary: '#b0b0b0' },
    appBar: { background: '#1a1a1a', text: '#ffffff' },
  },
  blue: {
    primary: { main: '#1976d2', light: '#42a5f5', dark: '#1565c0' },
    secondary: { main: '#ff9800', light: '#ffb74d', dark: '#f57c00' },
    background: { default: '#e3f2fd', paper: '#ffffff' },
    text: { primary: '#0d47a1', secondary: '#1565c0' },
    appBar: { background: '#1976d2', text: '#ffffff' },
  },
  'high-contrast': {
    primary: { main: '#000000', light: '#333333', dark: '#000000' },
    secondary: { main: '#ffff00', light: '#ffff66', dark: '#cccc00' },
    background: { default: '#ffffff', paper: '#ffffff' },
    text: { primary: '#000000', secondary: '#333333' },
    error: { main: '#ff0000' },
    warning: { main: '#ff8c00' },
    success: { main: '#008000' },
    appBar: { background: '#000000', text: '#ffffff' },
  },
  custom: {
    // Custom starts with light theme as base
    primary: { main: '#003162', light: '#42a5f5', dark: '#1565c0' },
    secondary: { main: '#fecf18', light: '#fed54a', dark: '#cab210' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
    text: { primary: '#212121', secondary: '#757575' },
    appBar: { background: '#003162', text: '#ffffff' },
  },
}

/**
 * Get the base theme customizations for a preset.
 */
export function getPresetTheme(preset: ThemePreset): ThemeCustomizations {
  return PRESET_THEMES[preset] || PRESET_THEMES.light
}

/**
 * Deep merge theme customizations, with overrides taking precedence.
 */
export function mergeThemeCustomizations(
  base: ThemeCustomizations,
  overrides: ThemeCustomizations
): ThemeCustomizations {
  const merged: ThemeCustomizations = {}

  // Get all keys from both objects
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(overrides),
  ]) as Set<keyof ThemeCustomizations>

  for (const key of allKeys) {
    const baseValue = base[key]
    const overrideValue = overrides[key]

    if (overrideValue === undefined) {
      // No override, use base
      if (baseValue !== undefined) {
        merged[key] = baseValue as any
      }
    } else if (baseValue === undefined) {
      // No base, use override
      merged[key] = overrideValue as any
    } else if (typeof baseValue === 'object' && typeof overrideValue === 'object') {
      // Both are objects, merge them
      merged[key] = { ...baseValue, ...overrideValue } as any
    } else {
      // Override wins
      merged[key] = overrideValue as any
    }
  }

  return merged
}

/**
 * List of preset names for UI display.
 */
export const PRESET_NAMES: { value: ThemePreset; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'blue', label: 'Blue' },
  { value: 'high-contrast', label: 'High Contrast' },
  { value: 'custom', label: 'Custom' },
]
