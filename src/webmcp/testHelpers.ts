// Shared helpers for WebMCP tool tests under `@mcp-b/global` v4.
//
// v4 makes `document.modelContext.getTools()` + `executeTool(tool, inputArgsJson)`
// the standard producer path (Chrome 152 / W3C document-first surface).
// `listTools` / `callTool` remain as MCP-B compatibility extensions and still
// work, but tests prefer the standard path so they track the deprecation.

import type { ModelContextWithExtensions, ToolResponse } from '@mcp-b/webmcp-types'
import { act } from '@testing-library/react'

/** Full MCP-B runtime (strict core + extension surface). */
export function modelContext(): ModelContextWithExtensions {
  return document.modelContext as unknown as ModelContextWithExtensions
}

/**
 * Discover a registered tool by name via the standard `getTools()` path.
 */
export async function findTool(name: string) {
  const tools = await modelContext().getTools()
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`getTools() did not include "${name}"`)
  return tool
}

/**
 * Call a registered tool via `executeTool(tool, inputArgsJson)`.
 *
 * BrowserMcpServer (from `@mcp-b/global`) returns a `ToolResponse` object;
 * the strict polyfill returns a JSON string. Normalize both to `ToolResponse`
 * so assertions can use `structuredContent` uniformly.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResponse> {
  let response: ToolResponse | undefined
  await act(async () => {
    const tool = await findTool(name)
    const raw = await modelContext().executeTool(tool, JSON.stringify(args))
    if (raw == null) throw new Error(`executeTool("${name}") returned null`)
    response = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ToolResponse
  })
  if (!response) throw new Error(`executeTool("${name}") did not resolve`)
  return response
}

/** Registered tool names via the standard async discovery path. */
export async function registeredToolNames(): Promise<string[]> {
  const tools = await modelContext().getTools()
  return tools.map((t) => t.name)
}
