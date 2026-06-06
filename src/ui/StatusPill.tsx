import type { AchievementStatus } from '../domain/types'
import { Pill } from './primitives'
import type { Tone } from './tone'

// Maps each status label to a tone — the production version of the wireframe's
// statusMeta. 초과→danger, 주의·근접→warn, 정상·달성→ok, 진행중→info.
const STATUS_TONE: Record<AchievementStatus, Tone> = {
  초과: 'danger',
  주의: 'warn',
  근접: 'warn',
  정상: 'ok',
  달성: 'ok',
  진행중: 'info',
}

export function statusTone(status: AchievementStatus): Tone {
  return STATUS_TONE[status]
}

export function StatusPill({ status }: { status: AchievementStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{status}</Pill>
}
