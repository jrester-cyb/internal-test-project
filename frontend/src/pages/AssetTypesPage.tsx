import { useLoaderData, useNavigate } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import AssetTypeList from '../components/AssetTypeList'
import type { AssetType } from '../types'

export default function AssetTypesPage() {
  const assetTypes = useLoaderData() as AssetType[]
  const navigate = useNavigate()

  const handleAssetTypeClick = (assetType: AssetType) => {
    navigate(`/assets/${assetType.id}`, {
      state: { assetTypeName: assetType.name }
    })
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Asset Types
      </Typography>
      <AssetTypeList
        assetTypes={assetTypes}
        onAssetTypeClick={handleAssetTypeClick}
      />
    </Box>
  )
}