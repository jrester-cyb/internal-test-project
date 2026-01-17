// Setup a page for the about page
import { useParams } from 'react-router-dom';
import { Box, Typography, Grid } from '@mui/material';
import { AssetTypeAuditLogSection } from '@app/components/AssetAuditLogSection';

export default function AssetTypeAboutPage() {
  const { assetTypeId, workspaceId } = useParams<{ assetTypeId: string; workspaceId: string }>();

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        About Asset Types
      </Typography>
      <Typography variant="body1" sx={{ mb: 3 }}>
        Asset Types represent different categories of assets within the Asset Visualizer application. Each asset type can have its own unique attributes and characteristics. This page provides information about the selected asset type.
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          {assetTypeId && workspaceId && <AssetTypeAuditLogSection assetTypeId={assetTypeId} workspaceId={workspaceId} />}
        </Grid>
      </Grid>
    </Box>
  );
}