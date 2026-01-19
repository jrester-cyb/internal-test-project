import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'

export interface UserPermissions {
  instance: string[]
  organizations: Record<string, string[]>
  workspaces: Record<string, string[]>
}

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  avatar?: string
  phoneNumber?: string
  isActive: boolean
  isVerified: boolean
  permissions?: UserPermissions
}

interface UserContextType {
  user: UserProfile
  updateUser: (updates: Partial<UserProfile>) => void
  hasInstancePermission: (permission: string) => boolean
  hasOrganizationPermission: (orgId: string, permission: string) => boolean
  hasWorkspacePermission: (wsId: string, permission: string) => boolean
  hasAnyInstancePermission: (permissions: string[]) => boolean
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within UserProvider')
  }
  return context
}

interface UserProviderProps {
  user: UserProfile
  children: ReactNode
}

export function UserProvider({ user: initialUser, children }: UserProviderProps) {
  const [user, setUser] = useState<UserProfile>(initialUser)

  const updateUser = useCallback((updates: Partial<UserProfile>) => {
    setUser(prev => {
      const updated = { ...prev, ...updates }
      if (updates.firstName !== undefined || updates.lastName !== undefined) {
        updated.fullName = `${updated.firstName || ''} ${updated.lastName || ''}`.trim() || updated.email
      }
      return updated
    })
  }, [])

  const hasInstancePermission = useCallback((permission: string) => {
    return user.permissions?.instance?.includes(permission) ?? false
  }, [user.permissions])

  const hasOrganizationPermission = useCallback((orgId: string, permission: string) => {
    return user.permissions?.organizations?.[orgId]?.includes(permission) ?? false
  }, [user.permissions])

  const hasWorkspacePermission = useCallback((wsId: string, permission: string) => {
    return user.permissions?.workspaces?.[wsId]?.includes(permission) ?? false
  }, [user.permissions])

  const hasAnyInstancePermission = useCallback((permissions: string[]) => {
    if (!user.permissions?.instance) return false
    return permissions.some(p => user.permissions!.instance.includes(p))
  }, [user.permissions])

  const value = useMemo(() => ({
    user,
    updateUser,
    hasInstancePermission,
    hasOrganizationPermission,
    hasWorkspacePermission,
    hasAnyInstancePermission,
  }), [user, updateUser, hasInstancePermission, hasOrganizationPermission, hasWorkspacePermission, hasAnyInstancePermission])

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}
