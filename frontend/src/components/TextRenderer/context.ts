import { createContext, useContext } from 'react'
import type { TextRendererContextValue } from './types'

export const TextRendererContext = createContext<TextRendererContextValue | null>(null)

export const useTextRenderer = (): TextRendererContextValue => {
  const context = useContext(TextRendererContext)
  if (!context) {
    throw new Error('useTextRenderer must be used within a TextRendererProvider')
  }
  return context
}
