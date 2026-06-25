import { useEffect } from 'react'

const BASE_TITLE = '가계부'

/**
 * Sets `document.title` to `"<page> · 가계부"` while the calling component is
 * mounted, restoring the prior title on unmount.
 *
 * Why the imperative setter instead of React 19's declarative `<title>`
 * hoisting: `index.html` ships a static `<title>가계부</title>` as the
 * pre-hydration fallback, and React does NOT dedupe `<title>` the way it does
 * `<link>`/`<meta>`. Rendering a second `<title>` would leave two in the
 * `<head>` — "undefined behavior" per the React docs, and in practice browsers
 * keep the first (static) one, so the route title would silently never apply.
 * `document.title =` updates the existing element, so the per-route title and
 * the static fallback coexist, and the title survives the lazy-route Suspense
 * fallback instead of flashing blank.
 */
export function useDocumentTitle(page: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = `${page} · ${BASE_TITLE}`
    return () => {
      document.title = previous
    }
  }, [page])
}
