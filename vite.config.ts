import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'
import type { PluginOption } from 'vite-plus'

// https://viteplus.dev/guide/ — defineConfig here is a superset of Vite's that
// also configures Vitest, Oxlint, and Oxfmt from this single file.
export default defineConfig({
  plugins: [
    ...react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Tailwind v4 runs as a Vite plugin — no tailwind.config.js / PostCSS needed.
    ...tailwindcss(),
  ] as unknown as PluginOption[],
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
  // Carried over from biome.json: 2-space indent, single quotes, semicolons
  // only where required, 100-char lines, imports sorted on format.
  fmt: {
    singleQuote: true,
    semi: false,
    tabWidth: 2,
    printWidth: 100,
    sortImports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      // Carried over from biome.json's linter overrides.
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'react/exhaustive-deps': 'warn',
      'typescript/no-non-null-assertion': 'off',
    },
  },
})
