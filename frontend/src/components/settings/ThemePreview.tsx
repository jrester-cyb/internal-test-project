import { useMemo } from 'react'
import {
  Box,
  Paper,
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  Chip,
  CircularProgress,
} from '@mui/material'
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import MenuIcon from '@mui/icons-material/Menu'
import NotificationsIcon from '@mui/icons-material/Notifications'
import type { EffectiveTheme } from '@app/types'
import { buildMuiThemeFromEffective } from '@app/theme'

interface ThemePreviewProps {
  effectiveTheme: EffectiveTheme
}

/**
 * Single preview panel for one mode (light or dark)
 */
function PreviewPanel({ effectiveTheme, isDark }: { effectiveTheme: EffectiveTheme; isDark: boolean }) {
  const previewTheme = useMemo(
    () => buildMuiThemeFromEffective(effectiveTheme, isDark),
    [effectiveTheme, isDark]
  )

  return (
    <MuiThemeProvider theme={previewTheme}>
      <Paper
        elevation={3}
        sx={{
          overflow: 'hidden',
          borderRadius: 2,
          flex: 1,
          minWidth: 280,
        }}
      >
        {/* Mode Label */}
        <Box sx={{
          px: 1.5,
          py: 0.5,
          bgcolor: isDark ? 'grey.800' : 'grey.200',
          borderBottom: 1,
          borderColor: 'divider',
        }}>
          <Typography variant="caption" fontWeight="medium" color={isDark ? 'grey.300' : 'grey.700'}>
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </Typography>
        </Box>

        {/* App Bar Preview */}
        <AppBar position="static" color="primary" elevation={0}>
          <Toolbar variant="dense">
            <IconButton edge="start" color="inherit" size="small">
              <MenuIcon fontSize="small" />
            </IconButton>
            <Typography variant="subtitle2" sx={{ flexGrow: 1, ml: 1 }}>
              Preview
            </Typography>
            <IconButton color="inherit" size="small">
              <NotificationsIcon fontSize="small" />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Content Preview */}
        <Box
          sx={{
            p: 2,
            backgroundColor: 'background.default',
            minHeight: 180,
          }}
        >
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" color="text.primary" gutterBottom>
                Sample Card
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This shows how text appears with the theme.
              </Typography>
            </CardContent>
          </Card>

          {/* Form Elements */}
          <Box sx={{ mb: 2 }}>
            <TextField
              label="Sample Input"
              size="small"
              fullWidth
              defaultValue="Sample text"
            />
          </Box>

          {/* Buttons */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Button variant="contained" size="small">
              Primary
            </Button>
            <Button variant="outlined" size="small">
              Outlined
            </Button>
            <Button variant="text" size="small">
              Text
            </Button>
          </Box>

          {/* Status Colors */}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
            <Chip label="Success" color="success" size="small" />
            <Chip label="Warning" color="warning" size="small" />
            <Chip label="Error" color="error" size="small" />
            <Chip label="Info" color="info" size="small" />
          </Box>

          {/* Loading indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              Loading...
            </Typography>
          </Box>
        </Box>
      </Paper>
    </MuiThemeProvider>
  )
}

export function ThemePreview({ effectiveTheme }: ThemePreviewProps) {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <PreviewPanel effectiveTheme={effectiveTheme} isDark={false} />
      <PreviewPanel effectiveTheme={effectiveTheme} isDark={true} />
    </Box>
  )
}
