import type { Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthStatus, type AuthValue } from './authContext'

// Supabase returns English auth errors; surface friendly Korean messages (spec §4).
function koAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (m.includes('email not confirmed'))
    return '이메일 인증이 완료되지 않았습니다. 메일함을 확인하세요.'
  if (m.includes('user already registered')) return '이미 가입된 이메일입니다.'
  if (m.includes('password should be at least')) return '비밀번호는 최소 6자 이상이어야 합니다.'
  if (m.includes('unable to validate email address') || m.includes('invalid email')) {
    return '이메일 형식이 올바르지 않습니다.'
  }
  if (m.includes('rate limit') || m.includes('too many requests'))
    return '요청이 많습니다. 잠시 후 다시 시도하세요.'
  return '오류가 발생했습니다. 다시 시도하세요.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let active = true

    // Restore any persisted session before resolving the loading state.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'authed' : 'anon')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setStatus(nextSession ? 'authed' : 'anon')
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthValue = {
    status,
    user: session?.user ?? null,
    session,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? { error: koAuthError(error.message) } : {}
    },
    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return { error: koAuthError(error.message) }
      // No session means the project requires email confirmation.
      return { needsConfirmation: !data.session }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
