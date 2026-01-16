// Preload functions for lazy-loaded page components
// Call these on hover/focus to start loading the JS chunk before navigation

export const preloadAssetTypeAboutPage = () => import('../pages/AssetTypeAboutPage')
export const preloadAssetTypeAttributesPage = () => import('../pages/AssetTypeAttributesPage')
export const preloadAssetListPage = () => import('../pages/AssetListPage')
export const preloadAssetDetailPage = () => import('../pages/AssetDetailPage')
export const preloadMapPage = () => import('../pages/MapPage')
export const preloadLibraryPage = () => import('../pages/LibraryPage')
