---
name: remember
description: Save a decision, rule or note to the project's AI RIA memory so future sessions and other agents see it (for example "we use server actions, not API routes" or "never touch the legacy billing module"). Use when the user says to remember something about the project.
---

# Save to project memory

From what the user asked to remember, and the conversation around it, fill in:

- **task**: what was being worked on when this came up
- **decision**: the rule or decision itself, in one or two sentences
- **reason**: why, if the user gave or implied one; leave it out rather than invent one
- **type**: `decision`, `architecture`, `design`, `security` or `note`
- **files**: the files it applies to, if any

Call the `memory_save` tool of the **ai-ria** MCP server with `path` set to the project root's absolute path, those fields, and `agent` set to `"claude-code"`.

If the MCP tool isn't available, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ria.mjs" memory add . --title "<decision>" --content "Task: <task> | Reason: <reason>" --type <cli type> --files "<a>,<b>" --agent claude-code
```

The CLI names the types differently: `decision` → `decision`, `architecture` → `architecture-note`, `design` → `design-rule`, `security` → `security-note`, `note` → `warning` if it is a caution, otherwise `decision`.

Confirm to the user in one line what was saved. Future sessions get recent memories in the context pack the plugin loads at session start.

Don't store secrets, credentials or personal data in memory: it is plain text in `.ria/memory/`.
