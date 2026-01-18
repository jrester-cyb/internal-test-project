import { useState, useEffect, useRef } from 'react'
import { Breadcrumbs, Link, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useMatches, useNavigation } from 'react-router-dom'

// Map URL segments to display labels for optimistic updates
const segmentLabels: Record<string, string> = {
  'about': 'About',
  'assets': 'Assets',
  'attributes': 'Attributes',
}

type Breadcrumb = {
  label: string
  path: string
  key: string
}

export default function AppBreadcrumbs() {
  const matches = useMatches();
  const location = useLocation();
  const navigation = useNavigation();

  // Track optimistic breadcrumb truncation when clicking a link
  const [optimisticEndIndex, setOptimisticEndIndex] = useState<number | null>(null)
  // Track the path we clicked to navigate to
  const clickedPathRef = useRef<string | null>(null)

  // Check if we're navigating to a new location
  const pendingLocation = navigation.state === 'loading' ? navigation.location : null

  // Reset optimistic state when navigation completes or location changes
  useEffect(() => {
    if (navigation.state === 'idle') {
      // Only keep the truncation if we actually ended up at the clicked path
      // This handles redirects - if we clicked on a path but got redirected elsewhere,
      // we should show the full breadcrumbs for where we actually landed
      if (clickedPathRef.current && location.pathname !== clickedPathRef.current) {
        setOptimisticEndIndex(null)
      }
      clickedPathRef.current = null
      setOptimisticEndIndex(null)
    }
  }, [navigation.state, location.pathname])

  // Generate breadcrumbs from route handles
  let breadcrumbs: Breadcrumb[] = matches
    .filter((match: any) => match.handle?.crumb) // Only routes with crumb handles
    .map((match: any, index: number) => {
      const crumbValue = match.handle.crumb
      const crumbKey = `${match.pathname}-${index}`

      let label: string

      if (typeof crumbValue === 'function') {
        // Pass both loaderData and params to the crumb function
        label = crumbValue({ loaderData: match.data, params: match.params, crumb: location.state })
      } else {
        label = crumbValue
      }

      return {
        label,
        path: match.pathname,
        key: crumbKey,
      }
    })

  // If navigating, check if we need to update breadcrumbs optimistically
  if (pendingLocation && breadcrumbs.length > 0) {
    const pendingPath = pendingLocation.pathname
    const pendingState = pendingLocation.state as Record<string, any> | null
    const lastSegment = pendingPath.split('/').filter(Boolean).pop()

    // Check if navigating to a known tab segment
    if (lastSegment && segmentLabels[lastSegment]) {
      // Replace or add the last breadcrumb with the pending destination
      const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1]
      const lastCurrentSegment = lastBreadcrumb.path.split('/').filter(Boolean).pop()

      // If the last breadcrumb is one of our tab segments, update it
      if (lastCurrentSegment && segmentLabels[lastCurrentSegment]) {
        breadcrumbs[breadcrumbs.length - 1] = {
          ...lastBreadcrumb,
          label: segmentLabels[lastSegment],
          path: pendingPath,
        }
      }
    }
    // Check if navigating to an asset detail page (has assetName in state)
    else if (pendingState?.assetName) {
      // Add or update the asset breadcrumb
      const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1]

      // If the last breadcrumb is "Assets", add the asset name after it
      if (lastBreadcrumb.label === 'Assets') {
        breadcrumbs.push({
          label: pendingState.assetName,
          path: pendingPath,
          key: `${pendingPath}-pending`,
        })
      }
      // If the last breadcrumb is already an asset (not a known segment), update it
      else if (!segmentLabels[lastBreadcrumb.path.split('/').filter(Boolean).pop() || '']) {
        breadcrumbs[breadcrumbs.length - 1] = {
          ...lastBreadcrumb,
          label: pendingState.assetName,
          path: pendingPath,
        }
      }
    }
  }

  // Apply optimistic truncation when clicking a breadcrumb link
  if (optimisticEndIndex !== null && optimisticEndIndex < breadcrumbs.length) {
    breadcrumbs = breadcrumbs.slice(0, optimisticEndIndex + 1)
  }

  // Don't show breadcrumbs if there are none
  if (breadcrumbs.length === 0) {
    return null
  }

  const handleBreadcrumbClick = (index: number, path: string) => {
    // Immediately truncate breadcrumbs to show only up to the clicked one
    setOptimisticEndIndex(index)
    // Track where we're navigating to detect redirects
    clickedPathRef.current = path
  }

  return (
    <Breadcrumbs
      aria-label="breadcrumb"
      separator=">"
      sx={{ fontSize: '0.875rem' }}
    >
      {breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === breadcrumbs.length - 1

        return isLast ? (
          <Typography key={breadcrumb.key} color="text.primary" sx={{ fontSize: 'inherit' }}>
            {breadcrumb.label}
          </Typography>
        ) : (
          <Link
            key={breadcrumb.key}
            component={RouterLink}
            to={breadcrumb.path}
            underline="hover"
            color="inherit"
            sx={{ fontSize: 'inherit' }}
            onClick={() => handleBreadcrumbClick(index, breadcrumb.path)}
          >
            {breadcrumb.label}
          </Link>
        )
      })}
    </Breadcrumbs>
  )
}