import { useContext } from 'react'

import { AuthContext, type AuthValue } from './authContext'

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
