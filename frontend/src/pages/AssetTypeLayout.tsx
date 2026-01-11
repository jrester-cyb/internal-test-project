import { Box, Tabs, Tab, Container } from "@mui/material";
import { Outlet, useLocation, useParams, Link, useMatches } from "react-router-dom";

export default function AssetTypeLayout() {
  const location = useLocation()
  const params = useParams()
  const matches = useMatches();

  const hideNavbar = matches.some(match => match.handle?.hideNavbar);
  // Determine which tab is active based on the current path
  const currentPath = location.pathname
  let currentTab = 0

  if (currentPath.includes('/about')) {
    currentTab = 0
  } else if (currentPath.includes('/assets') || params.assetId) {
    currentTab = 1
  } else if (currentPath.includes('/attributes')) {
    currentTab = 2
  }

  return (
    <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        '& .MuiTabs-indicator': {
          bgcolor: 'secondary.main'
        },
        '& .MuiTab-root': {
          color: '#ffffff',
          '&.Mui-selected': {
            color: '#ffffff'
          }
        },
        display: hideNavbar ? 'none' : 'inherit'
      }}>
        <Tabs
          value={currentTab}
          textColor="inherit"
          sx={{ px: 2 }}
        >
          <Tab label="About" component={Link} to={`/asset-types/${params.assetTypeId}/about`} value={0} />
          <Tab label="Assets" component={Link} to={`/asset-types/${params.assetTypeId}/assets`} value={1} />
          <Tab label="Attributes" component={Link} to={`/asset-types/${params.assetTypeId}/attributes`} value={2} />
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Outlet />
      </Box>
    </Container >
  );
}
