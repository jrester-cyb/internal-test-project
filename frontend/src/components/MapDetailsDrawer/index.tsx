import type { Asset, AssetTypeAttribute, Cluster } from '../../types'
import ClusterContent from './ClusterContent'
import AssetContent from './AssetContent'
import PvDrawer from '../PvDrawer'

// Cluster details props
interface ClusterDetailsProps {
  type: 'cluster'
  cluster: Cluster
  /** Map of index to asset for sparse data */
  assets: Map<number, Asset>
  loading: boolean
  loadingMore?: boolean
  totalCount: number
  onAssetClick?: (asset: Asset) => void
  onZoomToAsset?: (asset: Asset) => void
  /** Called when items at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
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
  /** When true, skip the initial slide animation (for pre-selected assets/clusters on page load) */
  initiallyOpen?: boolean
}

export type MapDetailsDrawerProps = CommonProps & (ClusterDetailsProps | AssetDetailsProps)

export default function MapDetailsDrawer(props: MapDetailsDrawerProps) {
  const { isOpen, onClose, organizationId, workspaceId, initiallyOpen } = props

  return (
    <PvDrawer key="MapDrawer" isOpen={isOpen} onClose={onClose} initiallyOpen={initiallyOpen}>
      {props.type === 'cluster' ? (
        <ClusterContent
          organizationId={organizationId}
          workspaceId={workspaceId}
          cluster={props.cluster}
          assets={props.assets}
          loading={props.loading}
          loadingMore={props.loadingMore}
          totalCount={props.totalCount}
          onAssetClick={props.onAssetClick}
          onZoomToAsset={props.onZoomToAsset}
          onLoadRange={props.onLoadRange}
        />
      ) : (
        <AssetContent
          organizationId={organizationId}
          workspaceId={workspaceId}
          asset={props.asset}
          attributes={props.attributes}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
        />
      )}
    </PvDrawer>
  )
}

// Re-export content components for direct use if needed
export { default as ClusterContent } from './ClusterContent'
export { default as AssetContent } from './AssetContent'
export type { ClusterContentProps } from './ClusterContent'
export type { AssetContentProps } from './AssetContent'
