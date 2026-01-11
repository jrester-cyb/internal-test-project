import { Breadcrumbs, Link, Typography } from '@mui/material'
import { Link as RouterLink, useMatches } from 'react-router-dom'

export default function AppBreadcrumbs() {
  const matches = useMatches()

  // Generate breadcrumbs from route handles
  const breadcrumbs = matches
    .filter((match: any) => match.handle?.crumb) // Only routes with crumb handles
    .map((match: any) => {
      const crumb = typeof match.handle.crumb === 'function'
        ? match.handle.crumb(match.data)
        : match.handle.crumb

      return {
        label: crumb,
        path: match.pathname,
      }
    })

  // Don't show breadcrumbs if there's only one or none
  if (breadcrumbs.length <= 1) {
    return null
  }

  return (
    <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
      {breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === breadcrumbs.length - 1

        return isLast ? (
          <Typography key={breadcrumb.path} color="text.primary">
            {breadcrumb.label}
          </Typography>
        ) : (
          <Link
            key={breadcrumb.path}
            component={RouterLink}
            to={breadcrumb.path}
            underline="hover"
            color="inherit"
          >
            {breadcrumb.label}
          </Link>
        )
      })}
    </Breadcrumbs>
  )
}