// Side-effect import: `@mcp-b/global` auto-initializes `document.modelContext`
// the moment this module is evaluated. Importing it once here,
// rather than from every tool-registration hook, keeps that init timing
// obvious and guarantees it only runs once per app load.
// Version 6 uses document.modelContext directly, so no compatibility patch is needed.
import '@mcp-b/global'
