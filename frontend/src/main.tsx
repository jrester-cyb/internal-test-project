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
const AssetDetailPage = lazy(() => import('./pages/AssetDetailPage.tsx'))
const AssetTypeLayout = lazy(() => import('./pages/AssetTypeLayout.tsx'))
const AssetTypeAboutPage = lazy(() => import('./pages/AssetTypeAboutPage.tsx'))

// Generic lazy loader wrapper
function createLazyLoader(
  importPath: string,
  functionName: string,
  config?: {
    paramExtractor?: (params: Params<string>) => Params<string> | string | undefined,
    transformer?: (data: any, extractedParams?: any, request?: any) => any,
  }
) {
  return async ({ params }: { params: any; request: any }) => {
    const module = await import(importPath);
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
    children: [
      {
        index: true,
        element: <Navigate to="/map" replace />,
      },
      {
        path: "map",
        element: <MapPage />,
        handle: {
          crumb: "Map"
        },
      },
      {
        path: "asset-types",
        handle: {
          crumb: "Asset Types"
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
            handle: {
              crumb: async ({ crumb, params }) => {
                // If assetTypeName was provided in state, use it
                // Otherwise we will fetch the asset type to get its name

                return crumb?.assetTypeName ?? await import('./api/assets').then(async (module) => {
                  const assetTypes = await module.fetchAssetTypes()
                  const assetsArray = Array.isArray(assetTypes) ? assetTypes : assetTypes.results || []
                  const assetType = assetsArray.find((at: any) => at.id == params.assetTypeId)
                  return assetType ? assetType.name : 'Assets'
                })
              }
            },
            element: <AssetTypeLayout />,
            children: [
              {
                index: true,
                element: <Navigate to="about" />,
              },
              {
                path: "about",
                element: <AssetTypeAboutPage />,
                handle: {
                  crumb: "About"
                }
              },
              {
                path: 'assets',
                element: <AssetListPage />,
                handle: {
                  crumb: "Assets"
                },
                loader: createLazyLoader(
                  './api/assets',
                  'fetchAssetsByType',
                  {
                    paramExtractor: (params) => params.assetTypeId,
                    transformer: async (data) => {
                      const assets = Array.isArray(data) ? data : data.results || []
                      return { assets };
                    }
                  }
                ),
              },
              {
                path: ":assetId",
                element: <AssetDetailPage />,
                handle: {
                  crumb: async ({ crumb, params }) => {
                    // If assetName was provided in state, use it
                    // Otherwise we will fetch the asset to get its name
                    return crumb?.assetName ?? await import('./api/assets').then(async (module) => {
                      const asset = await module.fetchAsset(params.assetId)
                      return asset ? asset.name : 'Asset Detail'
                    })
                  }
                },
                loader: createLazyLoader(
                  './api/assets',
                  'fetchAsset',
                  {
                    paramExtractor: (params) => params.assetId,
                  }
                ),
              }
            ]
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
