import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import { AiSettingsProvider } from './ai/AiSettingsProvider'
import App from './App.tsx'
import { RefreshProvider } from './app/refresh'
import { AuthProvider } from './auth/AuthProvider'
import { LedgerProvider } from './auth/LedgerProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LedgerProvider>
          {/* Depends on the session only, so it starts fetching alongside the
              ledger rather than waiting for a screen to ask. */}
          <AiSettingsProvider>
            <RefreshProvider>
              <App />
            </RefreshProvider>
          </AiSettingsProvider>
        </LedgerProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
