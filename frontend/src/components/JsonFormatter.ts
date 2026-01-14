import type { TextFormatter } from './TextRenderer/types'

// Strip JSONC comments (// and /* */) for parsing
// Set preservePositions=true to replace comments with spaces (for error position mapping)
const stripJsonComments = (jsonc: string, preservePositions = false): string => {
  let result = ''
  let i = 0
  let inString = false
  let escaped = false

  while (i < jsonc.length) {
    const char = jsonc[i]
    const nextChar = jsonc[i + 1]

    // Handle string state
    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      i++
      continue
    }

    // Start of string
    if (char === '"') {
      inString = true
      result += char
      i++
      continue
    }

    // Single-line comment
    if (char === '/' && nextChar === '/') {
      // Replace with spaces until end of line (preserve newline)
      while (i < jsonc.length && jsonc[i] !== '\n') {
        result += preservePositions ? ' ' : ''
        i++
      }
      continue
    }

    // Multi-line comment
    if (char === '/' && nextChar === '*') {
      const startIdx = i
      i += 2 // Skip /*
      while (i < jsonc.length && !(jsonc[i] === '*' && jsonc[i + 1] === '/')) {
        i++
      }
      i += 2 // Skip */
      // Replace with spaces/newlines to preserve positions
      if (preservePositions) {
        for (let j = startIdx; j < i; j++) {
          result += jsonc[j] === '\n' ? '\n' : ' '
        }
      }
      continue
    }

    result += char
    i++
  }

  return result
}

// Format JSONC while preserving comments
// Comments are extracted, JSON is formatted, then comments are re-inserted with proper indentation
const formatJsonc = (jsonc: string): string => {
  // Extract comments with their context
  interface CommentInfo {
    type: 'line' | 'block'
    text: string
    lineIndex: number
    isStandalone: boolean // Comment on its own line vs inline
    precedingContent: string // Non-comment content before this on same line
    followingJsonContent: string // The next JSON content after this comment (for standalone)
  }

  const lines = jsonc.split('\n')
  const comments: CommentInfo[] = []
  const cleanLines: string[] = []

  // Parse each line to extract comments
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    let i = 0
    let inString = false
    let escaped = false
    let cleanPart = ''

    while (i < line.length) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (inString) {
        cleanPart += char
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        i++
        continue
      }

      if (char === '"') {
        inString = true
        cleanPart += char
        i++
        continue
      }

      // Single-line comment
      if (char === '/' && nextChar === '/') {
        const commentText = line.substring(i)
        const precedingContent = cleanPart.trim()
        comments.push({
          type: 'line',
          text: commentText.trim(),
          lineIndex,
          isStandalone: precedingContent === '',
          precedingContent,
          followingJsonContent: '' // Will be filled in later
        })
        break // Rest of line is comment
      }

      // Block comment
      if (char === '/' && nextChar === '*') {
        const endIdx = line.indexOf('*/', i + 2)
        if (endIdx !== -1) {
          const commentText = line.substring(i, endIdx + 2)
          const precedingContent = cleanPart.trim()
          const followingContent = line.substring(endIdx + 2).trim()
          comments.push({
            type: 'block',
            text: commentText,
            lineIndex,
            isStandalone: precedingContent === '' && followingContent === '',
            precedingContent,
            followingJsonContent: ''
          })
          i = endIdx + 2
          continue
        } else {
          // Multi-line block comment - find closing across lines
          let blockContent = line.substring(i)
          let endLine = lineIndex
          for (let j = lineIndex + 1; j < lines.length; j++) {
            const closeIdx = lines[j].indexOf('*/')
            if (closeIdx !== -1) {
              blockContent += '\n' + lines[j].substring(0, closeIdx + 2)
              endLine = j
              break
            } else {
              blockContent += '\n' + lines[j]
            }
          }
          const precedingContent = cleanPart.trim()
          comments.push({
            type: 'block',
            text: blockContent,
            lineIndex,
            isStandalone: precedingContent === '',
            precedingContent,
            followingJsonContent: ''
          })
          // Skip lines consumed by block comment
          for (let j = lineIndex; j < endLine; j++) {
            cleanLines.push(cleanPart)
            cleanPart = ''
            lineIndex++
          }
          break
        }
      }

      cleanPart += char
      i++
    }

    cleanLines.push(cleanPart)
  }

  // For standalone comments, find the next line with actual JSON content
  for (const comment of comments) {
    if (comment.isStandalone) {
      // Look forward from this comment's line to find next JSON content
      for (let j = comment.lineIndex + 1; j < lines.length; j++) {
        const lineContent = stripJsonComments(lines[j]).trim()
        if (lineContent && lineContent !== '{' && lineContent !== '[' && lineContent !== '}' && lineContent !== ']' && lineContent !== '},') {
          // Extract the key or value identifier
          const keyMatch = lineContent.match(/"([^"]+)"/)
          if (keyMatch) {
            comment.followingJsonContent = keyMatch[1]
            break
          }
        }
      }
    }
  }

  // Join and parse the clean JSON
  const cleanJson = cleanLines.join('\n')
  const stripped = stripJsonComments(cleanJson)

  if (!stripped.trim()) {
    // Only comments, just normalize indentation
    return comments.map(c => c.text).join('\n')
  }

  let parsed: any
  try {
    parsed = JSON.parse(stripped)
  } catch {
    // Can't parse, return original
    return jsonc
  }

  // Find the first JSON line in original
  const firstJsonLineIdx = lines.findIndex(l => {
    const trimmed = l.trim()
    return trimmed.startsWith('{') || trimmed.startsWith('[')
  })

  // Categorize comments
  const headerComments: CommentInfo[] = []
  const inlineComments: CommentInfo[] = []
  const standaloneBodyComments: CommentInfo[] = []

  for (const comment of comments) {
    if (comment.lineIndex < firstJsonLineIdx || firstJsonLineIdx === -1) {
      headerComments.push(comment)
    } else if (comment.isStandalone) {
      standaloneBodyComments.push(comment)
    } else {
      inlineComments.push(comment)
    }
  }

  // Format JSON
  const formatted = JSON.stringify(parsed, null, 2)
  const formattedLines = formatted.split('\n')

  // Build result
  const resultLines: string[] = []

  // Add header comments
  for (const comment of headerComments) {
    resultLines.push(comment.text)
  }

  // Process formatted lines and insert comments
  for (let i = 0; i < formattedLines.length; i++) {
    const formattedLine = formattedLines[i]
    const formattedTrimmed = formattedLine.trim()
    const indent = formattedLine.match(/^(\s*)/)?.[1] || ''

    // Check for standalone comments that should appear BEFORE this line
    const standaloneToInsert = standaloneBodyComments.filter(c => {
      if (!c.followingJsonContent) return false
      // Check if this formatted line contains the key that follows the comment
      return formattedTrimmed.includes('"' + c.followingJsonContent + '"')
    })

    for (const comment of standaloneToInsert) {
      resultLines.push(indent + comment.text)
      // Remove from array so we don't insert again
      const idx = standaloneBodyComments.indexOf(comment)
      standaloneBodyComments.splice(idx, 1)
    }

    // Find inline comments that match this content
    const matchingInlineComment = inlineComments.find(c => {
      // Match by preceding content (the JSON part before the comment)
      const contentToMatch = c.precedingContent.replace(/,\s*$/, '').trim()
      // Check if this formatted line contains similar content
      return formattedTrimmed.includes(contentToMatch) && contentToMatch.length > 0
    })

    if (matchingInlineComment) {
      // Remove from array so we don't match again
      const idx = inlineComments.indexOf(matchingInlineComment)
      inlineComments.splice(idx, 1)
      // Add line with inline comment
      resultLines.push(formattedLine + ' ' + matchingInlineComment.text)
    } else {
      resultLines.push(formattedLine)
    }
  }

  // Add any remaining standalone body comments at the end (before closing bracket)
  if (standaloneBodyComments.length > 0 && resultLines.length > 1) {
    const lastLine = resultLines.pop()!
    const lastIndent = lastLine.match(/^(\s*)/)?.[1] || ''
    const commentIndent = lastIndent + '  '
    for (const comment of standaloneBodyComments) {
      resultLines.push(commentIndent + comment.text)
    }
    resultLines.push(lastLine)
  }

  return resultLines.join('\n')
}

// Parse JSON error to get position (strips JSONC comments first)
const getJsonErrorPosition = (jsonc: string): { position: number; line: number; message: string } | null => {
  const json = stripJsonComments(jsonc, true) // Preserve positions for accurate error mapping
  // If only comments/whitespace, it's valid (empty)
  if (!json.trim()) return null
  try {
    JSON.parse(json)
    return null
  } catch (e) {
    if (e instanceof SyntaxError) {
      const message = e.message
      // Helper to calculate line number from position
      const getLineFromPos = (pos: number) => {
        let line = 1
        for (let i = 0; i < pos && i < json.length; i++) {
          if (json[i] === '\n') line++
        }
        return line
      }
      // Try to extract position from error message
      // Chrome/V8: "Unexpected token x in JSON at position 123"
      // Firefox: "JSON.parse: unexpected character at line 1 column 2"
      const posMatch = message.match(/position\s+(\d+)/i)
      if (posMatch) {
        const position = parseInt(posMatch[1], 10)
        return { position, line: getLineFromPos(position), message }
      }
      // Firefox format - convert line/column to position
      const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i)
      if (lineColMatch) {
        const line = parseInt(lineColMatch[1], 10)
        const col = parseInt(lineColMatch[2], 10)
        const lines = json.split('\n')
        let pos = 0
        for (let i = 0; i < line - 1 && i < lines.length; i++) {
          pos += lines[i].length + 1
        }
        pos += col - 1
        return { position: pos, line, message }
      }
      // If we can't find position, return end of string
      const position = json.length
      return { position, line: getLineFromPos(position), message }
    }
    return null
  }
}

// Simple syntax highlighting for JSON with optional error squiggle
const highlightJson = (json: string, isDark: boolean, errorPos: number | null = null): string => {
  // Escape HTML first
  const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Theme-aware colors
  const colors = isDark
    ? { key: '#9cdcfe', string: '#ce9178', number: '#b5cea8', keyword: '#569cd6', comment: '#6a9955' }
    : { key: '#0451a5', string: '#a31515', number: '#098658', keyword: '#0000ff', comment: '#008000' }

  // First highlight comments (before other syntax to avoid conflicts)
  let highlighted = escaped
    // Single-line comments
    .replace(/(\/\/.*?)$/gm, `<span style="color: ${colors.comment}; font-style: italic">$1</span>`)
    // Multi-line comments
    .replace(/(\/\*[\s\S]*?\*\/)/g, `<span style="color: ${colors.comment}; font-style: italic">$1</span>`)

  // Apply syntax highlighting (only to non-comment parts)
  highlighted = highlighted
    .replace(/"([^"]+)":/g, `<span style="color: ${colors.key}">"$1"</span>:`)
    .replace(/: "([^"]*)"/g, `: <span style="color: ${colors.string}">"$1"</span>`)
    .replace(/: (-?\d+\.?\d*)/g, `: <span style="color: ${colors.number}">$1</span>`)
    .replace(/: (true|false)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
    .replace(/: (null)/g, `: <span style="color: ${colors.keyword}">$1</span>`)

  // Add error squiggle if there's an error position
  if (errorPos !== null && errorPos >= 0) {
    const errorColor = isDark ? '#f44336' : '#d32f2f'
    const squiggleStyle = `text-decoration: wavy underline ${errorColor}; text-decoration-skip-ink: none;`

    // Find the line containing the error
    const lines = json.split('\n')
    let lineStart = 0
    let errorLineIdx = 0

    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lineStart + lines[i].length
      if (errorPos <= lineEnd) {
        errorLineIdx = i
        break
      }
      lineStart += lines[i].length + 1 // +1 for newline
    }

    // Squiggle from error position to end of line
    const start = errorPos
    const end = lineStart + lines[errorLineIdx].length

    // If error is at very end or past line, squiggle the whole line
    const actualStart = (start >= end) ? lineStart : start
    const actualEnd = Math.max(actualStart + 1, end)

    // Re-process from escaped text to insert squiggle
    const escapedChars = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Calculate new positions accounting for escape sequences
    let escapedStart = 0
    let escapedEnd = 0
    let origIdx = 0
    for (let i = 0; i < escapedChars.length && origIdx <= actualEnd; i++) {
      if (origIdx === actualStart) escapedStart = i
      if (origIdx === actualEnd) {
        escapedEnd = i
        break
      }
      // Check if we're at an escape sequence
      if (escapedChars.substring(i, i + 5) === '&amp;') {
        origIdx++
        i += 4
      } else if (escapedChars.substring(i, i + 4) === '&lt;' || escapedChars.substring(i, i + 4) === '&gt;') {
        origIdx++
        i += 3
      } else {
        origIdx++
      }
    }
    if (escapedEnd === 0) escapedEnd = escapedChars.length

    // Insert squiggle span (before syntax highlighting to avoid breaking spans)
    const beforeError = escapedChars.substring(0, escapedStart)
    const errorText = escapedChars.substring(escapedStart, escapedEnd)
    const afterError = escapedChars.substring(escapedEnd)

    const withSquiggle = beforeError + `<span style="${squiggleStyle}">` + errorText + '</span>' + afterError

    // Now apply syntax highlighting
    highlighted = withSquiggle
      .replace(/"([^"]+)":/g, `<span style="color: ${colors.key}">"$1"</span>:`)
      .replace(/: "([^"]*)"/g, `: <span style="color: ${colors.string}">"$1"</span>`)
      .replace(/: (-?\d+\.?\d*)/g, `: <span style="color: ${colors.number}">$1</span>`)
      .replace(/: (true|false)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
      .replace(/: (null)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
  }

  return highlighted
}

// Find foldable regions (object/array blocks) in JSON text
const findFoldableRegions = (text: string): Map<number, number> => {
  const regions = new Map<number, number>()
  const lines = text.split('\n')

  // Track bracket positions with their line numbers
  interface BracketInfo {
    char: '{' | '['
    line: number
  }
  const stack: BracketInfo[] = []

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    let inString = false
    let escaped = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      // Handle string state
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }

      // Skip comments
      if (char === '/' && line[i + 1] === '/') {
        break // Rest of line is comment
      }
      if (char === '/' && line[i + 1] === '*') {
        // Skip block comment on this line
        const closeIdx = line.indexOf('*/', i + 2)
        if (closeIdx !== -1) {
          i = closeIdx + 1
          continue
        }
        break
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{' || char === '[') {
        stack.push({ char, line: lineIdx })
      } else if (char === '}' || char === ']') {
        // Find matching opening bracket - be lenient and search stack
        const expected = char === '}' ? '{' : '['
        let matchIdx = -1
        for (let j = stack.length - 1; j >= 0; j--) {
          if (stack[j].char === expected) {
            matchIdx = j
            break
          }
        }
        if (matchIdx !== -1) {
          const opening = stack[matchIdx]
          // Remove matched bracket and everything after it
          stack.splice(matchIdx)
          // Only foldable if spans multiple lines
          if (lineIdx > opening.line) {
            regions.set(opening.line, lineIdx)
          }
        }
      }
    }
  }

  return regions
}

// Parse JSON safely
const parseJson = (text: string): any | null => {
  const stripped = stripJsonComments(text)
  if (!stripped.trim()) return null
  try {
    return JSON.parse(stripped)
  } catch {
    return null
  }
}

// Minify JSON
const minifyJson = (text: string): string => {
  const stripped = stripJsonComments(text)
  try {
    const parsed = JSON.parse(stripped)
    return JSON.stringify(parsed)
  } catch {
    return text
  }
}

/**
 * JsonFormatter - A TextFormatter implementation for JSON/JSONC content
 * Provides syntax highlighting, validation, and formatting support
 */
export const JsonFormatter: TextFormatter = {
  id: 'json',

  highlight: highlightJson,

  getErrorPosition: getJsonErrorPosition,

  format: formatJsonc,

  minify: minifyJson,

  stripComments: stripJsonComments,

  parse: parseJson,
}

// Export individual functions for direct use if needed
export {
  stripJsonComments,
  formatJsonc,
  getJsonErrorPosition,
  highlightJson,
}
