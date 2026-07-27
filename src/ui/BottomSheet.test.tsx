import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { BottomSheet } from './BottomSheet'

/*
  The dismiss gesture is the only interaction in the app whose correctness is
  invisible in a screenshot — it lives in pointer maths, not in markup. These
  tests pin the three decisions a user would notice if they regressed: a tap
  closes, a decisive pull closes, and a nervous 20px wobble does not.

  jsdom reports `offsetHeight: 0` for everything, which would make the
  distance threshold `0` and let any movement dismiss — so the panel height is
  stubbed to a realistic 400px. Without it the "small drag" case would pass for
  the wrong reason.
*/
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return this.classList.contains('sheet-panel') ? 400 : 0
    },
  })
})

function renderSheet(onClose = vi.fn()) {
  render(
    <BottomSheet open onClose={onClose} title="거래 추가">
      <p>본문</p>
    </BottomSheet>,
  )
  const grabber = screen.getByRole('button', { name: '닫기' })
  // The gesture is bound to the header, which owns the whole drag surface.
  const header = grabber.parentElement as HTMLElement
  return { onClose, grabber, header }
}

// `target` is where the finger lands; the handlers live on the header and see it
// by bubbling, which is what lets a swipe start on the title as well as the bar.
function drag(target: HTMLElement, from: number, to: number, steps = 4) {
  fireEvent.pointerDown(target, { pointerId: 1, clientY: from, button: 0 })
  for (let i = 1; i <= steps; i++) {
    fireEvent.pointerMove(target, { pointerId: 1, clientY: from + ((to - from) * i) / steps })
  }
  fireEvent.pointerUp(target, { pointerId: 1, clientY: to })
}

describe('BottomSheet dismiss gestures', () => {
  it('closes when the grabber is tapped without movement', () => {
    const { onClose, grabber } = renderSheet()
    drag(grabber, 100, 100, 1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the tap lands on the header but not the grabber', () => {
    // Tapping the title is not a dismiss gesture — only the control that looks
    // like a handle behaves like one.
    const { onClose, header } = renderSheet()
    drag(header, 100, 100, 1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when dragged past the distance threshold', () => {
    const { onClose, header } = renderSheet()
    drag(header, 100, 260) // 160px on a 400px panel — past 30%
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('snaps back after a short drag instead of closing', () => {
    const { onClose, header } = renderSheet()
    drag(header, 100, 120) // 20px — under both the distance and flick thresholds
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores an upward drag', () => {
    const { onClose, header } = renderSheet()
    drag(header, 300, 200)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on a keyboard activation of the grabber', () => {
    const { onClose, grabber } = renderSheet()
    // detail: 0 is what distinguishes an Enter/Space activation from a real
    // click; pointer taps are handled by the gesture, not by this handler.
    fireEvent.click(grabber, { detail: 0 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
