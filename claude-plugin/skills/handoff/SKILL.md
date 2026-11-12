---
name: handoff
description: Write an AI RIA handoff so the next session or agent (Claude Code, Cursor, Codex) can resume this work - what the task was, what is done, what remains, and what to watch out for. Use when the user is wrapping up, switching agents, or asks for a handoff.
---

# Write a handoff

Build the handoff from this conversation:

- **task**: one line naming what was being worked on
- **completed**: the items actually finished and verified in this session
- **remaining**: what is left, in the order it should be done
- **warnings**: risks, half-done changes, things that failed, or decisions still open

Only list what really happened. If something was attempted but not verified, put it under remaining or warnings, not completed.

Call the `handoff_create` tool of the **ai-ria** MCP server with `path` set to the project root's absolute path, those fields as arrays of short strings, and `agent` set to `"claude-code"`.

If the MCP tool isn't available, run the CLI instead (comma-separated lists, no commas inside an item):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ria.mjs" handoff create . --task "<task>" --completed "<a>,<b>" --remaining "<c>,<d>" --warnings "<e>" --agent claude-code
```

Then tell the user the handoff was saved to `.ria/handoffs/HANDOFF.md` and show the remaining items. The plugin won't replace this handoff with an automatic one when the session ends.
