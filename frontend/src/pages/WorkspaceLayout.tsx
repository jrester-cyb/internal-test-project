import { Outlet, useParams } from 'react-router-dom'
import { createContext, useContext } from 'react'

// Create context for workspace ID so child components can access it
export const WorkspaceContext = createContext<string | null>(null)

export function useWorkspaceId() {
  const context = useContext(WorkspaceContext)
  const params = useParams()
  return context || params.workspaceId || ''
}

export default function WorkspaceLayout() {
  const { workspaceId } = useParams()

  return (
    <WorkspaceContext.Provider value={workspaceId || null}>
      <Outlet />
    </WorkspaceContext.Provider>
  )
}
