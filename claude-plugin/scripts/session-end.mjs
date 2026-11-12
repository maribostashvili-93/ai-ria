#!/usr/bin/env node
// AI RIA — Claude Code SessionEnd hook.
//
// Records a handoff in `.ria/handoffs/` so the next session (Claude Code,
// Cursor, Codex…) knows what this one was about. Older handoffs stay in the
// history; only the "latest" pointer moves.
//
// It does not overwrite a handoff written during this session (for example
// with /ai-ria:handoff, which carries completed/remaining items): an automatic
// one-line handoff would replace a better one.

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { hasRia, projectDir, readHookInput, runHook, runRia } from "./lib.mjs";

/** SessionEnd hooks share a short budget; hooks.json raises it with `timeout`. */
const RUN_TIMEOUT_MS = 12_000;
const MAX_TASK_CHARS = 120;
const MIN_PROMPT_CHARS = 15;
const FALLBACK_TASK = "Claude Code session";

/** Text of a user transcript entry, or "" for tool results and system messages. */
function userText(entry) {
  if (entry?.type !== "user" || entry.isMeta) return "";
  const content = entry.message?.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content) ? content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : "";
  // System reminders, slash-command wrappers and similar arrive as tagged text.
  if (!text || text.trimStart().startsWith("<")) return "";
  return text.trim();
}

/**
 * The session's task, best effort: the first real user request in the
 * transcript. The transcript format is internal to Claude Code, so anything
 * unexpected falls back to a generic label instead of failing.
 */
function taskFromTranscript(transcriptPath) {
  if (!transcriptPath) return FALLBACK_TASK;
  try {
    for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const text = userText(entry);
      if (text.length >= MIN_PROMPT_CHARS) {
        const first = text.split("\n")[0].trim();
        return first.length > MAX_TASK_CHARS ? `${first.slice(0, MAX_TASK_CHARS - 1)}…` : first;
      }
    }
  } catch { /* unreadable transcript */ }
  return FALLBACK_TASK;
}

/** True when a handoff was already written after this session began. */
function handoffWrittenThisSession(cwd, transcriptPath) {
  try {
    const latest = statSync(path.join(cwd, ".ria", "handoffs", "latest-handoff.json")).mtimeMs;
    const sessionStart = statSync(transcriptPath).birthtimeMs || statSync(transcriptPath).ctimeMs;
    return latest >= sessionStart;
  } catch {
    return false;
  }
}

runHook(() => {
  const input = readHookInput();
  const cwd = projectDir(input);
  if (!hasRia(cwd)) return;
  if (input.transcript_path && handoffWrittenThisSession(cwd, input.transcript_path)) return;

  const task = taskFromTranscript(input.transcript_path);
  runRia(["handoff", "create", cwd, "--task", task, "--agent", "claude-code"], RUN_TIMEOUT_MS);
});
