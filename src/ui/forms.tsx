import { cloneElement, isValidElement, useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

/*
  Form controls (§Phase 1).

  `min-h-11` is the §8 touch target, `rounded-control` is the §4.3 control step,
  and the focus treatment comes from the global :focus-visible rule in index.css
  — an `ink` border plus a soft halo, which is what distinguishes it from hover
  (a border darkening alone). No `transition-*` utility here: the halo is a
  box-shadow, which `transition-colors` does not animate, so index.css owns the
  transition for the border and the ring together.
*/
export const inputClassName =
  'text-body min-h-11 w-full rounded-control border border-line bg-paper px-3 py-2.5 text-ink outline-none placeholder:text-ink3 hover:border-ink3 disabled:cursor-not-allowed disabled:opacity-50'

type FieldControlProps = {
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string
  error?: string
  /** Optional supporting line under the control (§6.5). */
  hint?: string
  className?: string
  children: ReactNode
}) {
  const errorId = useId()
  const control =
    error && isValidElement<FieldControlProps>(children)
      ? cloneElement(children, { 'aria-invalid': true, 'aria-describedby': errorId })
      : children

  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-caption font-semibold text-ink2">{label}</span>
      {control}
      {hint && !error && <span className="text-caption text-ink2">{hint}</span>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </label>
  )
}

/**
 * Field-level error. §8 wires it to the control via `aria-describedby`; the
 * leading glyph keeps the message readable without relying on the red (§4.1).
 */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="text-caption flex items-start gap-1 text-status-danger">
      <svg
        width="13"
        height="13"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        className="mt-0.5 flex-none"
      >
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6.5v4.2M10 13.5h.01" />
      </svg>
      {children}
    </span>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClassName, className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClassName, 'appearance-none pr-9', className)} {...rest}>
      {children}
    </select>
  )
}

// Open eye / slashed eye. Drawn to match Glyph's conventions (20x20 viewBox,
// currentColor stroke) so it sits naturally next to the rest of the icon set.
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 10s2.7-5 8-5 8 5 8 5-2.7 5-8 5-8-5-8-5z" />
      <circle cx="10" cy="10" r="2.5" />
      {off && <path d="M3.5 3.5l13 13" />}
    </svg>
  )
}

// Password field with an unmask toggle. The toggle is type="button" so it never
// submits the form; aria-pressed + a dynamic aria-label expose its state, and a
// visually-hidden warning tells assistive-tech users that revealing prints the
// password on screen. `focus-ring` puts the §8 focus boundary on the whole
// composite when either child takes focus. All other input props pass through.
export function PasswordInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [revealed, setRevealed] = useState(false)
  const warningId = useId()
  return (
    <div
      className={cn(
        'focus-ring flex min-h-11 items-stretch rounded-control border border-line bg-paper hover:border-ink3',
        className,
      )}
    >
      <input
        {...rest}
        type={revealed ? 'text' : 'password'}
        className="text-body w-full bg-transparent px-3 py-2.5 text-ink outline-none placeholder:text-ink3"
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-pressed={revealed}
        aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 표시'}
        aria-describedby={warningId}
        className="pressable flex w-11 items-center justify-center rounded-r-control text-ink3 hover:text-ink"
      >
        <EyeIcon off={revealed} />
      </button>
      <span id={warningId} className="sr-only">
        비밀번호가 화면에 표시됩니다.
      </span>
    </div>
  )
}

/**
 * Amount entry. §6.5 makes this the strongest visual element in the transaction
 * sheet, so the figure renders at hero scale with tabular figures and the ₩ mark
 * stays quiet beside it.
 */
export function AmountInput({
  value,
  onChange,
  size = 'field',
  autoFocus,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: {
  value: string
  onChange: (v: string) => void
  /**
   * `hero` is the transaction sheet, where §6.5 makes the amount the strongest
   * element on screen. `field` is every other amount — a budget, a goal, a
   * recurring amount — which is one field among several and must not shout over
   * the fields around it.
   */
  size?: 'hero' | 'field'
  /** Marks this as the sheet's focus entry point — see BottomSheet. */
  autoFocus?: boolean
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const hero = size === 'hero'
  return (
    <div
      className={cn(
        'focus-ring flex items-baseline gap-2 border border-line bg-paper hover:border-ink3',
        hero ? 'rounded-hero px-4 py-3.5' : 'min-h-11 rounded-control px-3 py-2.5',
      )}
    >
      <span aria-hidden className={cn('text-ink3', hero ? 'text-title' : 'text-body')}>
        ₩
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        data-autofocus={autoFocus ? '' : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        className={cn(
          'tnum w-full bg-transparent text-right text-ink outline-none placeholder:text-ink3',
          hero ? 'text-hero' : 'text-body',
        )}
      />
    </div>
  )
}
