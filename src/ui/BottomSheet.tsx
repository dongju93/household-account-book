import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'

/**
 * Modal sheet anchored to the bottom (the 거래 추가 pattern), built on the native
 * `<dialog>` element for browser-provided focus trapping, background `inert`,
 * and Escape handling. `closedby="any"` adds backdrop light-dismiss on
 * Chrome/Edge 134+ and Firefox 141+; the `onClick` target check below is the
 * fallback for Safari, which doesn't support `closedby` yet.
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={title ? titleId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-[480px] mx-auto rounded-t-[20px] border-0 bg-paper px-4 pt-3 pb-5 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] backdrop:bg-ink/30"
    >
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-fill3" />
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-extrabold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-ink3 hover:text-ink2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
      )}
      {children}
    </dialog>
  )
}
