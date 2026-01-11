import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, type Params } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'
import App from './App.tsx'
// Lazy load route components
const AssetTypesPage = lazy(() => import('./pages/AssetTypesPage.tsx'))
const MapPage = lazy(() => import('./pages/MapPage.tsx'))
const AssetListPage = lazy(() => import('./pages/AssetListPage.tsx'))

// Generic lazy loader wrapper
function createLazyLoader(
  importPath: string,
  functionName: string,
  config?: {
    paramExtractor?: (params: Params<string>) => Params<string> | string | undefined,
    transformer?: (data: any, extractedParams?: any) => any,
  }
) {
  return async ({ params }: { params: any }) => {
    const module = await import(importPath)

    // Extract the parameters using the provided extractor function, or pass all params
    const extractedParams = config?.paramExtractor ? config.paramExtractor(params) : params
    const data = await module[functionName](extractedParams)
    return config?.transformer ? config.transformer(data, extractedParams) : data
  }
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    handle: {
      crumb: () => "Home"
    },
    children: [
      {
        index: true,
        element: <Navigate to="/map" replace />,
      },
      {
        path: "map",
        element: <MapPage />,
        handle: {
          crumb: () => "Map"
        },
      },
      {
        path: "assets",
        handle: {
          crumb: () => "Asset Types"
        },
        children: [
          {
            index: true,
            element: < AssetTypesPage />,
            loader: createLazyLoader(
              './api/assets',
              'fetchAssetTypes',
              {
                transformer: (data) => Array.isArray(data) ? data : data.results || []
              }
            ),
          },
          {
            path: ":assetTypeId",
            element: <AssetListPage />,
            handle: {
              crumb: (data: any) => {
                // If we have asset type info in data, use the name, otherwise use ID
                if (data?.assetType?.name) {
                  return data.assetType.name
                }
                return data?.assetTypeId || "Asset Type"
              }
            },
            loader: createLazyLoader(
              './api/assets',
              'fetchAssetsByType',
              {
                paramExtractor: (params) => params.assetTypeId,
                transformer: (data) => {
                  return Array.isArray(data) ? data : data.results || []
                }
              }
            ),
          }
        ]
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
