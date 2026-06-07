import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

// @testing-library/jest-dom only ships an augmentation for the 'vitest' module
// specifier; vite-plus/test re-exports the same Assertion interface under its
// own specifier, so the matcher types need to be merged in here explicitly.
declare module 'vite-plus/test' {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
