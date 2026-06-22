import { cloneElement, isValidElement, useId } from 'react'
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
