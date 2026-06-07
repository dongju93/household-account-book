import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App.tsx'
import { RefreshProvider } from './app/refresh'
import { AuthProvider } from './auth/AuthProvider'
import { LedgerProvider } from './auth/LedgerProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LedgerProvider>
          <RefreshProvider>
            <App />
          </RefreshProvider>
        </LedgerProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
