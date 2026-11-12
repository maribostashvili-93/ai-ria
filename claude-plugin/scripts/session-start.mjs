#!/usr/bin/env node
// AI RIA — Claude Code SessionStart hook.
//
// When the project has a `.ria/` folder, prints this repository's agent pack,
// fitted to Claude Code's context limit, as `hookSpecificOutput.additionalContext`.
// No `.ria/`, a missing ai-ria, a slow run or any error all end in a silent
// exit 0 with nothing on stdout.

import { hasRia, projectDir, readHookInput, runHook, runRia } from "./lib.mjs";

/** Claude Code caps SessionStart additionalContext at 10,000 characters. */
const CONTEXT_LIMIT = 10_000;
const PREFIX = "AI RIA context for this repository, generated from its .ria/ folder:\n\n";
/** The pack itself gets what is left after the prefix, with a small margin. */
const PACK_BUDGET = CONTEXT_LIMIT - PREFIX.length - 100;
/** Stay well inside the hook's 30-second timeout so we exit cleanly ourselves. */
const RUN_TIMEOUT_MS = 25_000;

runHook(() => {
  const cwd = projectDir(readHookInput());
  if (!hasRia(cwd)) return;

  const pack = runRia(["agent-pack", cwd, "--max-chars", String(PACK_BUDGET), "--print"], RUN_TIMEOUT_MS);
  if (!pack || !pack.trim()) return;

  const additionalContext = (PREFIX + pack.trim()).slice(0, CONTEXT_LIMIT);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
});
