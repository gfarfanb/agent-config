---
model: DeepSeek V4 Pro
output: agent-config/Pi/extensions/build/cavemem.ts
install-when-finish: true
---

# Cavemem extension

**Main prompt:**

Create a Pi extension based on this OpenCode plugin @Pi/extensions/src/cavemem/resources/opencodeBridge.js

(Generated from cavemem/apps/cli — see resources/README.md for the build process.)

**The extension will:**

1. On session_start: fire cavemem hook run session-start with session info
1. On session_shutdown: fire cavemem hook run session-end
1. On message_end (user messages): fire cavemem hook run user-prompt-submit with the prompt text
1. On tool_result: fire cavemem hook run post-tool-use with tool name, input, response
1. On agent_end: fire cavemem hook run stop with the full assistant response as a turn summary
1. On before_agent_start: inject cavemem context (prior session summaries) and tool instructions into the system prompt

**Session lifecycle hooks:**

- session_start -> spawns cavemem hook run session-start with the session ID, IDE name ("pi"), and cwd
- session_shutdown -> spawns cavemem hook run session-end

**Capture content hooks:**

- message_end (user messages) -> spawns cavemem hook run user-prompt-submit with the full prompt text
- tool_result (every tool execution) -> spawns cavemem hook run post-tool-use with tool name, truncated input (500 chars), and truncated response (2000 chars)
- agent_end -> spawns cavemem hook run stop with the last assistant message as a turn_summary

**System prompt enrichment (before_agent_start):**

- Adds a hint that cavemem MCP tools (search, timeline, get_observations, list_sessions) are available
- Queries the cavemem SQLite database for prior session summaries from the same project (same cwd), and injects them as Prior context (internal): ... - mirroring the OpenCode plugin exactly

**Design decisions:**

- Session ID = session file path (consistent with OpenCode's approach)
- All hook calls are fire-and-forget spawn(..., detached: true) - non-blocking, unref()'d
- Uses existing cavemem CLI (/usr/bin/cavemem or PATH fallback) for hook invocations, and the existing cavemem MCP server for search/timeline/get_observations/list_sessions
- Prior context queries use read-only direct SQL via the sqlite3 CLI (`spawnSync("sqlite3", ["-readonly", "-json", dbPath, sql])`) rather than the better-sqlite3 native addon. better-sqlite3's native destructor caused `RemoveEnvironmentCleanupHook` assertion crashes during extension reload / process shutdown — the CLI avoids this entirely. Queries sessions and summaries tables directly, with single-quote escaping (`''` → `''''`)
- DB path resolved from `process.env.HOME ?? homedir()` (from `node:os`) — no hardcoded home paths
- Prior context selection: max 50 most recent sessions, filtered by same cwd and excluding current session, capped at 3, yielding session-scoped summary strings joined by |
- System prompt enrichment happens in before_agent_start - injects both the cavemem MCP tool hint and prior session context
- Extension hooks: session_start, session_shutdown, message_end (user prompts), tool_result (tool executions), agent_end (turn summaries), before_agent_start (system prompt enrichment)
- Deduplication: activeSessions Set prevents duplicate session-start hooks for the same session file
- Logging: to /tmp/cavemem-pi-extension.log via sync appendFileSync, silent on failure
- Prior context queried once per session via a module-level Map cache keyed by sessionId — subsequent before_agent_start turns reuse the cached result; cache entry cleared on session_shutdown
- Widget above status bar: on session_start, sets `ctx.ui.setWidget("cavemem-status", ..., { placement: "belowEditor" })` — renders on its own line above the token/cost status bar using `theme.fg("dim", ...)` to match the footer color; cleared on session_shutdown
- Token estimate: simple `Math.ceil(text.length / 4)` used in both the widget and the injected context header for full disclosure

**TS header documentation for extension:**

```ts
/**
 * cavemem pi extension - bridges pi session events into cavemem for
 * long-lived semantic memory. Mirrors the OpenCode cavemem plugin but
 * uses Pi's native extension API and the existing cavemem MCP server.
 *
 * What it does:
 * 1. Session lifecycle: cavemem hooks (session-start, session-end)
 * 2. User prompts:      cavemem hook user-prompt-submit
 * 3. Tool executions:   cavemem hook post-tool-use
 * 4. Assistant turns:   cavemem hook stop (turn summary)
 * 5. System prompt:     injects cavemem tool hint + prior session context
 * 
 * Required: cavemem CLI installed and on PATH (already present in this env).
 * The cavemem MCP server provides search/timeline/get_observations/list_sessions
 */
```
