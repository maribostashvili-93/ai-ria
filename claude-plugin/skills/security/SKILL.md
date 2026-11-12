---
name: security
description: Scan the current repository with AI RIA for committed secrets, credentials in URLs and SQL, unsafe shell commands and prompt injection in agent-instruction files. Report only - nothing is executed or changed. Use when the user asks for a security check of the repo.
---

# Security scan

Call the `security_scan` tool of the **ai-ria** MCP server with `path` set to the project root's absolute path. If the tool isn't available, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ria.mjs" security .
```

and read `.ria/security-report.json`.

Report to the user:

1. Counts by severity (critical, high, medium, low, info).
2. Each **critical** and **high** finding as `file:line - rule - what to do`, most severe first.
3. Medium and lower findings as a count per rule, unless the user asks for them.

**Never repeat a secret's value.** Findings carry a code snippet that may contain the secret itself. Name the file, line and kind of secret, never the value. If a real secret was committed, say that removing it from the code is not enough: it has to be rotated, because it stays in git history.

Test, fixture, example and e2e folders are excluded by default. If the user asks to include them, say so; don't scan them silently.

Don't edit files from this skill. Offer fixes and wait for the user to choose.
