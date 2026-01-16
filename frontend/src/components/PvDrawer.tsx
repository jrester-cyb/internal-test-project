import { useEffect, useState, useRef } from 'react'
import { Box, Paper, Slide } from '@mui/material'
import { ChevronRight as ChevronRightIcon, KeyboardArrowDown as ChevronDownIcon } from '@mui/icons-material'
import { useSidebar } from '../contexts/SidebarContext'

interface PvDrawerProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  /** When true, skip the initial slide animation (for pre-selected assets on page load) */
  initiallyOpen?: boolean
}

export default function PvDrawer({ isOpen, onClose, children, initiallyOpen = false }: PvDrawerProps) {
  const { isMobile } = useSidebar()
  const isDraggable = !isMobile

  const [panelWidth, setPanelWidth] = useState(380) // Default width in pixels
  const [isResizing, setIsResizing] = useState(false)
  const [preventClick, setPreventClick] = useState(false)
  const [isSliding, setIsSliding] = useState(false)
  const [slideOffset, setSlideOffset] = useState(0)
  const resizeRef = useRef<HTMLDivElement>(null)

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isDraggable) return
    e.preventDefault()
    setIsResizing(true)
  }

  const handleResizeClick = () => {
    // Don't close if this click was part of a double-click
    if (preventClick) {
      setPreventClick(false)
      return
    }
    onClose()
  }


  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      const minWidth = 380
      if (newWidth < minWidth) {
        if (!isSliding) {
          setIsSliding(true)
        }
        setSlideOffset(minWidth - newWidth)
      } else {
        if (isSliding) {
          setIsSliding(false)
        }
        const clampedWidth = Math.max(minWidth, Math.min(window.innerWidth - 200, newWidth))
        setPanelWidth(clampedWidth)
        localStorage.setItem('assetDetailsPanelWidth', clampedWidth.toString())
      }
    }

    const handleMouseUp = () => {
      if (isSliding) {
        onClose()
      }
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, isSliding, slideOffset, panelWidth, onClose])

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setIsSliding(false)
        setSlideOffset(0)
      }, 350)
    }
  }, [isOpen])

  // Extracted style for Slide component to avoid nested ternary
  let slideStyle: React.CSSProperties | undefined;
  if (isDraggable) {
    slideStyle = isSliding ? { transform: `translateX(${slideOffset}px)`, transition: 'none' } : undefined;
  }

  return (
    <Slide
      direction={isDraggable ? "left" : "up"}
      in={isOpen}
      appear={!initiallyOpen}
      timeout={300}
      style={slideStyle}
    >
      <Paper
        elevation={isDraggable ? 0 : 8}
        sx={{
          pointerEvents: 'auto',
          position: 'fixed',
          top: isDraggable ? 64 : 'auto',
          left: isDraggable ? 'auto' : 0,
          right: 0,
          bottom: isDraggable ? 0 : 56, // Leave 56px for bottom nav on mobile
          width: isDraggable ? `${panelWidth}px` : '100%',
          height: isDraggable ? 'auto' : 'calc(100vh - 112px)', // 56px top + 56px bottom
          zIndex: 1000,
          borderLeft: isDraggable ? 1 : 0,
          borderTop: isDraggable ? 0 : 1,
          borderColor: 'divider',
          borderRadius: isDraggable ? undefined : '16px 16px 0 0', // Rounded top corners on mobile
          display: 'flex',
          flexDirection: isDraggable ? 'row' : 'column',
          transition: isDraggable && !isResizing ? 'width 0.3s ease-in-out' : 'none'
        }}
      >
        {/* Resize Handle */}
        {isDraggable && (
          <Box
            ref={resizeRef}
            onMouseDown={handleResizeStart}
            onClick={handleResizeClick}
            sx={{
              width: '12px',
              cursor: 'pointer',
              backgroundColor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              '&:hover': {
                backgroundColor: 'action.hover',
                '& .resize-dots': {
                  opacity: 0
                },
                '& .close-arrow': {
                  opacity: 1
                }
              }
            }}
          >
            <Box
              className="resize-dots"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
                opacity: 0.6,
                transition: 'opacity 0.2s ease'
              }}
            >
              <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
              <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
              <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
            </Box>

            <ChevronRightIcon
              className="close-arrow"
              sx={{
                position: 'absolute',
                opacity: 0,
                transition: 'opacity 0.2s ease',
                fontSize: 16,
                color: 'text.secondary'
              }}
            />
          </Box>
        )}

        {/* Mobile Close Button */}
        {isMobile && (
          <Box
            onClick={onClose}
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 0.5,
              borderBottom: 1,
              borderColor: 'divider',
              width: '100%',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            <ChevronDownIcon sx={{ fontSize: 24 }} />
          </Box>
        )}

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </Box>
      </Paper>
    </Slide>
  )
}