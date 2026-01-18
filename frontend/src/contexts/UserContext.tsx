import { createContext, useContext } from 'react'
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

export function UserProvider({ user, children }: UserProviderProps) {
  return (
    <UserContext.Provider value={{ user }}>
      {children}
    </UserContext.Provider>
  )
}
