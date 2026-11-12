#!/usr/bin/env node
// `node "${CLAUDE_PLUGIN_ROOT}/scripts/ria.mjs" <ria args>` — run the ai-ria
// version this plugin is pinned to, for skills. Same launcher as the hooks:
// AI_RIA_CLI for a local build, otherwise npx without going through a shell.

import { runRiaInherit } from "./lib.mjs";

/** Long enough for a first `npx` download plus `analyze` on a large repo. */
const RUN_TIMEOUT_MS = 180_000;

process.exit(runRiaInherit(process.argv.slice(2), RUN_TIMEOUT_MS));
