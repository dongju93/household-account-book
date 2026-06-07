import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

// Loading / empty / error states required on every screen (spec §11).

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="로딩 중"
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink',
        className,
      )}
    />
  )
}

export function LoadingState({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink3">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-bold text-ink2">{title}</p>
      {description && <p className="max-w-[260px] text-xs text-ink3">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorBanner({
  message,
  variant = 'error',
}: {
  message: string
  // 'permission' distinguishes RLS/authorization failures from generic errors (spec §9).
  variant?: 'error' | 'permission'
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-[12px] border px-3 py-2.5 text-xs font-medium',
        variant === 'permission'
          ? 'border-warn/40 bg-warn/10 text-warn'
          : 'border-danger/40 bg-danger/10 text-danger',
      )}
    >
      {variant === 'permission' ? '권한이 없습니다. ' : ''}
      {message}
    </div>
  )
}
