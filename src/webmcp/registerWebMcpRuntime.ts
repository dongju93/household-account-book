// Side-effect import: `@mcp-b/global` auto-initializes `document.modelContext`
// (bridging `navigator.modelContext` too, if a browser ever implements it
// natively) the moment this module is evaluated. Importing it once here,
// rather than from every tool-registration hook, keeps that init timing
// obvious and guarantees it only runs once per app load.
//
// node_modules/@mcp-b/global is patched (patches/@mcp-b__global@4.0.0.patch):
// upstream's init still reads navigator.modelContext before document.modelContext
// (Chrome 152 / v4 document-first alignment left this helper unchanged), which
// self-triggers a "navigator.modelContext is deprecated" warning from
// @mcp-b/webmcp-polyfill's own compat shim on every load. The patch just
// swaps the check order to prefer document.modelContext (already installed
// by that point), matching the WebMCP spec's post-PR-184 intent. Tracked
// upstream: https://github.com/WebMCP-org/npm-packages/issues/216 — drop the
// patch once that lands.
import '@mcp-b/global'
