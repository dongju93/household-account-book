import type { Session, User } from '@supabase/supabase-js'
import { createContext } from 'react'

// Three-state session machine: 'loading' guards protected routes from a
// premature redirect while the session is still being restored (spec §3 / §4).
export type AuthStatus = 'loading' | 'authed' | 'anon'

export interface SignUpResult {
  error?: string
  needsConfirmation?: boolean
}

export interface AuthValue {
  status: AuthStatus
  user: User | null
  session: Session | null
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

// Exported so tests can wrap components with a synthetic auth value.
export const AuthContext = createContext<AuthValue | null>(null)
