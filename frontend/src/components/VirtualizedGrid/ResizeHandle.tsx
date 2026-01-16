import { useCallback } from 'react'
import { Box } from '@mui/material'

export interface ResizeHandleProps {
  onResizeStart: () => number  // Returns the starting width
  onResize: (newWidth: number) => void
  onResizeEnd: () => void
}

export function ResizeHandle({
  onResizeStart,
  onResize,
  onResizeEnd
}: ResizeHandleProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = onResizeStart()

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      onResize(startWidth + delta)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      onResizeEnd()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [onResizeStart, onResize, onResizeEnd])

  return (
    <Box
      onMouseDown={handleMouseDown}
      sx={{
        position: 'absolute',
        right: -4,  // Center the 8px handle over the 1px border
        top: 0,
        bottom: 0,
        width: 8,
        cursor: 'col-resize',
        zIndex: 3,
      }}
    />
  )
}
