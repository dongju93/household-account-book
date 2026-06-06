import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LoadingState } from '../ui'

// Default entry: route to /dashboard or /login based on auth state (spec §3).
export function RootRedirect() {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-screen">
        <LoadingState />
      </div>
    )
  }
  return <Navigate to={status === 'authed' ? '/dashboard' : '/login'} replace />
}
