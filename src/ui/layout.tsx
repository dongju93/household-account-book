import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import type { YearMonth } from '../lib/month'
import { formatMonthLabel } from '../lib/month'

// ── App column (mobile-first, centered on desktop) ────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-screen shadow-sm">
      {children}
    </div>
  )
}

// Scrollable content area between the app bar and the tab bar.
export function ScreenBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('flex-1 overflow-y-auto px-3.5 pt-3 pb-24', className)}>{children}</main>
  )
}

// ── Top app bar ───────────────────────────────────────────────────────────────
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
    <header className="flex h-[50px] flex-none items-center justify-between border-b border-line-soft bg-screen px-3.5">
      <div className="flex min-w-10 items-center gap-2">{left}</div>
      <div
        className={cn(
          'flex-1 text-base font-bold text-ink',
          center ? 'pl-1 text-left' : 'text-center',
        )}
      >
        {title}
      </div>
      <div className="flex min-w-10 items-center justify-end gap-2.5">{right}</div>
    </header>
  )
}

// ── Month stepper  ‹ 2026.06 › ────────────────────────────────────────────────
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
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="이전 달"
        onClick={onPrev}
        className="flex h-7 w-7 items-center justify-center rounded-full text-ink2 hover:bg-fill1"
      >
        <svg
          width="8"
          height="12"
          viewBox="0 0 8 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M6 1L2 6l4 5" />
        </svg>
      </button>
      <span className="tnum min-w-[68px] text-center text-base font-bold">
        {formatMonthLabel(value)}
      </span>
      <button
        type="button"
        aria-label="다음 달"
        onClick={onNext}
        className="flex h-7 w-7 items-center justify-center rounded-full text-ink2 hover:bg-fill1"
      >
        <svg
          width="8"
          height="12"
          viewBox="0 0 8 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M2 1l4 5-4 5" />
        </svg>
      </button>
    </div>
  )
}

// ── Bottom tab bar with center add button ─────────────────────────────────────
const TAB_ICON: Record<string, (active: boolean) => ReactNode> = {
  요약: (a) => (
    <svg width="18" height="17" viewBox="0 0 18 17" fill={a ? '#39352f' : '#a8a299'}>
      <rect x="2" y="9" width="3.4" height="6" rx="1" />
      <rect x="7.3" y="5" width="3.4" height="10" rx="1" />
      <rect x="12.6" y="2" width="3.4" height="13" rx="1" />
    </svg>
  ),
  내역: (a) => (
    <svg
      width="18"
      height="17"
      viewBox="0 0 18 17"
      fill="none"
      stroke={a ? '#39352f' : '#a8a299'}
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <path d="M3 4h12M3 9h12M3 14h8" />
    </svg>
  ),
  통계: (a) => (
    <svg
      width="18"
      height="17"
      viewBox="0 0 18 17"
      fill="none"
      stroke={a ? '#39352f' : '#a8a299'}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12l4-4 3 2 5-6" />
    </svg>
  ),
  설정: (a) => (
    <svg
      width="18"
      height="17"
      viewBox="0 0 18 17"
      fill="none"
      stroke={a ? '#39352f' : '#a8a299'}
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <path d="M2 5h7M13 5h3M2 13h3M9 13h7" />
      <circle cx="11" cy="5" r="2" fill="none" />
      <circle cx="7" cy="13" r="2" fill="none" />
    </svg>
  ),
}

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} className="flex flex-1 flex-col items-center gap-0.5">
      {({ isActive }) => (
        <>
          {TAB_ICON[label](isActive)}
          <span
            className={cn(
              'text-[10.5px]',
              isActive ? 'font-bold text-ink' : 'font-medium text-ink3',
            )}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export function TabBar({ onAdd }: { onAdd: () => void }) {
  return (
    <nav className="fixed bottom-0 z-30 flex h-[62px] w-full max-w-[480px] items-center border-t border-line bg-paper pb-1.5">
      <Tab to="/dashboard" label="요약" />
      <Tab to="/transactions" label="내역" />
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          aria-label="거래 추가"
          onClick={onAdd}
          className="-mt-5 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-ink shadow-lg shadow-ink/40"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
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
