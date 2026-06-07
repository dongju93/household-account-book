// Vitest global setup: register jest-dom matchers and auto-unmount React trees.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vite-plus/test'

afterEach(() => {
  cleanup()
})
