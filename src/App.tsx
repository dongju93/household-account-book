import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './app/AppLayout'
import { RootRedirect } from './app/RootRedirect'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { LoadingState } from './ui'

// Route-level code splitting keeps the heavy chart pages (Recharts) out of the
// initial bundle — they load only when their route is visited.
const LoginPage = lazy(() =>
  import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const TransactionsPage = lazy(() =>
  import('./features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
)
const ReportsPage = lazy(() =>
  import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

function Fallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-screen">
      <LoadingState />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Protected app — guarded by session, wrapped in the tab-bar shell. */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Default + unknown routes resolve by auth state. */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
  )
}

export default App
