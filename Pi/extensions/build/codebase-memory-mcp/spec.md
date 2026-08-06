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
1. Checks systemPromptOptions.selectedTools for any tool starting with mcp__codebase-memory-mcp
1. If found, appends the codebase-memory usage instructions to the system prompt
1. If not found (server disconnected or not configured), silently skips - no wasted tokens

**TS header documentation for extension:**

```ts
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
```
