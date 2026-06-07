import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'

import { AuthContext, type AuthStatus, type AuthValue } from './authContext'
import { ProtectedRoute } from './ProtectedRoute'

function renderWithStatus(status: AuthStatus) {
  const value: AuthValue = {
    status,
    user: null,
    session: null,
    signIn: async () => ({}),
    signUp: async () => ({}),
    signOut: async () => {},
  }
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>PROTECTED</div>} />
          </Route>
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ProtectedRoute', () => {
  it('shows a loader (does NOT redirect) while the session is loading', () => {
    renderWithStatus('loading')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument()
  })

  it('redirects an anonymous user to /login', () => {
    renderWithStatus('anon')
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
  })

  it('renders the protected content for an authenticated user', () => {
    renderWithStatus('authed')
    expect(screen.getByText('PROTECTED')).toBeInTheDocument()
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument()
  })
})
