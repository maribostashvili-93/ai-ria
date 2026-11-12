#!/usr/bin/env node
// AI RIA — Claude Code SessionStart hook.
//
// Reads the hook input from stdin, and when the project has a `.ria/` folder,
// prints this repository's agent pack, fitted to Claude Code's context limit,
// as `hookSpecificOutput.additionalContext`.
//
// It must never break a session: no `.ria/`, a missing ai-ria, a slow run or
// any error all end in a silent exit 0 with nothing on stdout.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Claude Code caps SessionStart additionalContext at 10,000 characters. */
const CONTEXT_LIMIT = 10_000;
const PREFIX = "AI RIA context for this repository, generated from its .ria/ folder:\n\n";
/** The pack itself gets what is left after the prefix, with a small margin. */
const PACK_BUDGET = CONTEXT_LIMIT - PREFIX.length - 100;
/** Stay well inside the hook's 30-second timeout so we exit cleanly ourselves. */
const RUN_TIMEOUT_MS = 25_000;

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/** The ai-ria version this plugin release is pinned to: plugin.json's `version`. */
function pinnedVersion() {
  try {
    return JSON.parse(readFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8")).version;
  } catch {
    return undefined;
  }
}

/** Quote one argument for cmd.exe / sh when we have to go through a shell. */
const quote = (arg) => `"${String(arg).replace(/"/g, '\\"')}"`;

/**
 * Run `ria <args>` and return its stdout, or null on any failure.
 * `AI_RIA_CLI` points at a local ai-ria CLI entry (a .js file) for development
 * and tests; otherwise the pinned version runs through npx.
 */
function runRia(args) {
  const local = process.env.AI_RIA_CLI;
  let result;
  if (local) {
    result = spawnSync(process.execPath, [local, ...args], { encoding: "utf8", timeout: RUN_TIMEOUT_MS });
  } else {
    const version = pinnedVersion();
    const pkg = version ? `ai-ria@${version}` : "ai-ria";
    // npx is a .cmd script on Windows, which Node only starts through a shell.
    const windows = process.platform === "win32";
    const npxArgs = ["-y", pkg, ...args];
    result = windows
      ? spawnSync(["npx", ...npxArgs.map(quote)].join(" "), { encoding: "utf8", timeout: RUN_TIMEOUT_MS, shell: true })
      : spawnSync("npx", npxArgs, { encoding: "utf8", timeout: RUN_TIMEOUT_MS });
  }
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function main() {
  const input = readStdin();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Only projects that opted in (ran `ria analyze`) get context; never create .ria/ here.
  if (!existsSync(path.join(cwd, ".ria"))) return;

  const pack = runRia(["agent-pack", cwd, "--max-chars", String(PACK_BUDGET), "--print"]);
  if (!pack || !pack.trim()) return;

  const additionalContext = (PREFIX + pack.trim()).slice(0, CONTEXT_LIMIT);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
}

try {
  main();
} catch {
  // Never fail the session.
}
process.exit(0);
