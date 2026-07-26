import type { FundType } from '../domain/fundType'
import type { AchievementStatus } from '../domain/types'
import type { FundTone, StatusTone } from './tone'

// 초과→danger, 주의·근접→warning, 정상·달성→success, 진행중→info.
const STATUS_TONE: Record<AchievementStatus, StatusTone> = {
  초과: 'danger',
  주의: 'warning',
  근접: 'warning',
  정상: 'success',
  달성: 'success',
  진행중: 'info',
}

/** The only sanctioned way to colour a UI state (§4.1). Returns a StatusTone. */
export function statusTone(status: AchievementStatus): StatusTone {
  return STATUS_TONE[status]
}

/** The only sanctioned way to colour 자금 구분 data (§4.1). Returns a FundTone. */
export function fundTone(type: FundType): FundTone {
  return type
}
