import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";

const REPO = path.join(__dirname, "..", "..");
const PLUGIN = path.join(REPO, "claude-plugin");
const HOOK = path.join(PLUGIN, "scripts", "session-start.mjs");
const END_HOOK = path.join(PLUGIN, "scripts", "session-end.mjs");
const RIA_WRAPPER = path.join(PLUGIN, "scripts", "ria.mjs");
const created: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** A stand-in ai-ria CLI: prints `body` (or fails), and records its arguments. */
async function fakeCli(body: string, exitCode = 0): Promise<{ cli: string; argsFile: string }> {
  const dir = await tempDir("ria-fake-cli-");
  const argsFile = path.join(dir, "args.json");
  const cli = path.join(dir, "cli.mjs");
  await fs.writeFile(cli, [
    `import { writeFileSync } from "node:fs";`,
    `writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));`,
    `process.stdout.write(${JSON.stringify(body)});`,
    `process.exit(${exitCode});`,
  ].join("\n"));
  return { cli, argsFile };
}

function runHook(input: object, env: Record<string, string> = {}, script = HOOK) {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("Claude Code plugin: SessionStart hook", () => {
  it("adds the brief agent pack as additionalContext", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const { cli, argsFile } = await fakeCli("# AGENT PACK (brief)\n\nNext.js app");

    const { status, stdout } = runHook({ hook_event_name: "SessionStart", source: "startup", cwd: project }, { AI_RIA_CLI: cli });

    expect(status).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("# AGENT PACK (brief)");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/^AI RIA context for this repository/);

    const args = JSON.parse(await fs.readFile(argsFile, "utf8"));
    expect(args.slice(0, 2)).toEqual(["agent-pack", project]);
    expect(args).toContain("--print");
    const budget = Number(args[args.indexOf("--max-chars") + 1]);
    expect(budget).toBeGreaterThanOrEqual(9000);
    expect(budget).toBeLessThan(10000);
  });

  it("stays silent in projects without .ria/ and creates nothing", async () => {
    const project = await tempDir("ria-project-");
    const { cli, argsFile } = await fakeCli("should not run");

    const { status, stdout } = runHook({ cwd: project }, { AI_RIA_CLI: cli });

    expect(status).toBe(0);
    expect(stdout).toBe("");
    await expect(fs.access(argsFile)).rejects.toThrow();
    await expect(fs.access(path.join(project, ".ria"))).rejects.toThrow();
  });

  it("never fails the session when ai-ria fails", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const { cli } = await fakeCli("boom", 1);

    const { status, stdout } = runHook({ cwd: project }, { AI_RIA_CLI: cli });

    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("never fails the session on unreadable input", async () => {
    // Without a cwd in the input the hook falls back to its working directory: give it one with .ria/
    // and a fake CLI, so the test never depends on the checkout or reaches npm.
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const { cli } = await fakeCli("# AGENT PACK (brief)");
    const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AI_RIA_CLI: cli };
    delete env.CLAUDE_PROJECT_DIR;
    const result = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", cwd: project, env });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toContain("AGENT PACK");
  });

  it("keeps additionalContext within Claude Code's 10,000-character limit", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const { cli } = await fakeCli("x".repeat(20_000));

    const { stdout } = runHook({ cwd: project }, { AI_RIA_CLI: cli });

    expect(JSON.parse(stdout).hookSpecificOutput.additionalContext.length).toBeLessThanOrEqual(10_000);
  });
});

/** A transcript in Claude Code's JSONL shape: system reminders, tool results, then real prompts. */
async function transcript(dir: string, prompts: string[]): Promise<string> {
  const file = path.join(dir, "transcript.jsonl");
  const entries = [
    { type: "user", message: { content: [{ type: "text", text: "<system-reminder>context</system-reminder>" }] } },
    { type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } },
    { type: "user", isMeta: true, message: { content: "meta entry that is long enough" } },
    { type: "assistant", message: { content: [{ type: "text", text: "Sure, what should we work on today?" }] } },
    ...prompts.map((p) => ({ type: "user", message: { content: p } })),
  ];
  await fs.writeFile(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\nnot json\n");
  return file;
}

describe("Claude Code plugin: SessionEnd hook", () => {
  it("records a handoff named after the first real request", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const t = await transcript(project, ["ok", "Fix the checkout total rounding bug\nIt shows 9.999", "yes"]);
    const { cli, argsFile } = await fakeCli("");

    const { status, stdout } = runHook({ hook_event_name: "SessionEnd", cwd: project, transcript_path: t }, { AI_RIA_CLI: cli }, END_HOOK);

    expect(status).toBe(0);
    expect(stdout).toBe("");
    const args = JSON.parse(await fs.readFile(argsFile, "utf8"));
    expect(args.slice(0, 3)).toEqual(["handoff", "create", project]);
    expect(args[args.indexOf("--task") + 1]).toBe("Fix the checkout total rounding bug");
    expect(args[args.indexOf("--agent") + 1]).toBe("claude-code");
  });

  it("falls back to a generic task when the transcript is missing", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const { cli, argsFile } = await fakeCli("");

    runHook({ cwd: project, transcript_path: path.join(project, "missing.jsonl") }, { AI_RIA_CLI: cli }, END_HOOK);

    const args = JSON.parse(await fs.readFile(argsFile, "utf8"));
    expect(args[args.indexOf("--task") + 1]).toBe("Claude Code session");
  });

  it("does not replace a handoff written during this session", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria", "handoffs"), { recursive: true });
    const t = await transcript(project, ["Refactor the payment service"]);
    // Written after the transcript was created, as /ai-ria:handoff would.
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(project, ".ria", "handoffs", "latest-handoff.json"), "{}");
    const { cli, argsFile } = await fakeCli("");

    const { status } = runHook({ cwd: project, transcript_path: t }, { AI_RIA_CLI: cli }, END_HOOK);

    expect(status).toBe(0);
    await expect(fs.access(argsFile)).rejects.toThrow();
  });

  it("does nothing in projects without .ria/", async () => {
    const project = await tempDir("ria-project-");
    const { cli, argsFile } = await fakeCli("");

    const { status } = runHook({ cwd: project }, { AI_RIA_CLI: cli }, END_HOOK);

    expect(status).toBe(0);
    await expect(fs.access(argsFile)).rejects.toThrow();
  });

  it("exits 0 when ai-ria fails", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const { cli } = await fakeCli("boom", 1);

    expect(runHook({ cwd: project }, { AI_RIA_CLI: cli }, END_HOOK).status).toBe(0);
  });
});

describe("Claude Code plugin: ria.mjs wrapper for skills", () => {
  it("passes arguments through and returns ai-ria's exit code", async () => {
    const ok = await fakeCli("analyzed");
    const okRun = spawnSync(process.execPath, [RIA_WRAPPER, "analyze", "."], { encoding: "utf8", env: { ...process.env, AI_RIA_CLI: ok.cli } });
    expect(okRun.status).toBe(0);
    expect(okRun.stdout).toBe("analyzed");
    expect(JSON.parse(await fs.readFile(ok.argsFile, "utf8"))).toEqual(["analyze", "."]);

    const failing = await fakeCli("", 3);
    const failRun = spawnSync(process.execPath, [RIA_WRAPPER, "security", "."], { encoding: "utf8", env: { ...process.env, AI_RIA_CLI: failing.cli } });
    expect(failRun.status).toBe(3);
  });
});

describe("Claude Code plugin: skills", () => {
  it("each skill has a name and description and uses the pinned wrapper, not a bare npx", async () => {
    const dir = path.join(PLUGIN, "skills");
    const names = await fs.readdir(dir);
    expect(names.sort()).toEqual(["handoff", "pack", "remember", "security"]);
    for (const name of names) {
      const md = await fs.readFile(path.join(dir, name, "SKILL.md"), "utf8");
      const front = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      expect(front).toMatch(new RegExp(`^name: ${name}$`, "m"));
      expect(front).toMatch(/^description: .{40,}$/m);
      expect(md).not.toMatch(/npx\s+(-y\s+)?ai-ria/);
      if (md.includes("ria.mjs")) expect(md).toContain("${CLAUDE_PLUGIN_ROOT}/scripts/ria.mjs");
    }
  });
});

describe("Claude Code plugin: release consistency", () => {
  it("pins the MCP server to the ai-ria version in plugin.json", async () => {
    // The hook reads plugin.json's version; .mcp.json can't, so it repeats it. They must not drift.
    const plugin = JSON.parse(await fs.readFile(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8"));
    const mcp = JSON.parse(await fs.readFile(path.join(PLUGIN, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["ai-ria"].args).toContain(`ai-ria@${plugin.version}`);
  });
});
