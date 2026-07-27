import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useId, useLayoutEffect, useRef } from 'react'

/**
 * Release thresholds for the drag gesture.
 *
 * Two independent ways to dismiss, because distance alone punishes the flick —
 * the fastest, most natural way to throw a sheet away is a short, quick swipe
 * that never travels far. A pure distance test would make that gesture snap
 * back, which reads as the sheet refusing the input.
 *
 * `DISMISS_RATIO` is expressed against the panel's own height so a short sheet
 * (a confirm) and a tall one (the transaction form) both need "about a third of
 * yourself" rather than a fixed pixel budget that is trivial on one and heavy on
 * the other; the px cap keeps a very tall sheet from demanding a whole swipe.
 */
const DISMISS_RATIO = 0.3
const DISMISS_DISTANCE_MAX = 132
/** px/ms, averaged over the whole gesture. ~0.5 is a deliberate flick. */
const FLICK_VELOCITY = 0.5
/**
 * A flick is only believed when the gesture lasted long enough to be one.
 *
 * Sampling the last two pointermove events instead — the obvious implementation
 * — measures noise: coalesced moves on a 120Hz pointer routinely arrive inside
 * the same millisecond, so a 5px thumb wobble divided by a clamped 1ms delta
 * reports 5px/ms and dismisses a sheet the user was only steadying. Averaging
 * across the gesture removes that, and the floor covers what remains: a human
 * flick spans several frames, so anything resolving in under ~24ms is an event
 * burst, not a finger, and its velocity is discarded rather than trusted.
 */
const FLICK_MIN_DURATION = 24
/** …and moved far enough to be intentional rather than a twitch on release. */
const FLICK_MIN_DISTANCE = 24
/** Movement under this is a tap, not a drag — matches the browser's own slop. */
const TAP_SLOP = 6

/**
 * Modal sheet anchored to the bottom (the 거래 추가 pattern), built on the native
 * `<dialog>` element for browser-provided focus trapping, background `inert`,
 * Escape handling, and focus restoration to the trigger on close.
 *
 * Structure: the `<dialog>` is a transparent **full-viewport overlay**, and the
 * visible sheet is the panel flex-aligned to its bottom edge. The dialog is not
 * offset from the viewport bottom — it *is* the viewport — because on iOS Safari
 * the layout viewport that `position: fixed` / `bottom: 0` / `window.innerHeight`
 * resolve against extends behind the browser toolbar and does not shrink for the
 * virtual keyboard. Sizing the overlay from `visualViewport` (the only API that
 * reports the actually-visible rect) makes "bottom of the sheet" mean "bottom of
 * what the user can see" regardless of toolbar collapse, keyboard, or pinch-zoom.
 * Anything derived from `innerHeight` instead is one bad reading away from
 * pushing the whole sheet off-screen.
 *
 * Because the overlay covers the viewport, a backdrop tap lands on the dialog
 * element itself, so `closedby="any"` (which only fires outside the dialog box)
 * no longer applies — the `onClick` target check below is now the light-dismiss
 * path on every browser, not just Safari.
 *
 * Redesign notes (docs/5. frontend-redesign-plan.md):
 * - §4.3 — 18px `hero` radius; the sheet is a top-level surface, not a card.
 * - §5    — the pad under the actions clears the home indicator via
 *           `pb-safe-sheet`, and the panel caps at the visible viewport so a long
 *           category list scrolls inside the sheet instead of staying behind the
 *           virtual keyboard.
 * - §8    — opening moves focus to the title unless a fine-pointer device has a
 *           declared `autofocus` target (the transaction sheet's amount field).
 *
 * The grabber is a real control, not decoration. It was an `aria-hidden` div,
 * which is the worst of both worlds: it carries the universal "drag me down"
 * affordance that every OS-level sheet has trained users to expect, while
 * responding to neither a drag nor a tap. Now it is the sheet's single dismiss
 * control — tap, swipe down, or Enter — which is also why the header no longer
 * carries a separate ✕ button: two adjacent controls that do exactly the same
 * thing is clutter, and the grabber is the one users reach for first on touch.
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
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startTime: number
    moved: boolean
    onGrabber: boolean
  } | null>(null)

  /*
   * Resolve the visible viewport before showModal() paints the dialog.
   *
   * On iOS Safari, opening the sheet can also move the browser chrome. When the
   * dialog was shown first and visualViewport coordinates arrived in a later
   * effect, one frame used the layout viewport and the next used the visible
   * viewport. The bottom-aligned panel visibly jumped past its resting position
   * and then dropped back. A layout effect keeps that coordinate-space switch
   * out of the painted frames.
   */
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const viewport = window.visualViewport
    const syncVisibleViewport = () => {
      if (!viewport) return
      dialog.style.setProperty('--sheet-viewport-top', `${viewport.offsetTop}px`)
      dialog.style.setProperty('--sheet-viewport-left', `${viewport.offsetLeft}px`)
      dialog.style.setProperty('--sheet-viewport-width', `${viewport.width}px`)
      dialog.style.setProperty('--sheet-viewport-height', `${viewport.height}px`)
    }

    if (open) {
      syncVisibleViewport()
      viewport?.addEventListener('resize', syncVisibleViewport)
      viewport?.addEventListener('scroll', syncVisibleViewport)
    }

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

    return () => {
      viewport?.removeEventListener('resize', syncVisibleViewport)
      viewport?.removeEventListener('scroll', syncVisibleViewport)
      dialog.style.removeProperty('--sheet-viewport-top')
      dialog.style.removeProperty('--sheet-viewport-left')
      dialog.style.removeProperty('--sheet-viewport-width')
      dialog.style.removeProperty('--sheet-viewport-height')
    }
  }, [open])

  // A closed sheet must own none of the gesture's leftovers: an inline transform
  // survives the close and would still be applied the next time the dialog is
  // shown, re-opening it half-dismissed. Clearing on the closed edge (rather
  // than at the end of the gesture) is what lets the release animation run — the
  // dismissing drag deliberately hands the panel over mid-flight.
  useEffect(() => {
    if (open) return
    dragRef.current = null
    resetPanelStyles()
  }, [open])

  function resetPanelStyles() {
    const panel = panelRef.current
    const dialog = dialogRef.current
    if (panel) {
      panel.style.removeProperty('transform')
      panel.style.removeProperty('transition')
    }
    if (dialog) {
      dialog.removeAttribute('data-dragging')
      dialog.style.removeProperty('--sheet-backdrop')
    }
  }

  function beginDrag(e: ReactPointerEvent<HTMLDivElement>) {
    // Secondary mouse buttons open context menus; they must not grab the sheet.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const panel = panelRef.current
    const dialog = dialogRef.current
    if (!panel || !dialog) return

    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTime: performance.now(),
      moved: false,
      onGrabber: e.target instanceof Element && e.target.closest('[data-sheet-grabber]') !== null,
    }
    // Capture keeps the gesture alive when the finger leaves the header — a
    // downward swipe *always* ends outside the element it started on.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // jsdom and older engines have no pointer capture; the gesture still works
      // for pointers that stay within the element's bounds.
    }
    // An inline `transition` left behind by a previous snap-back outranks the
    // `[data-dragging]` rule (nothing beats a style attribute), so it has to be
    // removed here or the second drag of a session would animate toward the
    // finger instead of following it.
    panel.style.removeProperty('transition')
    dialog.setAttribute('data-dragging', 'true')
  }

  function moveDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const panel = panelRef.current
    const dialog = dialogRef.current
    if (!drag || !panel || !dialog || drag.pointerId !== e.pointerId) return

    const raw = e.clientY - drag.startY
    // Upward travel is rubber-banded rather than clamped: a hard stop at 0 makes
    // the panel feel stuck to the touch, while 1/6 of the movement reads as "the
    // sheet is already as high as it goes" without ignoring the finger.
    const offset = raw > 0 ? raw : Math.max(raw / 6, -28)

    if (Math.abs(raw) > TAP_SLOP) drag.moved = true

    panel.style.transform = `translate3d(0, ${offset}px, 0)`
    const progress = Math.min(Math.max(offset / Math.max(panel.offsetHeight, 1), 0), 1)
    // The dim lifts only partway (down to 0.35): fading it out completely would
    // say "already dismissed" while the sheet is still on screen and can snap
    // back. It tracks the drag, it does not predict the outcome.
    dialog.style.setProperty('--sheet-backdrop', String(1 - progress * 0.65))
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel || drag.pointerId !== e.pointerId) return
    dragRef.current = null

    const distance = e.clientY - drag.startY
    const elapsed = performance.now() - drag.startTime
    const threshold = Math.min(panel.offsetHeight * DISMISS_RATIO, DISMISS_DISTANCE_MAX)
    // A tap on the grabber dismisses. It is handled here rather than through the
    // button's `click` because pointer capture retargets the compatibility click
    // to the capturing element, so the button would never receive it.
    const tappedGrabber = !drag.moved && drag.onGrabber
    const flicked =
      elapsed >= FLICK_MIN_DURATION &&
      distance > FLICK_MIN_DISTANCE &&
      distance / elapsed > FLICK_VELOCITY

    if (tappedGrabber || distance > threshold || flicked) {
      // Hand the panel to the exit animation *from where the finger left it*:
      // keep the inline transform, give it the exit timing, and let it run to
      // the same translate the closed-state rule targets. Clearing the transform
      // here instead would snap the sheet back up for one frame before it left.
      dialogRef.current?.removeAttribute('data-dragging')
      panel.style.transition = 'transform var(--dur-sheet-out) var(--ease-drawer)'
      panel.style.transform = 'translate3d(0, 100%, 0)'
      onClose()
      return
    }

    // Snap back. Shorter than the entrance because nothing new is being
    // presented — the sheet is only correcting itself.
    dialogRef.current?.removeAttribute('data-dragging')
    dialogRef.current?.style.removeProperty('--sheet-backdrop')
    panel.style.transition = 'transform var(--dur-sheet-out) var(--ease-drawer)'
    panel.style.removeProperty('transform')
  }

  function cancelDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    resetPanelStyles()
  }

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={title ? titleId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="bottom-sheet fixed z-(--z-sheet) m-0 max-w-none border-0 bg-transparent p-0"
    >
      <div
        ref={panelRef}
        className="sheet-panel w-full max-w-[480px] rounded-t-hero bg-paper shadow-sheet"
      >
        {/*
          The whole header is the drag surface, not just the 36px bar: aiming for
          a 4px-tall line with a thumb is a precision task, and a sheet that only
          responds to a perfectly-placed swipe reads as broken rather than picky.
          `touch-none` hands the vertical axis to us — without it the browser
          claims the same downward swipe for scroll and pull-to-refresh.
        */}
        <div
          className="flex-none touch-none px-4 pt-2"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
        >
          <button
            type="button"
            data-sheet-grabber
            aria-label="닫기"
            // Pointer taps are resolved in `endDrag`; this fires only for the
            // keyboard, which `detail === 0` identifies exactly (a real click
            // always carries a click count).
            onClick={(e) => {
              if (e.detail === 0) onClose()
            }}
            className="group mx-auto flex h-7 w-16 items-center justify-center rounded-full"
          >
            <span className="block h-1 w-9 rounded-full bg-fill3 transition-colors duration-(--dur-state) group-hover:bg-ink3" />
          </button>
          {title && (
            <h2
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="text-title mt-1 mb-3 text-ink outline-none"
            >
              {title}
            </h2>
          )}
        </div>
        {/* Same 16px gutter as PageBody: a sheet whose content sits on a
            different grid to the screen it covers is one of the reasons it stops
            reading as part of this app. */}
        <div className="pb-safe-sheet min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
      </div>
    </dialog>
  )
}
