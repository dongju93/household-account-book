import type { ReactNode } from 'react'

import { useAsyncData } from '../app/useAsyncData'
import { useAuth } from '../auth/useAuth'
import { getAiUserSettings } from '../data/aiSettings'
import { AiSettingsContext } from './aiSettingsContext'

/**
 * One resolved copy of `ai_user_settings` for the whole session.
 *
 * Every AI surface is gated on the same per-user row, and each of them used to
 * fetch it independently on mount. That was wrong in three separate ways:
 *
 * 1. **Layout shift.** `NlDraftField` mounts only when the transaction sheet
 *    opens, so its request started *after* the sheet had finished animating in;
 *    the natural-language block then appeared a round trip later and pushed the
 *    whole form down. A gate that resolves after the surface is already on
 *    screen can only ever be visible as a jump.
 * 2. **Duplicate requests.** The dashboard alone fired two identical queries
 *    (insight card + month close), a third on opening the sheet, a fourth in
 *    settings.
 * 3. **Stale opt-out.** The settings toggle reloaded only its own copy, so
 *    turning in-app AI off left the dashboard's AI surfaces live until a full
 *    page reload — the one place where being stale actually matters, since the
 *    user just asked for it to stop.
 *
 * Loading here rather than in each consumer fixes all three: the request starts
 * once at session start, and by the time any sheet or card mounts the answer is
 * already known. `reload` is what the settings toggle calls after a write, and
 * it re-broadcasts to every surface at once.
 *
 * This is not a general-purpose cache; it is one row that belongs to the session
 * exactly like the ledger membership above it, and it sits in the same provider
 * stack for the same reason.
 */
export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id

  const { data, loading, error, reload } = useAsyncData(
    () => (userId ? getAiUserSettings(userId) : Promise.resolve(null)),
    [userId],
  )

  const value = {
    settings: data,
    loading,
    error,
    enabled: data?.inAppAiEnabled === true,
    reload,
  }

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>
}
