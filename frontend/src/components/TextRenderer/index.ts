export { default as TextRenderer } from '@app/components/TextRenderer/TextRenderer'
export { default as Editor } from '@app/components/TextRenderer/Editor'
export { TextRendererContext, useTextRenderer } from '@app/components/TextRenderer/context'
export { default as TextRendererToolbar } from '@app/components/TextRenderer/TextRendererToolbar'
export { defaultShortcuts, parseShortcut, matchesShortcut, buildShortcutContext } from '@app/components/TextRenderer/shortcuts'
export type {
  TextRendererProps,
  TextRendererContextValue,
  TextFormatter,
  ToolbarAction,
  HistoryEntry,
  KeyboardShortcut,
  ShortcutContext,
  ShortcutResult,
} from '@app/components/TextRenderer/types'
