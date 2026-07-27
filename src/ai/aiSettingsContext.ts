import { createContext } from 'react'

import type { AiUserSettings } from '../data/aiSettings'
import type { DescribedError } from '../data/errors'

export interface AiSettingsValue {
  settings: AiUserSettings | null
  loading: boolean
  error: DescribedError | null
  /**
   * The only gate AI surfaces should read. It is `false` while the row is still
   * loading *and* when the user opted out, which is deliberate: dark-launch
   * semantics say an unknown answer means off (a missing row means disabled on
   * the Edge side too), so a surface can never flash into view on an unresolved
   * preference and then vanish.
   */
  enabled: boolean
  reload: () => void
}

export const AiSettingsContext = createContext<AiSettingsValue | null>(null)
