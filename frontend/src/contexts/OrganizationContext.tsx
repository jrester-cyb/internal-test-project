import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { fetchOrganizations } from '../api/assets'

interface Organization {
  id: string
  name: string
  description?: string
  created_at?: string
  updated_at?: string
}

interface OrganizationContextType {
  organizations: Organization[]
  activeOrganization: Organization | null
  setActiveOrganization: (org: Organization) => void
  isLoading: boolean
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [activeOrganization, setActiveOrganizationState] = useState<Organization | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load organizations on mount
  useEffect(() => {
    async function loadOrganizations() {
      try {
        setIsLoading(true)
        const data = await fetchOrganizations()
        const orgList = Array.isArray(data) ? data : data.results || []
        setOrganizations(orgList)

        // Try to restore active organization from localStorage
        const savedOrgId = localStorage.getItem('activeOrganizationId')
        if (savedOrgId) {
          const savedOrg = orgList.find((org: Organization) => org.id === savedOrgId)
          if (savedOrg) {
            setActiveOrganizationState(savedOrg)
          } else if (orgList.length > 0) {
            setActiveOrganizationState(orgList[0])
          }
        } else if (orgList.length > 0) {
          // Default to first organization if none saved
          setActiveOrganizationState(orgList[0])
        }
      } catch (error) {
        console.error('Failed to load organizations:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadOrganizations()
  }, [])

  const setActiveOrganization = (org: Organization) => {
    setActiveOrganizationState(org)
    localStorage.setItem('activeOrganizationId', org.id)
  }

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        activeOrganization,
        setActiveOrganization,
        isLoading,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider')
  }
  return context
}
