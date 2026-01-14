import { Box, alpha, useTheme } from '@mui/material'

interface LineNumbersProps {
  scrollTop: number
  lineCount: number
}

export default function LineNumbers({ scrollTop, lineCount }: LineNumbersProps) {
  const theme = useTheme()

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 28,
        height: '100%',
        bgcolor: alpha(theme.palette.background.default, 0.8),
        borderRight: 1,
        borderColor: 'divider',
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        lineHeight: 1.5,
        color: 'text.secondary',
        userSelect: 'none',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      <Box
        sx={{
          pt: 1.5,
          px: 0.5,
          textAlign: 'right',
          transform: `translateY(${-scrollTop}px)`,
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i + 1}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {i + 1}
          </div>
        ))}
      </Box>
    </Box>
  )
}
