import { useContext } from 'react'

import { AiSettingsContext, type AiSettingsValue } from './aiSettingsContext'

export function useAiSettings(): AiSettingsValue {
  const ctx = useContext(AiSettingsContext)
  if (!ctx) throw new Error('useAiSettings must be used within <AiSettingsProvider>')
  return ctx
}
