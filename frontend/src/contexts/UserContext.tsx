import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  avatar?: string
  phoneNumber?: string
  isActive: boolean
  isStaff: boolean
  isVerified: boolean
}

interface UserContextType {
  user: UserProfile
  updateUser: (updates: Partial<UserProfile>) => void
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

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  )
}
