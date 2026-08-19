/**
 * Codebase Memory MCP Prompt Extension
 *
 * Injects codebase-memory-mcp usage instructions into the system prompt
 * when the codebase-memory-mcp server is available AND the current project
 * is already indexed.
 *
 * Replaces the static AGENTS.md prompt block with a dynamic approach
 * that only activates on-demand — both server connected and project indexed.
 *
 * Guards:
 * 1. codebase-memory-mcp MCP tools present in selectedTools
 * 2. Current project (cwd) found in `cli list_projects` output
 *
 * Usage:
 * 1. This file is auto-discovered from ~/.pi/agent/extensions/
 * 2. Run /reload (or restart Pi) to load the extension
 * 3. The prompt auto-injects whenever both guards pass
 *    (silent skip otherwise — saves context tokens)
 */

import { spawnSync } from "node:child_process";
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the given project directory is indexed in codebase-memory-mcp.
 * Runs `codebase-memory-mcp cli list_projects` and filters by root_path.
 * Returns false on any error (command not found, timeout, invalid JSON, etc.).
 */
function isProjectIndexed(projectDir: string): boolean {
  try {
    const result = spawnSync(
      "codebase-memory-mcp",
      ["cli", "list_projects"],
      {
        encoding: "utf-8",
        timeout: 5_000, // don't block the turn
      },
    );

    if (result.status !== 0 || !result.stdout) {
      return false;
    }

    const parsed = JSON.parse(result.stdout);
    const projects: Array<{ root_path: string }> =
      parsed?.projects ?? [];

    // Match resolved paths so symlinks and trailing slashes don't break equality
    return projects.some((p) => p.root_path === projectDir);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const { systemPrompt, systemPromptOptions } = event;
    const selectedTools = systemPromptOptions.selectedTools ?? [];

    // Guard 1 — only inject when codebase-memory-mcp tools are actually present
    const hasCodebaseMemoryMcp = selectedTools.some((tool) =>
      tool.startsWith("mcp__codebase-memory-mcp"),
    );

    if (!hasCodebaseMemoryMcp) {
      return; // Silent skip — no wasted tokens
    }

    // Guard 2 — only inject when the current project is already indexed
    const projectDir = process.cwd();
    if (!isProjectIndexed(projectDir)) {
      return; // Project not indexed yet — skip silently
    }

    return {
      systemPrompt: (systemPrompt ?? "") + CODEBASE_MEMORY_PROMPT,
    };
  });
}
