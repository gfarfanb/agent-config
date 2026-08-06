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

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PATH = "/tmp/cavemem-pi-extension.log";
const CAVEMEM_DB_PATH = join(
  process.env.HOME ?? homedir(),
  ".cavemem",
  "data.db",
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // silent on failure
  }
}

/**
 * Truncate a string to at most `maxLen` characters. Appends "…(truncated)"
 * when truncation occurs.
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `…(truncated, was ${s.length} chars)`;
}

/**
 * Find the cavemem CLI binary. Prefer /usr/bin/cavemem, fall back to PATH.
 */
function resolveCavememBin(): string {
  // The canonical install path for cavemem in this environment.
  if (existsSync("/usr/bin/cavemem")) return "/usr/bin/cavemem";
  return "cavemem"; // PATH fallback
}

/**
 * Spawn a cavemem hook as a fire-and-forget detached child process.
 * Pipes `payload` JSON to stdin, then unref()s so it never blocks shutdown.
 */
function fireHook(hookName: string, payload: Record<string, unknown>): void {
  const bin = resolveCavememBin();
  const json = JSON.stringify(payload);

  log(`hook: ${hookName} payload: ${json.slice(0, 300)}`);

  try {
    const child = spawn(bin, ["hook", "run", hookName, "--ide", "pi"], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });

    child.on("error", (err) => {
      log(`spawn error (${hookName}): ${err.message}`);
    });

    child.stdin.write(json);
    child.stdin.end();
    child.unref();
  } catch (err) {
    log(`spawn exception (${hookName}): ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// SQLite query via CLI (avoids better-sqlite3 native addon lifecycle crash)
// ---------------------------------------------------------------------------

/** Escape a string for safe inline use in a SQLite single-quoted literal. */
function sqlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Run a read-only SQL query against the cavemem database via the sqlite3 CLI.
 * Returns parsed JSON rows (sqlite3 -json mode). Returns null on any error.
 */
function querySqlite(
  sql: string,
): Array<Record<string, unknown>> | null {
  if (!existsSync(CAVEMEM_DB_PATH)) {
    log(`cavemem db not found at ${CAVEMEM_DB_PATH}`);
    return null;
  }

  try {
    const result = spawnSync(
      "/usr/bin/sqlite3",
      ["-readonly", "-json", CAVEMEM_DB_PATH, sql],
      { timeout: 3000, encoding: "utf-8", maxBuffer: 512 * 1024 },
    );

    if (result.error) {
      log(`sqlite3 spawn error: ${result.error.message}`);
      return null;
    }
    if (result.status !== 0 || !result.stdout) return null;

    const trimmed = result.stdout.trim();
    if (!trimmed) return [];
    return JSON.parse(trimmed) as Array<Record<string, unknown>>;
  } catch (err) {
    log(`sqlite3 query failed: ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prior context query
// ---------------------------------------------------------------------------

/**
 * Query the cavemem SQLite database for prior session summaries from the same
 * project (same cwd), mirroring the OpenCode plugin exactly.
 *
 * - Max 50 most recent sessions
 * - Filtered by same cwd
 * - Excludes current session
 * - Capped at 3
 * - Returns session-scoped summary strings joined by "|"
 */
function queryPriorContext(cwd: string, currentSessionId: string): string | null {
  const sql =
    `SELECT s.id, su.content
FROM sessions s
JOIN summaries su ON su.session_id = s.id
WHERE s.cwd = ${sqlQuote(cwd)}
  AND s.id != ${sqlQuote(currentSessionId)}
  AND su.scope = 'session'
ORDER BY s.started_at DESC
LIMIT 50`;

  const rows = querySqlite(sql);
  if (!rows || rows.length === 0) return null;

  const contents = rows
    .map((r) => (typeof r.content === "string" ? r.content : ""))
    .filter(Boolean)
    .slice(0, 3);

  return contents.length > 0 ? contents.join(" | ") : null;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Tracks active sessions to prevent duplicate session-start hooks.
  const activeSessions = new Set<string>();

  // -----------------------------------------------------------------------
  // session_start
  // -----------------------------------------------------------------------
  pi.on("session_start", async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile();
    if (!sessionId) return;

    if (activeSessions.has(sessionId)) {
      log(`session_start skipped (already active): ${sessionId}`);
      return;
    }
    activeSessions.add(sessionId);

    fireHook("session-start", {
      session_id: sessionId,
      ide: "pi",
      cwd: ctx.cwd,
    });

    log(`session_start: ${sessionId} (cwd: ${ctx.cwd})`);
  });

  // -----------------------------------------------------------------------
  // session_shutdown
  // -----------------------------------------------------------------------
  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile();
    if (!sessionId) return;

    fireHook("session-end", { session_id: sessionId });
    activeSessions.delete(sessionId);
    log(`session_shutdown: ${sessionId}`);
  });

  // -----------------------------------------------------------------------
  // message_end – capture user prompts
  // -----------------------------------------------------------------------
  pi.on("message_end", async (event, _ctx) => {
    if (event.message.role !== "user") return;

    const sessionId = _ctx.sessionManager.getSessionFile();
    if (!sessionId) return;

    // Extract text from content blocks
    const textParts: string[] = [];
    if (typeof event.message.content === "string") {
      textParts.push(event.message.content);
    } else if (Array.isArray(event.message.content)) {
      for (const block of event.message.content) {
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          block.type === "text" &&
          typeof (block as { text?: string }).text === "string"
        ) {
          textParts.push((block as { text: string }).text);
        }
      }
    }

    const promptText = textParts.join("\n").trim();
    if (!promptText) return;

    fireHook("user-prompt-submit", {
      session_id: sessionId,
      prompt: promptText,
    });
  });

  // -----------------------------------------------------------------------
  // tool_result – capture every tool execution
  // -----------------------------------------------------------------------
  pi.on("tool_result", async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile();
    if (!sessionId) return;

    // Extract tool input (args)
    const toolInput = truncate(JSON.stringify(event.input ?? {}), 500);
    // Extract result text from content blocks
    const resultText = (() => {
      if (!event.content || !Array.isArray(event.content)) return "";
      return event.content
        .map((c) => {
          if (c && typeof c === "object" && "text" in c && typeof c.text === "string") {
            return c.text;
          }
          return "";
        })
        .join("\n");
    })();

    fireHook("post-tool-use", {
      session_id: sessionId,
      tool_name: event.toolName,
      tool_input: toolInput,
      tool_response: truncate(resultText, 2000),
    });
  });

  // -----------------------------------------------------------------------
  // agent_end – capture turn summary from last assistant message
  // -----------------------------------------------------------------------
  pi.on("agent_end", async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile();
    if (!sessionId) return;

    // Find the last assistant message in this run
    const assistantMessages = event.messages.filter(
      (m) => m.role === "assistant",
    );
    if (assistantMessages.length === 0) return;

    const lastAssistant = assistantMessages[assistantMessages.length - 1];

    // Extract text
    const textParts: string[] = [];
    const content = lastAssistant.content;
    if (typeof content === "string") {
      textParts.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          block.type === "text" &&
          typeof (block as { text?: string }).text === "string"
        ) {
          textParts.push((block as { text: string }).text);
        }
      }
    }

    const turnSummary = textParts.join("\n").trim();
    if (!turnSummary) return;

    fireHook("stop", {
      session_id: sessionId,
      turn_summary: turnSummary,
    });
  });

  // -----------------------------------------------------------------------
  // before_agent_start – inject cavemem context into system prompt
  // -----------------------------------------------------------------------
  pi.on("before_agent_start", async (event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionFile();
    if (!sessionId) return;

    // 1. Build the cavemem MCP tool hint
    const toolHint =
      "\n\n" +
      "## Cavemem Memory Tools (available via MCP)\n" +
      "You have access to the following cavemem MCP tools for persistent " +
      "cross-session memory:\n" +
      "- `cavemem_search` - Search past observations and summaries across all sessions\n" +
      "- `cavemem_timeline` - Get chronological observation IDs for a session\n" +
      "- `cavemem_get_observations` - Fetch full observation bodies by ID\n" +
      "- `cavemem_list_sessions` - List recent sessions in reverse chronological order\n" +
      "\n" +
      "Use these tools to recall context from prior sessions, especially " +
      "when resuming work on this project.";

    // 2. Query prior session context
    let priorContext = "";
    const prior = queryPriorContext(ctx.cwd, sessionId);
    if (prior) {
      priorContext = `\n\n## Prior Session Context (internal)\n${prior}`;
    }

    // 3. Append to system prompt
    const enrichment = toolHint + priorContext;

    return {
      systemPrompt: (event.systemPrompt ?? "") + enrichment,
    };
  });

  log("cavemem extension loaded");
}
