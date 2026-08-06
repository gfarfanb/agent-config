/**
 * Codebase Memory MCP Prompt Extension
 *
 * Injects codebase-memory-mcp usage instructions into the system prompt
 * when the codebase-memory-mcp server is available.
 *
 * Replaces the static AGENTS.md prompt block with a dynamic approach
 * that only activates when the MCP server is actually connected.
 *
 * Usage:
 * 1. This file is auto-discovered from ~/.pi/agent/extensions/
 * 2. Run /reload (or restart Pi) to load the extension
 * 3. The prompt auto-injects whenever codebase-memory-mcp tools are available
 *    (no prompt when the MCP server is disconnected - saves context tokens)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Prompt to inject (from AGENTS.md codebase-memory-mcp block)
// ---------------------------------------------------------------------------

const CODEBASE_MEMORY_PROMPT = `

## Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

### Priority Order
1. \`search_graph\` — find functions, classes, routes, variables by pattern
2. \`trace_path\` — trace who calls a function or what it calls
3. \`get_code_snippet\` — read specific function/class source code
4. \`query_graph\` — run Cypher queries for complex patterns
5. \`get_architecture\` — high-level project summary

### When to fall back to grep/glob
- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results

### Examples
- Find a handler: \`search_graph(name_pattern=".*OrderHandler.*")\`
- Who calls it: \`trace_path(function_name="OrderHandler", direction="inbound")\`
- Read source: \`get_code_snippet(qualified_name="pkg/orders.OrderHandler")\`
`;

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const { systemPrompt, systemPromptOptions } = event;
    const selectedTools = systemPromptOptions.selectedTools ?? [];

    // Only inject when codebase-memory-mcp tools are actually present
    const hasCodebaseMemoryMcp = selectedTools.some((tool) =>
      tool.startsWith("mcp__codebase-memory-mcp"),
    );

    if (!hasCodebaseMemoryMcp) {
      return; // Silent skip — no wasted tokens
    }

    return {
      systemPrompt: (systemPrompt ?? "") + CODEBASE_MEMORY_PROMPT,
    };
  });
}
