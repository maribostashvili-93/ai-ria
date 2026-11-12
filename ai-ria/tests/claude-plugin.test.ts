import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";

const REPO = path.join(__dirname, "..", "..");
const PLUGIN = path.join(REPO, "claude-plugin");
const HOOK = path.join(PLUGIN, "scripts", "session-start.mjs");
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

function runHook(input: object, env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [HOOK], {
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

  it("never fails the session on unreadable input", () => {
    const result = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN } });
    expect(result.status).toBe(0);
  });

  it("keeps additionalContext within Claude Code's 10,000-character limit", async () => {
    const project = await tempDir("ria-project-");
    await fs.mkdir(path.join(project, ".ria"));
    const { cli } = await fakeCli("x".repeat(20_000));

    const { stdout } = runHook({ cwd: project }, { AI_RIA_CLI: cli });

    expect(JSON.parse(stdout).hookSpecificOutput.additionalContext.length).toBeLessThanOrEqual(10_000);
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
