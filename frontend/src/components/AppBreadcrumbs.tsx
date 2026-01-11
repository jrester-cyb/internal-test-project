import { Breadcrumbs, Link, Typography, CircularProgress, Box } from '@mui/material'
import { Link as RouterLink, useLocation, useMatches } from 'react-router-dom'
import { useEffect, useState } from 'react'

export default function AppBreadcrumbs() {
  const matches = useMatches();
  const location = useLocation();
  const [resolvedLabels, setResolvedLabels] = useState<Record<string, string>>({})

  // Generate breadcrumbs from route handles
  const breadcrumbs = matches
    .filter((match: any) => match.handle?.crumb) // Only routes with crumb handles
    .map((match: any, index: number) => {
      const crumbValue = match.handle.crumb
      const crumbKey = `${match.pathname}-${index}`

      let label: string | Promise<string>

      if (typeof crumbValue === 'function') {
        const result = crumbValue({ crumb: location.state?.breadcrumb, params: match.params })
        label = result
      } else {
        label = crumbValue
      }

      return {
        label,
        path: match.pathname,
        key: crumbKey,
      }
    })

  // Resolve async labels
  useEffect(() => {
    const resolveLabels = async () => {
      const newLabels: Record<string, string> = {}

      for (const breadcrumb of breadcrumbs) {
        if (breadcrumb.label instanceof Promise) {
          try {
            newLabels[breadcrumb.key] = await breadcrumb.label
          } catch (error) {
            console.error('Error resolving breadcrumb:', error)
            newLabels[breadcrumb.key] = 'Error'
          }
        }
      }

      if (Object.keys(newLabels).length > 0) {
        setResolvedLabels(prev => ({ ...prev, ...newLabels }))
      }
    }

    resolveLabels()
  }, [location.pathname, location.state])

  // Don't show breadcrumbs if there's only one or none
  if (breadcrumbs.length <= 1) {
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

        // Determine the display label and loading state
        let displayLabel: string
        let isLoading = false

        if (breadcrumb.label instanceof Promise) {
          displayLabel = resolvedLabels[breadcrumb.key] || ''
          isLoading = !resolvedLabels[breadcrumb.key]
        } else {
          displayLabel = breadcrumb.label
        }

        const content = (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {isLoading && <CircularProgress size={12} />}
            <span>{displayLabel || (isLoading ? 'Loading...' : '')}</span>
          </Box>
        )

        return isLast ? (
          <Typography key={breadcrumb.path} color="text.primary" sx={{ fontSize: 'inherit' }}>
            {content}
          </Typography>
        ) : (
          <Link
            key={breadcrumb.path}
            component={RouterLink}
            to={breadcrumb.path}
            underline="hover"
            color="inherit"
            sx={{ fontSize: 'inherit', display: 'flex', alignItems: 'center' }}
          >
            {content}
          </Link>
        )
      })}
    </Breadcrumbs>
  )
}