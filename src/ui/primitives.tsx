import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { type Tone, toneBg, toneTint } from './tone'

/*
  Shared controls (docs/5. frontend-redesign-plan.md §Phase 1).

  Two rules hold across everything in this file:

  1. Every pressable control carries `pressable`, which supplies the same 140ms
     state transition and 0.97 press scale, and the global :focus-visible ring
     from index.css. Phase 1's completion criterion is that no control can ship
     missing hover / pressed / focus-visible / disabled.
  2. No arbitrary sizes. Sizes come from the type scale (text-caption, …) and
     radii from the three-step scale (control / surface / hero).
*/

// ── Surfaces ─────────────────────────────────────────────────────────────────

/**
 * A content surface. `level` is the §4.3 hierarchy, not decoration:
 * - `flat`    — no surface of its own; used inside a section that already has one.
 * - `surface` — the default 12px bordered panel.
 * - `hero`    — the 18px panel reserved for the one thing a screen is about.
 */
export function Card({
  children,
  className,
  level = 'surface',
  pad = 'p-3',
}: {
  children: ReactNode
  className?: string
  level?: 'flat' | 'surface' | 'hero'
  pad?: string
}) {
  return (
    <div
      className={cn(
        level === 'flat' && 'rounded-surface',
        level === 'surface' && 'rounded-surface border border-line bg-paper',
        level === 'hero' && 'rounded-hero border border-line bg-paper',
        pad,
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Section heading. §2.2 P0 found every block rendered at the same weight, so the
 * eye had no order to follow. One component now owns that hierarchy: `title` is
 * the section role at `text-section`, `aside` is subordinate context at
 * `text-caption`, and `action` is the section's own control.
 */
export function SectionHeader({
  title,
  aside,
  action,
  className,
}: {
  title: ReactNode
  aside?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-section text-ink">{title}</h2>
      {aside && <span className="text-caption shrink-0 text-ink2">{aside}</span>}
      {action}
    </div>
  )
}

// ── Pill (small status/label badge) ──────────────────────────────────────────
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
        'text-micro inline-flex items-center gap-1 rounded-full px-2 py-1 leading-none',
        toneTint[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// ── Chip (filter / category toggle) ──────────────────────────────────────────
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
      // aria-pressed, not colour alone, is what tells a screen reader the filter
      // is on (§8: state must never be carried by colour only).
      aria-pressed={active}
      className={cn(
        'pressable text-caption inline-flex min-h-11 items-center gap-1 rounded-full border px-3.5 font-semibold whitespace-nowrap',
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-line bg-paper text-ink2 hover:border-ink3 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ── Segmented control (e.g. 구분 selector) ───────────────────────────────────
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  className?: string
  label?: string
}) {
  return (
    // Grouped toggle buttons with `aria-pressed`, not role="radiogroup"/"radio".
    // A real radio group owes the user arrow-key navigation and a roving
    // tabindex; claiming the role without implementing them makes the control
    // *less* usable with a screen reader than plain buttons, not more.
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-1 rounded-surface bg-fill1 p-1', className)}
    >
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'pressable text-body min-h-10 flex-1 rounded-control font-semibold',
              active ? 'bg-paper text-ink shadow-raised' : 'text-ink2 hover:text-ink',
            )}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Toggle (switch) ──────────────────────────────────────────────────────────
export function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean
  onChange?: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      // hit-44 keeps the 38×22 pill visually compact while meeting the §8 touch
      // target — important in settings rows where the toggle sits beside a
      // full-row edit button and must not swallow it.
      className={cn(
        'pressable hit-44 relative h-[22px] w-[38px] flex-none rounded-full',
        on ? 'bg-ink' : 'bg-fill3',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full bg-paper shadow-raised transition-transform duration-(--dur-state) ease-(--ease-emphasized)',
          on && 'translate-x-4',
        )}
      />
    </button>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────
/**
 * Purely visual: every bar in this app sits next to the same figure in text, so
 * announcing it again would only add noise for screen readers (§8 — status must
 * be readable without colour, which the adjacent text already guarantees).
 */
export function Progress({
  pct,
  tone = 'ink',
  height = 6,
}: {
  pct: number
  tone?: Tone
  height?: number
}) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div aria-hidden className="w-full overflow-hidden rounded-full bg-fill2" style={{ height }}>
      <div
        className={cn(
          'h-full w-full origin-left rounded-full transition-transform duration-(--dur-progress) ease-(--ease-emphasized)',
          toneBg[tone],
        )}
        style={{ transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  )
}

// ── Button ───────────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `danger` is reserved for destructive confirmation only (§6.5). */
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({
  children,
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'pressable text-body min-h-12 w-full rounded-surface px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-ink text-paper enabled:hover:bg-ink/90',
        variant === 'ghost' && 'border border-line bg-fill1 text-ink2 enabled:hover:text-ink',
        variant === 'danger' && 'bg-status-danger text-paper enabled:hover:bg-status-danger/90',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

// ── Icon-only button ─────────────────────────────────────────────────────────
/**
 * §4.4: an icon-only control needs a 44×44 touch target and a text `label`. This
 * wrapper is the only way to build one, so neither can be forgotten.
 */
export function IconButton({
  label,
  children,
  className,
  expandHitArea = true,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
  /**
   * `hit-44` paints a 44×44 pseudo-element centred on the button. That is right
   * for an isolated control, but two of these stacked (the category reorder
   * carets) would overlap and the later sibling would swallow its neighbour's
   * taps. Set false there and give the button an explicit box instead.
   */
  expandHitArea?: boolean
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'pressable flex items-center justify-center rounded-full text-ink2',
        expandHitArea && 'hit-44 h-8 w-8',
        'enabled:hover:bg-fill1 enabled:hover:text-ink disabled:opacity-30',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

// ── Text action (tertiary control) ───────────────────────────────────────────
/**
 * The third button level §Component Patterns asks for, so a screen does not have
 * to choose between a filled button and a ghost button for a minor action like
 * 다시 생성 or 펼치기.
 */
export function TextAction({
  children,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'pressable text-caption -mx-2 -my-1.5 min-h-8 rounded-control px-2 py-1.5 font-semibold text-ink2',
        'enabled:hover:bg-fill1 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
