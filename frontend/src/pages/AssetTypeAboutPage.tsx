// Setup a page for the about page
import { Box, Typography } from '@mui/material';

export default function AssetTypeAboutPage() {
  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        About Asset Types
      </Typography>
      <Typography variant="body1">
        Asset Types represent different categories of assets within the Asset Visualizer application. Each asset type can have its own unique attributes and characteristics. This page provides information about the selected asset type.
      </Typography>
    </Box>
  );
}