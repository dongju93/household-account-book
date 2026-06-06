/// <reference types="vitest/config" />

import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Tailwind v4 runs as a Vite plugin — no tailwind.config.js / PostCSS needed.
    tailwindcss(),
  ],
  test: {
    // Component tests need a DOM; jsdom is the lightweight standard for Vitest.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Dummy Supabase env so the client module loads in tests without real creds
    // (no network is made unless an auth/query method is actually called).
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
    },
  },
})
