---
model: DeepSeek V4 Pro
output: agent-config/Pi/extensions/codebase-memory-mcp.ts
install-when-finish: true
---

# Codebase Memory MCP extension

**Main prompt:**

Create a Pi extension based on the codebase-memory-mcp prompt defined in @~/.config/opencode/AGENTS.md for OpenCode

**Why this is better than the static AGENTS.md block:**

| Static AGENTS.md block | Extension approach |
| --- | --- |
| Always injected, even when MCP service isn't connected | Only injects when codebase-memory-mcp tools are actually present in the session |
| Requires manual copy into every project's AGENTS.md | Global extension - works for all projects automatically |
| Can't adapt based on tool availability | Could be extended to inject different instructions per MCP server |

**How it works:**

1. Listens on before_agent_start (fires before each LLM call)
1. Guard 1 — checks systemPromptOptions.selectedTools for any tool starting with mcp__codebase-memory-mcp
1. Guard 2 — runs `codebase-memory-mcp cli list_projects` and checks if the current project directory (`process.cwd()`) appears in the project list by matching `root_path`
1. Only if both guards pass, appends the codebase-memory usage instructions to the system prompt
1. If either guard fails (server disconnected, project not indexed, CLI error), silently skips — no wasted tokens

**Why guard 2 (on-demand indexing check):**
- The MCP server may be connected but the project not yet indexed
- Injecting the prompt for an unindexed project wastes context tokens and misleads the agent into calling MCP tools that will return empty results
- The `list_projects` CLI call is a cheap spawn (no native addons, sub-5ms for indexed projects) and doesn't block the turn

**TS header documentation for extension:**

```ts
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
```
