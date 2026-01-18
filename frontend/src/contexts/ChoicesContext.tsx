import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react'
import type { AssetTypeAttributeChoice } from '@app/types'
import { fetchAssetTypeAttributeChoices } from '@app/api/assets'

interface ChoicesCacheEntry {
  choices: AssetTypeAttributeChoice[]
  loading: boolean
  error?: string
}

interface ChoicesContextValue {
  /**
   * Get choices for an attribute. Returns cached choices if available,
   * or undefined if not yet loaded.
   */
  getChoices: (attributeId: string) => AssetTypeAttributeChoice[] | undefined

  /**
   * Check if choices are currently loading for an attribute.
   */
  isLoading: (attributeId: string) => boolean

  /**
   * Trigger loading choices for an attribute if not already cached/loading.
   * Call this when a cell is focused or needs choices.
   */
  loadChoices: (organizationId: string, workspaceId: string, assetTypeId: string, attributeId: string) => void

  /**
   * Clear all cached choices (e.g., when changing workspace/asset type).
   */
  clearCache: () => void
}

const ChoicesContext = createContext<ChoicesContextValue | null>(null)

export function ChoicesProvider({ children }: { children: ReactNode }) {
  // Using ref for cache to avoid re-renders when cache updates
  const cacheRef = useRef<Map<string, ChoicesCacheEntry>>(new Map())

  // State to trigger re-renders when needed (for components that need choices)
  const [, forceUpdate] = useState(0)

  const getChoices = useCallback((attributeId: string): AssetTypeAttributeChoice[] | undefined => {
    const entry = cacheRef.current.get(attributeId)
    return entry?.choices
  }, [])

  const isLoading = useCallback((attributeId: string): boolean => {
    const entry = cacheRef.current.get(attributeId)
    return entry?.loading ?? false
  }, [])

  const loadChoices = useCallback((organizationId: string, workspaceId: string, assetTypeId: string, attributeId: string) => {
    // Check if already cached or loading
    const existing = cacheRef.current.get(attributeId)
    if (existing) {
      return // Already cached or loading
    }

    // Mark as loading
    cacheRef.current.set(attributeId, { choices: [], loading: true })

    // Fetch choices
    fetchAssetTypeAttributeChoices(organizationId, workspaceId, assetTypeId, attributeId)
      .then((choices) => {
        cacheRef.current.set(attributeId, { choices, loading: false })
        // Trigger re-render for components that need the data
        forceUpdate(n => n + 1)
      })
      .catch((error) => {
        console.error(`Failed to load choices for attribute ${attributeId}:`, error)
        cacheRef.current.set(attributeId, {
          choices: [],
          loading: false,
          error: error.message
        })
        forceUpdate(n => n + 1)
      })
  }, [])

  const clearCache = useCallback(() => {
    cacheRef.current.clear()
    forceUpdate(n => n + 1)
  }, [])

  return (
    <ChoicesContext.Provider value={{ getChoices, isLoading, loadChoices, clearCache }}>
      {children}
    </ChoicesContext.Provider>
  )
}

export function useChoices() {
  const context = useContext(ChoicesContext)
  if (!context) {
    throw new Error('useChoices must be used within a ChoicesProvider')
  }
  return context
}

/**
 * Hook to get choices for an attribute, with lazy loading support.
 * Returns the choices if available, or undefined if loading/not loaded.
 *
 * @param organizationId - Organization ID
 * @param workspaceId - Workspace ID
 * @param assetTypeId - Asset type ID
 * @param attributeId - Attribute ID
 * @param hasChoices - Whether this attribute has choices (from hasChoices field)
 * @param shouldLoad - Whether to trigger loading (e.g., on focus)
 */
export function useAttributeChoices(
  organizationId: string,
  workspaceId: string,
  assetTypeId: string,
  attributeId: string,
  hasChoices: boolean,
  shouldLoad: boolean = false
): AssetTypeAttributeChoice[] | undefined {
  const { getChoices, loadChoices } = useChoices()

  // Trigger load if requested and attribute has choices
  if (shouldLoad && hasChoices) {
    loadChoices(organizationId, workspaceId, assetTypeId, attributeId)
  }

  return getChoices(attributeId)
}
