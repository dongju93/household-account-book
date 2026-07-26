import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { cn } from '../lib/cn'
import type { YearMonth } from '../lib/month'
import { formatMonthLabel } from '../lib/month'
import { IconButton } from './primitives'

// ── App column (mobile-first, centered on desktop) ───────────────────────────
// §5 fixes the supported range at 320–480px: one column, bottom tabs, and the
// shell centred on anything wider. No tablet or desktop layout is introduced.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-screen">{children}</div>
  )
}

// Scrollable content area between the app bar and the tab bar. The bottom pad
// clears the fixed tab bar *plus* the home indicator (§5).
export function ScreenBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('pb-safe-body flex-1 overflow-y-auto px-4 pt-4', className)}>
      {children}
    </main>
  )
}

// ── Top app bar ──────────────────────────────────────────────────────────────
export function AppBar({
  title,
  left,
  right,
  center,
}: {
  title?: ReactNode
  left?: ReactNode
  right?: ReactNode
  center?: boolean
}) {
  return (
    // Not sticky: the app bar is a flex sibling of the scrolling <main>, so it
    // already never moves. Only content inside <main> needs sticky positioning.
    <header className="flex h-14 flex-none items-center justify-between gap-2 border-b border-line-soft bg-screen px-4">
      <div className="flex min-w-10 items-center gap-1">{left}</div>
      {title ? (
        <h1 className={cn('text-section flex-1 text-ink', center ? 'text-left' : 'text-center')}>
          {title}
        </h1>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex min-w-10 items-center justify-end gap-2">{right}</div>
    </header>
  )
}

function Caret({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg
      width="9"
      height="14"
      viewBox="0 0 8 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === 'prev' ? <path d="M6 1L2 6l4 5" /> : <path d="M2 1l4 5-4 5" />}
    </svg>
  )
}

// ── Month stepper  ‹ 2026.06 › ───────────────────────────────────────────────
// §6.2 keeps the control and its prev/next behaviour exactly as-is; what changes
// is that the arrows now carry the shared focus/press states and a real 44×44
// touch target while staying visually small.
export function MonthNav({
  value,
  onPrev,
  onNext,
}: {
  value: YearMonth
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="이전 달" onClick={onPrev}>
        <Caret dir="prev" />
      </IconButton>
      <span className="tnum text-section min-w-[74px] text-center text-ink">
        {formatMonthLabel(value)}
      </span>
      <IconButton label="다음 달" onClick={onNext}>
        <Caret dir="next" />
      </IconButton>
    </div>
  )
}

// ── Bottom tab bar with center add button ────────────────────────────────────
// Icons draw in `currentColor` so the active/inactive colour is decided once, by
// the tab, instead of being baked into each path.
const TAB_ICON: Record<string, ReactNode> = {
  요약: (
    <svg width="19" height="18" viewBox="0 0 18 17" fill="currentColor" aria-hidden="true">
      <rect x="2" y="9" width="3.4" height="6" rx="1" />
      <rect x="7.3" y="5" width="3.4" height="10" rx="1" />
      <rect x="12.6" y="2" width="3.4" height="13" rx="1" />
    </svg>
  ),
  내역: (
    <svg
      width="19"
      height="18"
      viewBox="0 0 18 17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 4h12M3 9h12M3 14h8" />
    </svg>
  ),
  통계: (
    <svg
      width="19"
      height="18"
      viewBox="0 0 18 17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12l4-4 3 2 5-6" />
    </svg>
  ),
  설정: (
    <svg
      width="19"
      height="18"
      viewBox="0 0 18 17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 5h7M13 5h3M2 13h3M9 13h7" />
      <circle cx="11" cy="5" r="2" />
      <circle cx="7" cy="13" r="2" />
    </svg>
  ),
}

/**
 * §6.2: the active tab is marked three ways at once — ink colour, a filled
 * pill behind the icon, and heavier label weight — so "where am I" survives both
 * greyscale and a colour-vision difference (§8).
 */
function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      // `min-w-0` matters at large text sizes: a flex item defaults to
      // `min-width: auto`, so without it the tab refuses to shrink below the
      // icon pill's width and the last tabs get pushed off screen entirely
      // (§11.3, 200% text zoom). The pill shrinks with `max-w-full` for the
      // same reason.
      className="pressable flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1"
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-7 w-11 max-w-full items-center justify-center rounded-full transition-colors duration-(--dur-state)',
              isActive ? 'bg-fill2 text-ink' : 'text-ink3',
            )}
          >
            {TAB_ICON[label]}
          </span>
          <span className={cn('text-micro', isActive ? 'text-ink' : 'font-medium text-ink2')}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export function TabBar({ onAdd }: { onAdd: () => void }) {
  return (
    <nav
      aria-label="주요 화면"
      className="pb-safe-nav fixed bottom-0 z-(--z-nav) flex w-full max-w-[480px] items-stretch border-t border-line bg-paper shadow-nav"
    >
      <Tab to="/dashboard" label="요약" />
      <Tab to="/transactions" label="내역" />
      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          aria-label="거래 추가"
          onClick={onAdd}
          // §6.2: keep the position and function, drop the heavy drop shadow to
          // the `raised` step, and add the shared press feedback.
          className="pressable -mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper shadow-raised hover:bg-ink/90"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M10 4v12M4 10h12" />
          </svg>
        </button>
      </div>
      <Tab to="/reports" label="통계" />
      <Tab to="/settings" label="설정" />
    </nav>
  )
}
