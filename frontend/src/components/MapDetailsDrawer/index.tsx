import type { Asset, AssetTypeAttribute, Cluster } from '../../types'
import ClusterContent from './ClusterContent'
import AssetContent from './AssetContent'

// Cluster details props
interface ClusterDetailsProps {
  type: 'cluster'
  cluster: Cluster
  assets: Asset[]
  loading: boolean
  loadingMore?: boolean
  totalCount?: number
  onAssetClick?: (asset: Asset) => void
  onZoomToAsset?: (asset: Asset) => void
  onLoadMore?: () => void
}

// Asset details props
interface AssetDetailsProps {
  type: 'asset'
  asset: Asset
  attributes?: AssetTypeAttribute[]
  onEdit?: (asset: Asset) => void
  onDelete?: (asset: Asset) => void
}

// Common props
interface CommonProps {
  isOpen: boolean
  onClose: () => void
  organizationId: string
  workspaceId: string
}

export type MapDetailsDrawerProps = CommonProps & (ClusterDetailsProps | AssetDetailsProps)

export default function MapDetailsDrawer(props: MapDetailsDrawerProps) {
  const { isOpen, onClose, organizationId, workspaceId } = props

  if (props.type === 'cluster') {
    return (
      <ClusterContent
        isOpen={isOpen}
        onClose={onClose}
        organizationId={organizationId}
        workspaceId={workspaceId}
        cluster={props.cluster}
        assets={props.assets}
        loading={props.loading}
        loadingMore={props.loadingMore}
        totalCount={props.totalCount}
        onAssetClick={props.onAssetClick}
        onZoomToAsset={props.onZoomToAsset}
        onLoadMore={props.onLoadMore}
      />
    )
  }

  return (
    <AssetContent
      isOpen={isOpen}
      onClose={onClose}
      organizationId={organizationId}
      workspaceId={workspaceId}
      asset={props.asset}
      attributes={props.attributes}
      onEdit={props.onEdit}
      onDelete={props.onDelete}
    />
  )
}

// Re-export content components for direct use if needed
export { default as ClusterContent } from './ClusterContent'
export { default as AssetContent } from './AssetContent'
export type { ClusterContentProps } from './ClusterContent'
export type { AssetContentProps } from './AssetContent'
