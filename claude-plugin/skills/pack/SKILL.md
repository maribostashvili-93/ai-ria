---
name: pack
description: Analyze the current repository with AI RIA and rebuild its .ria/ context pack (architecture, routes, components, conventions, design tokens, security). Use when the user asks to set up or refresh AI RIA, or when the project has no .ria/ folder yet.
---

# Build the AI RIA context pack

Run these from the project root, one after the other:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ria.mjs" analyze .
node "${CLAUDE_PLUGIN_ROOT}/scripts/ria.mjs" agent-pack .
```

The first run may take a little longer while npm downloads ai-ria.

Then report to the user, briefly:

- the **Checklist** lines from `analyze` (framework, routes, components, design tokens, security findings, context pack size)
- that `.ria/agent-pack/AGENT_PACK.md` was written
- that from the next session on, the plugin loads a brief version of this pack automatically at session start

If `analyze` reports critical or high security findings, mention the count and suggest `/ai-ria:security` for details. Do not paste the findings themselves.

`.ria/` is generated output. If the project's `.gitignore` doesn't cover it, point that out and ask whether to add it; don't edit `.gitignore` without asking.
