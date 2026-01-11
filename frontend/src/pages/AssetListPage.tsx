import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Pagination, Stack, Select, MenuItem, FormControl } from '@mui/material'
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

  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const handlePageChange = (_event: React.ChangeEvent<unknown>, newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  const handlePageSizeChange = (event: any) => {
    const params = new URLSearchParams(searchParams)
    params.set('pageSize', event.target.value.toString())
    params.set('page', '1') // Reset to first page when changing page size
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
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'grey.50' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" component="h2">Assets</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <FormControl size="small">
              <Select
                value={pageSize}
                onChange={handlePageSizeChange}
                sx={{ minWidth: 80 }}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
              </Select>
            </FormControl>
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
        <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>Coordinates</TableCell>
                {attributes.map(attr => (
                  <TableCell key={attr.id} sx={{ fontWeight: 600, minWidth: '120px' }}>{attr.name}</TableCell>
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
                  <TableCell sx={{ color: '#000 !important', fontWeight: 600, minWidth: '150px' }}>
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
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', minWidth: '150px' }}>
                    {formatCoordinates(asset.location)}
                  </TableCell>
                  {attributes.map(attr => (
                    <TableCell key={attr.id} sx={{
                      minWidth: '120px',
                      maxWidth: attr.attributeType === 'json' ? '300px' : 'auto',
                      whiteSpace: attr.attributeType === 'json' ? 'pre-wrap' : 'normal',
                      fontFamily: attr.attributeType === 'json' ? 'monospace' : 'inherit',
                      fontSize: attr.attributeType === 'json' ? '0.75rem' : 'inherit',
                      wordBreak: 'break-word'
                    }}>
                      {getAttributeValue(asset, attr.apiKey)}
                    </TableCell>
                  ))}
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
