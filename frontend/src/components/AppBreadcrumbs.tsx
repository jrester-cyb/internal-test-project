import { Breadcrumbs, Link, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useMatches } from 'react-router-dom'

export default function AppBreadcrumbs() {
  const matches = useMatches();
  const location = useLocation();

  // Generate breadcrumbs from route handles
  const breadcrumbs = matches
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

  // Don't show breadcrumbs if there are none
  if (breadcrumbs.length === 0) {
    return null
  }

  return (
    <Breadcrumbs
      aria-label="breadcrumb"
      separator=">"
      sx={{ mb: 2, fontSize: '0.875rem' }}
    >
      {breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === breadcrumbs.length - 1

        return isLast ? (
          <Typography key={breadcrumb.path} color="text.primary" sx={{ fontSize: 'inherit' }}>
            {breadcrumb.label}
          </Typography>
        ) : (
          <Link
            key={breadcrumb.path}
            component={RouterLink}
            to={breadcrumb.path}
            underline="hover"
            color="inherit"
            sx={{ fontSize: 'inherit' }}
          >
            {breadcrumb.label}
          </Link>
        )
      })}
    </Breadcrumbs>
  )
}