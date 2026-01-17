import { useEffect, useState, useRef } from 'react'
import { Backdrop, Box, Paper, Slide } from '@mui/material'
import { ChevronRight as ChevronRightIcon, KeyboardArrowDown as ChevronDownIcon } from '@mui/icons-material'
import { useSidebar } from '../contexts/SidebarContext'

interface PvDrawerProps {
  key?: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** When true, skip the initial slide animation (for pre-selected assets on page load) */
  initiallyOpen?: boolean
  /** Whether the drawer can be resized by dragging. Defaults to true. */
  resizable?: boolean
  /** Fixed width as a percentage string (e.g., '25%') or pixel number. Only used when resizable is false. */
  width?: string | number
  /** Whether to show a backdrop overlay when open. Defaults to false. */
  overlay?: boolean
}

// Custom hook for resize logic
function useResize(key: string | undefined, isResizable: boolean, onClose: () => void) {
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(`${key}-pvdrawerWidth`)
    return saved ? Number.parseInt(saved, 10) : 400
  })
  const [isResizing, setIsResizing] = useState(false)
  const [isSliding, setIsSliding] = useState(false)
  const [slideOffset, setSlideOffset] = useState(0)
  const resizeRef = useRef<HTMLDivElement>(null)

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isResizable) return
    e.preventDefault()
    setIsResizing(true)
  }

  const handleResizeClick = () => {
    onClose()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      const minWidth = 420
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
        localStorage.setItem(`${key}-pvdrawerWidth`, clampedWidth.toString())
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
  }, [isResizing, isSliding, slideOffset, panelWidth, onClose, key])

  return { panelWidth, isResizing, isSliding, slideOffset, resizeRef, handleResizeStart, handleResizeClick }
}

// Helper function for drawer width
function getDrawerWidth(isMobile: boolean, resizable: boolean, width: string | number | undefined, panelWidth: number) {
  if (isMobile) return '100%'
  if (!resizable && width) {
    return typeof width === 'string' ? width : `${width}px`
  }
  return `${panelWidth}px`
}

// Helper function for slide style
function getSlideStyle(isMobile: boolean, isSliding: boolean, slideOffset: number) {
  if (isMobile) return undefined
  return isSliding ? { transform: `translateX(${slideOffset}px)`, transition: 'none' } : undefined
}

// Sub-component for desktop handle
function DesktopHandle({ isResizable, resizeRef, handleResizeStart, handleResizeClick }: Readonly<{ isResizable: boolean; resizeRef: React.RefObject<HTMLDivElement>; handleResizeStart: (e: React.MouseEvent) => void; handleResizeClick: () => void }>) {
  return (
    <Box
      ref={resizeRef}
      onMouseDown={isResizable ? handleResizeStart : undefined}
      onClick={handleResizeClick}
      sx={{
        width: '12px',
        cursor: isResizable ? 'ew-resize' : 'pointer',
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
      {isResizable && (
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
      )}

      <ChevronRightIcon
        className="close-arrow"
        sx={{
          position: isResizable ? 'absolute' : 'static',
          opacity: isResizable ? 0 : 0.6,
          transition: 'opacity 0.2s ease',
          fontSize: 16,
          color: 'text.secondary'
        }}
      />
    </Box>
  )
}

// Sub-component for mobile close button
function MobileCloseButton({ onClose }: Readonly<{ onClose: () => void }>) {
  return (
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
  )
}

export default function PvDrawer({ key, open, onClose, children, initiallyOpen = false, resizable = true, width, overlay = false }: Readonly<PvDrawerProps>) {
  const { isMobile } = useSidebar()
  const isResizable = resizable && !isMobile

  const { panelWidth, isResizing, isSliding, slideOffset, resizeRef, handleResizeStart, handleResizeClick } = useResize(key, isResizable, onClose)

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        // Note: isSliding and slideOffset are now in the hook, but this effect can be moved or adjusted
      }, 350)
    }
  }, [open])

  const drawerWidth = getDrawerWidth(isMobile, resizable, width, panelWidth)
  const slideStyle = getSlideStyle(isMobile, isSliding, slideOffset)

  return (
    <>
      {overlay && (
        <Backdrop
          open={open}
          onClick={onClose}
          sx={{ zIndex: 999 }}
          transitionDuration={300}
        />
      )}
      <Slide
        direction={isMobile ? "up" : "left"}
        in={open}
        appear={!initiallyOpen}
        timeout={300}
        style={slideStyle}
      >
        <Paper
          elevation={isMobile ? 8 : 0}
          sx={{
            pointerEvents: 'auto',
            position: 'fixed',
            top: isMobile ? 'auto' : 64,
            left: isMobile ? 0 : 'auto',
            right: 0,
            bottom: isMobile ? 56 : 0,
            width: drawerWidth,
            height: isMobile ? 'calc(100vh - 112px)' : 'auto',
            zIndex: 1000,
            borderLeft: isMobile ? 0 : 1,
            borderTop: isMobile ? 1 : 0,
            borderColor: 'divider',
            borderRadius: isMobile ? '16px 16px 0 0' : undefined,
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            transition: !isMobile && !isResizing ? 'width 0.3s ease-in-out' : 'none'
          }}
        >
          {!isMobile && <DesktopHandle isResizable={isResizable} resizeRef={resizeRef} handleResizeStart={handleResizeStart} handleResizeClick={handleResizeClick} />}
          {isMobile && <MobileCloseButton onClose={onClose} />}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {children}
          </Box>
        </Paper>
      </Slide>
    </>
  )
}