// Exercise standard WebMCP discovery and execution through the real MCP-B bridge.

import { cleanupWebModelContext } from '@mcp-b/global'
import type { CallToolResult, ModelContextProtocol } from '@mcp-b/react-webmcp'
import type { WebMCP } from '@mcp-b/webmcp-types'
import { act } from '@testing-library/react'
import { afterAll } from 'vite-plus/test'

// Close the real MCP-B bridge before jsdom tears down its Event realm.
afterAll(async () => {
  const bridge = document.modelContext as ModelContextProtocol | undefined
  cleanupWebModelContext()
  await bridge?.close()
})

/** Standard WebMCP discovery and execution surface. */
export function modelContext(): WebMCP.ModelContext {
  const context = document.modelContext
  if (!context) throw new Error('WebMCP runtime did not initialize')
  return context
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
 * Call a registered tool via `executeTool(tool, inputObject)`.
 *
 * BrowserMcpServer and the polyfill serialize the MCP result to JSON.
 * Parse it as `CallToolResult` so assertions can inspect `structuredContent`.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  let response: CallToolResult | undefined
  await act(async () => {
    const tool = await findTool(name)
    const raw = await modelContext().executeTool(tool, args)
    response = JSON.parse(raw) as CallToolResult
  })
  if (!response) throw new Error(`executeTool("${name}") did not resolve`)
  return response
}

/** Registered tool names via the standard async discovery path. */
export async function registeredToolNames(): Promise<string[]> {
  const tools = await modelContext().getTools()
  return tools.map((t) => t.name)
}
