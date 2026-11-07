// Vitest global setup: register jest-dom matchers and auto-unmount React trees.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vite-plus/test'

// jsdom omits this flag; WebMCP 6 requires the secure context localhost provides in browsers.
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
// The upstream polyfill captures the browser's window getter; Vitest exposes a data property.
const jsdomWindow = window
Object.defineProperty(globalThis, 'window', { get: () => jsdomWindow, configurable: true })

afterEach(() => {
  cleanup()
})

// jsdom does not implement <dialog> showModal/close (BottomSheet relies on
// them). Minimal shim: toggle `open` and fire `close` — no focus trap/inert.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
