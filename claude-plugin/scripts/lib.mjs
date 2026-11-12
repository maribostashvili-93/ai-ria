// Shared helpers for the AI RIA Claude Code hooks.
//
// Every hook must leave the session alone on failure: these helpers return
// null/empty values instead of throwing, and callers exit 0.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The hook input Claude Code writes to stdin, or {} when it can't be read. */
export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/** The project directory the hook is about. */
export const projectDir = (input) => input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

/** True when the project opted in by running `ria analyze`. Hooks never create .ria/. */
export const hasRia = (dir) => existsSync(path.join(dir, ".ria"));

/** The ai-ria version this plugin release is pinned to: plugin.json's `version`. */
export function pinnedVersion() {
  try {
    return JSON.parse(readFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8")).version;
  } catch {
    return undefined;
  }
}

/**
 * npm's own npx entry next to the running Node (`<node dir>/node_modules/npm/bin/npx-cli.js`
 * on Windows installs). Running it with `node` avoids cmd.exe entirely.
 */
function npxCliBesideNode() {
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  return existsSync(candidate) ? candidate : null;
}

/**
 * Last resort for cmd.exe: arguments can carry user text (a session's task),
 * and cmd.exe expands `%VAR%` and splits on `& | < > ^` even inside quotes.
 * Drop those characters rather than try to escape them.
 */
const quoteForCmd = (arg) => `"${String(arg).replace(/["%^&|<>!\r\n]/g, " ")}"`;

/**
 * Run `ria <args>` and return its stdout, or null on any failure.
 * `AI_RIA_CLI` points at a local ai-ria CLI entry (a .js file) for development
 * and tests; otherwise the pinned version runs through npx.
 */
function spawnRia(args, options) {
  const local = process.env.AI_RIA_CLI;
  if (local) return spawnSync(process.execPath, [local, ...args], options);

  const version = pinnedVersion();
  const npxArgs = ["-y", version ? `ai-ria@${version}` : "ai-ria", ...args];
  if (process.platform !== "win32") return spawnSync("npx", npxArgs, options);

  // npx is a .cmd script on Windows, which Node only starts through a shell.
  // Prefer npm's JS entry so no shell ever sees the arguments.
  const npxCli = npxCliBesideNode();
  return npxCli
    ? spawnSync(process.execPath, [npxCli, ...npxArgs], options)
    : spawnSync(["npx", ...npxArgs.map(quoteForCmd)].join(" "), { ...options, shell: true });
}

export function runRia(args, timeoutMs) {
  const result = spawnRia(args, { encoding: "utf8", timeout: timeoutMs });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

/** Run `ria <args>` with output going straight to this process; returns the exit code. */
export function runRiaInherit(args, timeoutMs) {
  const result = spawnRia(args, { stdio: "inherit", timeout: timeoutMs });
  if (result.error) {
    process.stderr.write(`ai-ria could not run: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

/** Run `fn` and always exit 0: a hook must never fail the session. */
export function runHook(fn) {
  try {
    fn();
  } catch {
    // Never fail the session.
  }
  process.exit(0);
}
