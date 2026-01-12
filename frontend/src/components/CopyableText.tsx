import { Box, IconButton, Tooltip, Typography, type TypographyProps } from '@mui/material'
import { ContentCopy as CopyIcon } from '@mui/icons-material'

interface CopyableTextProps extends Omit<TypographyProps, 'children'> {
  children: string
  iconSize?: 'small' | 'inherit'
  iconColor?: string
}

export default function CopyableText({
  children,
  iconSize = 'small',
  iconColor,
  sx,
  ...typographyProps
}: CopyableTextProps) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        '& .copy-button': { opacity: 0 },
        '&:hover .copy-button': { opacity: 0.7 },
      }}
    >
      <Typography sx={sx} {...typographyProps}>
        {children}
      </Typography>
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
            color: iconColor || 'inherit',
            '&:hover': { opacity: 1 },
          }}
        >
          <CopyIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
