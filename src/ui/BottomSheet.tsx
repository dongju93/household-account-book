import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'

/**
 * Modal sheet anchored to the bottom (the 거래 추가 pattern), built on the native
 * `<dialog>` element for browser-provided focus trapping, background `inert`,
 * Escape handling, and focus restoration to the trigger on close. `closedby="any"`
 * adds backdrop light-dismiss on Chrome/Edge 134+ and Firefox 141+; the `onClick`
 * target check below is the fallback for Safari, which doesn't support it yet.
 *
 * Redesign notes (docs/5. frontend-redesign-plan.md):
 * - §4.3 — 18px `hero` radius; the sheet is a top-level surface, not a card.
 * - §5    — the pad under the actions clears the home indicator via
 *           `pb-safe-sheet`, and the body caps at the visible viewport so a long
 *           category list scrolls inside the sheet instead of staying behind the
 *           virtual keyboard.
 * - §8    — opening moves focus to the title unless a fine-pointer device has a
 *           declared `autofocus` target (the transaction sheet's amount field).
 *
 * The element deliberately carries no `flex` utility: `display` is owned by the
 * `.bottom-sheet` rules in index.css so the closed sheet stays `display: none`
 * and out of the tab order. See the comment there before adding one back.
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
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal() lands on the first tabbable node, which is the close button —
      // announcing "닫기" as the sheet's opening line. Move focus to the content's
      // declared entry point if it has one (`data-autofocus`, used by the amount
      // field in create mode), otherwise to the title. React applies `autoFocus`
      // imperatively without leaving an attribute behind, so it cannot be
      // detected here — the marker has to be explicit.
      const target = dialog.querySelector<HTMLElement>('[data-autofocus]')
      const canFocusInputOnOpen =
        window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true
      if (target && canFocusInputOnOpen) target.focus()
      else titleRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()

    if (!open || !window.visualViewport) return

    const viewport = window.visualViewport
    const syncVisibleViewport = () => {
      const obscuredBottom = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      dialog.style.setProperty('--bottom-sheet-bottom', `${obscuredBottom}px`)
      dialog.style.setProperty('--bottom-sheet-max-height', `${viewport.height * 0.85}px`)
    }

    syncVisibleViewport()
    viewport.addEventListener('resize', syncVisibleViewport)
    viewport.addEventListener('scroll', syncVisibleViewport)

    return () => {
      viewport.removeEventListener('resize', syncVisibleViewport)
      viewport.removeEventListener('scroll', syncVisibleViewport)
      dialog.style.removeProperty('--bottom-sheet-bottom')
      dialog.style.removeProperty('--bottom-sheet-max-height')
    }
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
      className="bottom-sheet fixed inset-x-0 top-auto z-(--z-sheet) mx-auto m-0 w-full max-w-[480px] flex-col rounded-t-hero border-0 bg-paper shadow-sheet"
    >
      <div className="flex-none px-4 pt-3">
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-fill3" />
        {title && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="text-title text-ink outline-none"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="pressable hit-44 -mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full text-ink3 hover:bg-fill1 hover:text-ink"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div className="pb-safe-sheet min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
    </dialog>
  )
}
