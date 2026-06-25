import { cloneElement, isValidElement, useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export const inputClassName =
  'w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink'

type FieldControlProps = {
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: ReactNode
}) {
  const errorId = useId()
  const control =
    error && isValidElement<FieldControlProps>(children)
      ? cloneElement(children, { 'aria-invalid': true, 'aria-describedby': errorId })
      : children

  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-semibold text-ink2">{label}</span>
      {control}
      {error && (
        <span id={errorId} className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </label>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClassName, className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClassName, className)} {...rest}>
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
// visually-hidden warning (per the forms a11y guide) tells assistive-tech users
// that revealing prints the password on screen. All other input props (name,
// autoComplete, required, minLength, placeholder…) pass through unchanged.
export function PasswordInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [revealed, setRevealed] = useState(false)
  const warningId = useId()
  return (
    <div
      className={cn(
        'flex items-stretch rounded-[12px] border border-line bg-paper focus-within:border-ink',
        className,
      )}
    >
      <input
        {...rest}
        type={revealed ? 'text' : 'password'}
        className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-pressed={revealed}
        aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 표시'}
        aria-describedby={warningId}
        className="flex items-center px-3 text-ink3 hover:text-ink"
      >
        <EyeIcon off={revealed} />
      </button>
      <span id={warningId} className="sr-only">
        비밀번호가 화면에 표시됩니다.
      </span>
    </div>
  )
}

export function AmountInput({
  value,
  onChange,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: {
  value: string
  onChange: (v: string) => void
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  return (
    <div className="flex items-center rounded-[12px] border border-line bg-paper px-3">
      <span className="text-sm text-ink3">₩</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        className="tnum w-full bg-transparent px-2 py-2.5 text-right text-sm outline-none"
      />
    </div>
  )
}
