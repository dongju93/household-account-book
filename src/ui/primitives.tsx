import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { toneBg, toneTint, type Tone } from './tone'

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
  pad = 'p-[13px]',
}: {
  children: ReactNode
  className?: string
  pad?: string
}) {
  return (
    <div className={cn('rounded-[14px] border border-line bg-paper', pad, className)}>{children}</div>
  )
}

// ── Pill (small status/label badge) ───────────────────────────────────────────
export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] leading-none font-bold',
        toneTint[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// ── Chip (filter / category toggle) ───────────────────────────────────────────
export function Chip({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink2',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ── Segmented control (e.g. 구분 selector) ────────────────────────────────────
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-0.5 rounded-xl bg-fill1 p-[3px]', className)}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              'flex-1 rounded-[9px] py-2 text-sm font-semibold transition-colors',
              active ? 'bg-paper text-ink shadow-sm' : 'text-ink3',
            )}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Toggle (switch) ───────────────────────────────────────────────────────────
export function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean
  onChange?: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={cn(
        'relative h-[22px] w-[38px] flex-none rounded-full transition-colors',
        on ? 'bg-ink' : 'bg-fill3',
        disabled && 'opacity-40',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all',
          on ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </button>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function Progress({
  pct,
  tone = 'ink',
  height = 7,
}: {
  pct: number
  tone?: Tone
  height?: number
}) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="w-full overflow-hidden rounded-full bg-fill2" style={{ height }}>
      <div className={cn('h-full rounded-full', toneBg[tone])} style={{ width: `${clamped}%` }} />
    </div>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}

export function Button({ children, variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'w-full rounded-[13px] py-3 text-center text-[15px] font-bold transition-colors disabled:opacity-50',
        variant === 'ghost' ? 'border border-line bg-fill1 text-ink2' : 'bg-ink text-white',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
