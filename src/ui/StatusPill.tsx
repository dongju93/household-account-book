import type { AchievementStatus } from '../domain/types'
import { Pill } from './primitives'
import { statusTone } from './statusTone'

export function StatusPill({ status }: { status: AchievementStatus }) {
  return <Pill tone={statusTone(status)}>{status}</Pill>
}
