
# agent-config

AI agent configuration files.

## Extensions

Pi extensions live in three locations that must stay in sync:

| File | Role |
|---|---|
| `Pi/extensions/src/<name>/spec.md` | Design spec — intent, rationale, usage |
| `Pi/extensions/<name>.ts` | Canonical source — the extension implementation |
| `~/.pi/agent/extensions/<name>.ts` | Runtime copy — auto-discovered by Pi on `/reload` |

**When implementing or updating an extension:**

1. Edit `Pi/extensions/<name>.ts` (the canonical source)
2. Update `Pi/extensions/src/<name>/spec.md` if the design changes
3. Copy the source to `~/.pi/agent/extensions/<name>.ts`
4. Run `/reload` in Pi (or restart) to activate
