import { Navigate, Outlet } from 'react-router-dom'
import { LoadingState } from '../ui'
import { useAuth } from './AuthContext'

/**
 * Gate for authenticated routes. Distinguishes the three session states so a
 * still-loading session is NOT bounced to /login prematurely (spec §3 / §4).
 */
export function ProtectedRoute() {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-screen">
        <LoadingState label="세션 확인 중…" />
      </div>
    )
  }

  if (status === 'anon') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
