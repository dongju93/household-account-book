import fs from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'

/** Client routes that must survive a hard refresh on static hosts without SPA rewrites. */
const SPA_ROUTES = ['/login', '/dashboard', '/transactions', '/reports', '/settings']

export function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist')
      const indexHtml = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexHtml)) return

      for (const route of SPA_ROUTES) {
        const dir = path.join(outDir, route.slice(1))
        fs.mkdirSync(dir, { recursive: true })
        fs.copyFileSync(indexHtml, path.join(dir, 'index.html'))
      }
    },
  }
}
