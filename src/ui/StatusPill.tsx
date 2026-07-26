import type { AchievementStatus } from '../domain/types'
import { Pill } from './primitives'
import { statusTone } from './statusTone'

/**
 * The Korean status label is the primary carrier of meaning; the tint only
 * reinforces it (§4.1 — status is never communicated by colour alone). Labels
 * are shown verbatim and must not be translated.
 */
export function StatusPill({ status }: { status: AchievementStatus }) {
  return <Pill tone={statusTone(status)}>{status}</Pill>
}
