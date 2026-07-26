import type { CSSProperties, ReactNode } from 'react'

import { cn } from '../lib/cn'

// Loading / empty / error states (§7.1).

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

/**
 * Centred spinner. §2.2 P0 retired this as the *screen* loading state — every
 * screen now uses a skeleton shaped like its own layout (see `skeletons.tsx`).
 * What is left is the case with no layout to predict: the pre-route session
 * check, and small in-place waits inside an already-drawn panel.
 */
export function LoadingState({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink2">
      <Spinner />
      <span className="text-body">{label}</span>
    </div>
  )
}

/**
 * A single static skeleton block. Deliberately not animated: §7.2 rules out
 * repeating pulses, and a still block still does the one job that matters —
 * reserving the space the real content will occupy, so nothing jumps (§11.4).
 */
export function Skeleton({
  className,
  radius = 'control',
  style,
}: {
  className?: string
  radius?: 'control' | 'surface' | 'hero' | 'full'
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        'bg-fill2',
        radius === 'control' && 'rounded-control',
        radius === 'surface' && 'rounded-surface',
        radius === 'hero' && 'rounded-hero',
        radius === 'full' && 'rounded-full',
        className,
      )}
    />
  )
}

/**
 * Wraps a set of skeleton blocks. The blocks themselves are `aria-hidden`; this
 * carries the single live announcement so assistive tech hears "불러오는 중"
 * once rather than reading a wall of empty boxes.
 */
export function SkeletonScreen({
  children,
  className,
  label = '불러오는 중…',
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <div role="status" aria-label={label} className={cn('flex flex-col gap-4', className)}>
      {children}
    </div>
  )
}

/**
 * §2.2 P1: empty-state title and body used to render at the same weight, so
 * neither led. Title is now section-level, description is muted body, and the
 * description column is capped so Korean lines stay short (§4.2).
 */
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
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-section text-ink">{title}</p>
      {description && (
        <p className="text-caption max-w-[30ch] text-ink2 text-pretty">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// A status glyph so the banner is not colour-only (§4.1, §8).
function BannerIcon({ variant }: { variant: 'error' | 'permission' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-px flex-none"
    >
      {variant === 'permission' ? (
        <>
          <rect x="4.5" y="9" width="11" height="7.5" rx="1.6" />
          <path d="M7.2 9V6.8a2.8 2.8 0 015.6 0V9" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="6.5" />
          <path d="M10 6.6v4M10 13.3h.01" />
        </>
      )}
    </svg>
  )
}

export function ErrorBanner({
  message,
  variant = 'error',
}: {
  message: string
  // 'permission' distinguishes RLS/authorization failures from generic errors (§7.1).
  variant?: 'error' | 'permission'
}) {
  return (
    <div
      role="alert"
      className={cn(
        'text-caption flex items-start gap-2 rounded-surface border px-3 py-2.5',
        variant === 'permission'
          ? 'border-status-warning/35 bg-status-warning/8 text-status-warning'
          : 'border-status-danger/35 bg-status-danger/8 text-status-danger',
      )}
    >
      <BannerIcon variant={variant} />
      <span className="text-pretty">
        {variant === 'permission' ? '권한이 없습니다. ' : ''}
        {message}
      </span>
    </div>
  )
}
