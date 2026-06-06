import { useEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * Modal sheet anchored to the bottom (the 거래 추가 pattern). Closes on backdrop
 * click or Escape. Constrained to the app column width on desktop.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      <div className="relative z-10 w-full max-w-[480px] rounded-t-[20px] bg-paper px-4 pt-3 pb-5 shadow-[0_-10px_30px_rgba(0,0,0,0.15)]">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-fill3" />
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-extrabold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-ink3 hover:text-ink2"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
