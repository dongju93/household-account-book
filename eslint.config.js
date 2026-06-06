import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Advisory (HMR fast-refresh only): hooks like useAuth/useLedger are
      // idiomatically co-located with their providers. Keep as a hint, not a gate.
      'react-refresh/only-export-components': 'warn',
      // React-Compiler-era rule. This SPA fetches data with plain Supabase calls
      // (no react-query / RSC per the locked stack), so a loading flag set in an
      // effect is the intended pattern. Keep as a hint, not a gate.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
