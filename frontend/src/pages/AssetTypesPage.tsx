import { useLoaderData, useNavigate, useParams } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import AssetTypeList from '../components/AssetTypeList'
import type { AssetType } from '../types'

export default function AssetTypesPage() {
  const assetTypes = useLoaderData() as AssetType[]
  const navigate = useNavigate()
  const { workspaceId } = useParams()

  const handleAssetTypeClick = (assetType: AssetType) => {
    if (!workspaceId) {
      navigate('/')
      return
    }

    navigate(`/workspaces/${workspaceId}/asset-types/${assetType.id}`, {
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