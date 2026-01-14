import { useState, useLayoutEffect, useRef } from 'react'
import { Box, Typography, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button, type TypographyProps } from '@mui/material'
import { ContentCopy } from '@mui/icons-material'

interface TruncatedTextProps extends Omit<TypographyProps, 'children'> {
  children: string
  maxLines?: number
  title?: string
  showCopy?: boolean
}

export default function TruncatedText({ children, maxLines = 3, title = 'Full Text', showCopy = true, sx, ...typographyProps }: TruncatedTextProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useLayoutEffect(() => {
    const el = textRef.current
    if (el) {
      setIsOverflowing(el.scrollHeight > el.clientHeight)
    } else {
      setIsOverflowing(false)
    }
  }, [children])

  return (
    <>
      <Box
        sx={{
          '& .copy-button': { opacity: 0 },
          '&:hover .copy-button': { opacity: 0.7 },
        }}
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <Typography
            ref={textRef}
            sx={{
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: 'vertical',
              textOverflow: 'ellipsis',
              ...sx
            }}
            {...typographyProps}
          >
            {children}
          </Typography>
          {showCopy && (
            <Tooltip title="Copy" arrow>
              <IconButton
                className="copy-button"
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(children)
                }}
                sx={{
                  p: 0.25,
                  flexShrink: 0,
                  color: 'inherit',
                  '&:hover': { opacity: 1 },
                }}
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {isOverflowing && (
          <Typography
            component="span"
            onClick={() => setModalOpen(true)}
            sx={{
              color: 'primary.main',
              cursor: 'pointer',
              fontSize: '0.875rem',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            (See full text)
          </Typography>
        )}
      </Box>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ position: 'sticky', top: 0, bgcolor: 'background.paper' }}>
          {title}
        </DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>
            {children}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
