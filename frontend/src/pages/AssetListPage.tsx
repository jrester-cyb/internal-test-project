import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Pagination, Stack } from '@mui/material'
import type { Asset, AssetTypeAttribute } from '../types'
import { useLoaderData, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom';

export default function AssetListPage() {
  const data = useLoaderData() as { assets: Asset[], attributes?: AssetTypeAttribute[], count: number, page: number, pageSize: number };
  const assets = data.assets || [];
  const attributes = data.attributes || [];
  const count = data.count || 0;
  const page = data.page || 1;
  const pageSize = data.pageSize || 25;
  const totalPages = Math.ceil(count / pageSize);

  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const handlePageChange = (_event: React.ChangeEvent<unknown>, newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  const formatCoordinates = (location: any) => {
    if (!location || !location.coordinates) {
      return 'N/A'
    }

    const coords = location.coordinates
    // Location is always a Point: [lng, lat]
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
      return `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
    }

    return 'N/A'
  }


  const getAttributeValue = (asset: Asset, apiKey: string) => {
    if (!asset?.attributes?.[apiKey]) {
      return 'N/A'
    }
    const value = asset.attributes[apiKey]
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'grey.50' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" component="h2">Assets</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography color="text.secondary">
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, count)} of {count}
            </Typography>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              color="primary"
              size="small"
            />
          </Stack>
        </Stack>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Coordinates</TableCell>
                {attributes.map(attr => (
                  <TableCell key={attr.id} sx={{ fontWeight: 600 }}>{attr.name}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.map(asset => (
                <TableRow
                  key={asset.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ color: '#000 !important', fontWeight: 600 }}>
                    <Link
                      to={asset.id}
                      state={{
                        ...location.state,
                        assetName: asset.name
                      }}
                    >
                      {asset.name}
                    </Link>
                  </TableCell>
                  {attributes.map(attr => (
                    <TableCell key={attr.id}>
                      {getAttributeValue(asset, attr.apiKey)}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {formatCoordinates(asset.location)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {assets.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No assets found
            </Typography>
          </Box>
        )}
      </Box>
    </Box >
  );
}
