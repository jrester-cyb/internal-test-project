import { memo, useState, useEffect } from "react";
import { Box, Tabs, Tab, Container, Skeleton, Stack } from "@mui/material";
import { Outlet, useLocation, useParams, Link, useMatches, useNavigation } from "react-router-dom";
import {
  preloadAssetTypeAboutPage,
  preloadAssetTypeAttributesPage,
  preloadAssetGridPage,
} from "../utils/preload";

// Map path segments to tab indices
const getTabFromPath = (pathname: string, assetId?: string): number => {
  if (pathname.includes('/about')) return 0
  if (pathname.includes('/assets') || assetId) return 1
  if (pathname.includes('/attributes')) return 2
  return 0
}

// Skeleton for the About page
const AboutSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton variant="text" width="40%" height={40} sx={{ mb: 2 }} />
    <Skeleton variant="text" width="80%" />
    <Skeleton variant="text" width="70%" />
    <Skeleton variant="text" width="75%" />
    <Box sx={{ mt: 4 }}>
      <Skeleton variant="text" width="30%" height={32} sx={{ mb: 1 }} />
      <Skeleton variant="rectangular" height={120} />
    </Box>
  </Box>
)

// Skeleton for the Assets list page
const AssetsSkeleton = () => (
  <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
      <Skeleton variant="rectangular" width={300} height={40} />
      <Skeleton variant="rectangular" width={100} height={40} />
    </Stack>
    <Box sx={{ flex: 1 }}>
      {[...Array(8)].map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={52} sx={{ mb: 1 }} />
      ))}
    </Box>
  </Box>
)

// Skeleton for the Attributes page
const AttributesSkeleton = () => (
  <Box sx={{ p: 2, display: 'flex', height: '100%', gap: 2 }}>
    {/* Left panel - list */}
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Skeleton variant="rectangular" height={40} sx={{ mb: 2 }} />
      {[...Array(10)].map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={56} sx={{ mb: 0.5 }} />
      ))}
    </Box>
    {/* Right panel - details */}
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Skeleton variant="text" width="50%" height={32} sx={{ mb: 2 }} />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="70%" />
      <Box sx={{ mt: 3 }}>
        <Skeleton variant="text" width="40%" height={28} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={100} />
      </Box>
    </Box>
  </Box>
)

// Memoized tab bar to prevent unnecessary re-renders
const TabBar = memo(function TabBar({
  currentTab,
  hideNavbar,
  onTabClick
}: {
  currentTab: number
  hideNavbar: boolean
  onTabClick: (tab: number) => void
}) {
  return (
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
        <Tab
          label="About"
          component={Link}
          to="about"
          value={0}
          onMouseEnter={preloadAssetTypeAboutPage}
          onClick={() => onTabClick(0)}
        />
        <Tab
          label="Assets"
          component={Link}
          to="assets"
          value={1}
          onMouseEnter={preloadAssetGridPage}
          onClick={() => onTabClick(1)}
        />
        <Tab
          label="Attributes"
          component={Link}
          to="attributes"
          value={2}
          onMouseEnter={preloadAssetTypeAttributesPage}
          onClick={() => onTabClick(2)}
        />
      </Tabs>
    </Box>
  );
});

// Get the appropriate skeleton based on tab
const getSkeletonForTab = (tab: number) => {
  switch (tab) {
    case 0: return <AboutSkeleton />
    case 1: return <AssetsSkeleton />
    case 2: return <AttributesSkeleton />
    default: return <AboutSkeleton />
  }
}

export default function AssetTypeLayout() {
  const location = useLocation()
  const params = useParams()
  const matches = useMatches()
  const navigation = useNavigation()

  const currentRouteHidesNavbar = matches.some(match => (match.handle as any)?.hideNavbar);

  // Check if we're navigating to a route that should show the navbar
  // (i.e., navigating away from asset detail back to a tab)
  const pendingLocation = navigation.state === 'loading' ? navigation.location : null
  const pendingShowsNavbar = pendingLocation
    ? ['about', 'assets', 'attributes'].some(segment =>
        pendingLocation.pathname.endsWith(`/${segment}`) || pendingLocation.pathname.includes(`/${segment}/`)
      ) && !pendingLocation.pathname.match(/\/assets\/[^/]+$/) // Not an asset detail page
    : false

  // Show navbar if current route shows it OR if navigating to a route that shows it
  const hideNavbar = currentRouteHidesNavbar && !pendingShowsNavbar

  // Track selected tab locally for instant visual feedback
  const [selectedTab, setSelectedTab] = useState(() => getTabFromPath(location.pathname, params.assetId))

  // Sync with actual route when navigation completes (handles browser back/forward)
  useEffect(() => {
    setSelectedTab(getTabFromPath(location.pathname, params.assetId))
  }, [location.pathname, params.assetId])

  // Show skeleton when navigating to a new route
  const isNavigating = navigation.state === 'loading'

  return (
    <Container maxWidth={false} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TabBar currentTab={selectedTab} hideNavbar={hideNavbar} onTabClick={setSelectedTab} />
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isNavigating ? (
          <Box sx={{ flexGrow: 1, bgcolor: 'background.paper', borderRadius: 1, m: 2, overflow: 'hidden' }}>
            {getSkeletonForTab(selectedTab)}
          </Box>
        ) : (
          <Outlet />
        )}
      </Box>
    </Container>
  );
}
