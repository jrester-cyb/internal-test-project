import { Box, Typography, Card, CardContent, Chip, Button, Tooltip, Container } from '@mui/material'
import { Place as PlaceIcon, Category as CategoryIcon, Public as PublicIcon } from '@mui/icons-material'
import type { Asset } from '../types'
import ActionButtons from './ActionButtons'

interface AssetOverviewCardProps {
  asset: Asset
  globalValuesOnly: boolean
  onGlobalValuesToggle: () => void
  actions: any[]
  containerWidth: number
  menuAnchorEl: HTMLElement | null
  setMenuAnchorEl: (el: HTMLElement | null) => void
  containerRef?: React.RefObject<HTMLDivElement>
  actionsRef?: React.RefObject<HTMLDivElement>
  leftContentRef?: React.RefObject<HTMLDivElement>
}

export default function AssetOverviewCard({
  asset,
  globalValuesOnly,
  onGlobalValuesToggle,
  actions,
  containerWidth,
  menuAnchorEl,
  setMenuAnchorEl,
  containerRef,
  actionsRef,
  leftContentRef
}: AssetOverviewCardProps) {
  return (
    <Container maxWidth={false} sx={{ py: 2 }} ref={containerRef}>
      <Card sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0 }} ref={leftContentRef}>
              <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'bold' }}>
                {asset.name}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Chip
                  icon={<CategoryIcon />}
                  label={asset.assetType?.name || 'Unknown Type'}
                  size="small"
                  sx={{
                    bgcolor: 'primary.dark',
                    color: 'primary.contrastText',
                    '& .MuiChip-icon': { color: 'primary.contrastText' }
                  }}
                />
                {asset.location && (
                  <Chip
                    icon={<PlaceIcon />}
                    label={`${asset.location.coordinates[1].toFixed(6)}, ${asset.location.coordinates[0].toFixed(6)}`}
                    size="small"
                    sx={{
                      bgcolor: 'primary.dark',
                      color: 'primary.contrastText',
                      '& .MuiChip-icon': { color: 'primary.contrastText' }
                    }}
                  />
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, color: 'primary.contrastText', alignItems: 'center', flexShrink: 0 }} ref={actionsRef}>
              <Tooltip title={globalValuesOnly ? 'Showing global asset values' : 'Show global asset'} arrow>
                <Button
                  variant={globalValuesOnly ? 'contained' : 'outlined'}
                  size="small"
                  startIcon={<PublicIcon />}
                  onClick={onGlobalValuesToggle}
                  sx={{
                    color: globalValuesOnly ? 'success.contrastText' : 'primary.contrastText',
                    bgcolor: globalValuesOnly ? 'success.main' : 'transparent',
                    borderColor: 'primary.contrastText',
                    '&:hover': {
                      bgcolor: globalValuesOnly ? 'success.dark' : 'rgba(255,255,255,0.1)',
                      borderColor: 'primary.contrastText',
                    },
                  }}
                >
                  Global
                </Button>
              </Tooltip>
              <ActionButtons
                actions={actions}
                width={containerWidth}
                menuAnchorEl={menuAnchorEl}
                setMenuAnchorEl={setMenuAnchorEl}
                size="small"
                iconOnly
              />
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  )
}