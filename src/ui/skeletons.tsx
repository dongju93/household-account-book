import { Skeleton, SkeletonScreen } from './feedback'
import { Card } from './primitives'

/*
  Screen-shaped loading states (§2.2 P0, §7.1).

  A centred spinner tells the user "wait" but not "wait for what", and the layout
  it resolves into arrives as a jump. Each skeleton below mirrors the block
  structure of the screen it stands in for — same surfaces, same row counts, same
  heights — so the transition to real data is a fill, not a relayout (§11.4).
*/

export function DashboardSkeleton() {
  return (
    <SkeletonScreen label="요약 불러오는 중…">
      {/* 월 수지 히어로 */}
      <Card level="hero" pad="px-4 py-5" className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-3 w-36" />
      </Card>

      {/* 자금 흐름 스트립 — 한 표면 안 2×2 */}
      <Card pad="p-0">
        <div className="grid grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2 border-line-soft p-3 [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r"
            >
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-1.5 w-full" radius="full" />
            </div>
          ))}
        </div>
      </Card>

      {/* 달성 확인 */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-5 w-12" radius="full" />
            </div>
            <Skeleton className="h-1.5 w-full" radius="full" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <ChartSkeleton height={200} />
    </SkeletonScreen>
  )
}

export function TransactionListSkeleton() {
  return (
    <SkeletonScreen label="내역 불러오는 중…" className="gap-5">
      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10" radius="surface" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ))}
    </SkeletonScreen>
  )
}

export function ChartSkeleton({ height = 210 }: { height?: number }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="w-full" radius="surface" style={{ height }} />
    </Card>
  )
}

export function ReportsSkeleton() {
  return (
    <SkeletonScreen label="통계 불러오는 중…">
      <ChartSkeleton height={210} />
      <ChartSkeleton height={190} />
      <ChartSkeleton height={210} />
    </SkeletonScreen>
  )
}

export function SettingsListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonScreen label="설정 불러오는 중…" className="gap-0">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-line-soft px-3 py-3 last:border-b-0"
        >
          <Skeleton className="h-9 w-9" radius="surface" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-10" radius="full" />
        </div>
      ))}
    </SkeletonScreen>
  )
}
