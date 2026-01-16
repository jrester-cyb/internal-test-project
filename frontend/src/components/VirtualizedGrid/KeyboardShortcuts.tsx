import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

export interface KeyboardAction {
  /** The key to listen for (e.g., 'c', 'Escape', 'ArrowUp') */
  shortcut: string
  /** Modifier keys required */
  meta?: {
    /** Require Ctrl (Windows/Linux) or Cmd (Mac) */
    ctrlOrCmd?: boolean
    /** Require Shift */
    shift?: boolean
    /** Require Alt */
    alt?: boolean
  }
  /** Handler function - return true to prevent default and stop propagation */
  action: (event: KeyboardEvent) => boolean | void
}

export interface KeyboardShortcutsContextValue {
  actions: KeyboardAction[]
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null)

export interface KeyboardShortcutsProviderProps {
  children: ReactNode
  actions: KeyboardAction[]
}

export function KeyboardShortcutsProvider({
  children,
  actions,
}: KeyboardShortcutsProviderProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const { shortcut, meta, action } of actions) {
        if (event.key !== shortcut) continue

        const ctrlOrCmd = event.ctrlKey || event.metaKey

        if (meta?.ctrlOrCmd && !ctrlOrCmd) continue
        if (!meta?.ctrlOrCmd && ctrlOrCmd && shortcut.length === 1) continue

        if (meta?.shift && !event.shiftKey) continue
        if (meta?.alt && !event.altKey) continue

        const result = action(event)
        if (result) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [actions])

  const value = useMemo(() => ({ actions }), [actions])

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  )
}

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue | null {
  return useContext(KeyboardShortcutsContext)
}
