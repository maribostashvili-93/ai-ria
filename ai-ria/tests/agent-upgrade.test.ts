import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.join(__dirname, "..");
const DEMO = path.join(ROOT, "examples", "demo-app");
const FIGMA_EXPORT = path.join(ROOT, "examples", "figma-export.json");
const TMP_PREFIX = path.join(os.tmpdir(), "ai-ria-agent-upgrade-");
const createdDirs: string[] = [];

async function makeProjectCopy(): Promise<string> {
  const dir = await fs.mkdtemp(TMP_PREFIX);
  createdDirs.push(dir);
  // Skip any .ria/ a developer left behind by running the demo by hand —
  // stale artifacts must never change what these tests see.
  await fs.cp(DEMO, dir, { recursive: true, filter: (src) => !src.split(/[\\/]/).includes(".ria") });
  return dir;
}

async function runCli(args: string[], cwd = ROOT): Promise<string> {
  const tsxCli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(ROOT, "src", "cli", "index.ts");
  const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCli, entry, ...args], { cwd });
  return `${stdout}\n${stderr}`;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("agent intelligence upgrade commands", () => {
  it("imports Figma data and writes compact visual-agent artifacts", async () => {
    const project = await makeProjectCopy();

    await runCli(["figma", "import", project, FIGMA_EXPORT]);

    await expect(fs.readFile(path.join(project, ".ria", "figma", "figma-tokens.json"), "utf8")).resolves.toContain("\"colors\"");
    await expect(fs.readFile(path.join(project, ".ria", "figma", "FIGMA_SUMMARY.md"), "utf8")).resolves.toContain("# Figma Summary");
    await expect(fs.readFile(path.join(project, ".ria", "design-memory.json"), "utf8")).resolves.toContain("\"tokens\"");
  });

  it("imports a token-oriented Figma JSON file through the CLI", async () => {
    const project = await makeProjectCopy();
    const tokenFile = path.join(project, "figma-tokens-input.json");
    await fs.writeFile(
      tokenFile,
      JSON.stringify({
        colors: { primary: "#7c3aed" },
        spacing: { stackMd: "12px" },
        radius: { card: "10px" },
        typography: {
          body: { fontFamily: "Inter", fontSize: 18 },
        },
        components: ["Card/Featured"],
      }, null, 2),
      "utf8",
    );

    await runCli(["figma", "import", project, tokenFile]);

    await expect(fs.readFile(path.join(project, ".ria", "figma", "figma-tokens.json"), "utf8")).resolves.toContain("\"spacing\"");
    await expect(fs.readFile(path.join(project, ".ria", "figma", "FIGMA_SUMMARY.md"), "utf8")).resolves.toContain("Card/Featured");
  });

  it("builds conversation compression and layered memory outputs", async () => {
    const project = await makeProjectCopy();
    const conversation = path.join(project, "conversation.txt");
    await fs.writeFile(
      conversation,
      [
        "Decision: keep the shared layout for all room pages.",
        "Completed: implemented auth guard in src/components/ProtectedRoute.jsx",
        "Remaining: add stronger warning copy to the help room",
        "Warning: do not bypass src/context/AuthContext.jsx",
        "Design rule: preserve the existing room card visual style",
        "Security note: never commit demo credentials",
        "Next action: create the final agent pack",
      ].join("\n"),
      "utf8",
    );

    await runCli(["memory", "add", project, "--title", "Keep auth in context", "--content", "Task: Auth cleanup | Reason: Single source of truth", "--type", "architecture", "--files", "src/context/AuthContext.jsx", "--agent", "codex"]);
    await runCli(["handoff", "create", project, "--task", "Auth cleanup", "--completed", "Protected routes", "--remaining", "Session persistence", "--agent", "codex"]);
    await runCli(["memory", "short", project]);
    await runCli(["memory", "deep", project]);
    await runCli(["memory", "compress-conversation", project, conversation]);

    await expect(fs.readFile(path.join(project, ".ria", "memory", "short-memory.md"), "utf8")).resolves.toContain("Latest Decisions");
    await expect(fs.readFile(path.join(project, ".ria", "memory", "working-memory.md"), "utf8")).resolves.toContain("Active Task State");
    await expect(fs.readFile(path.join(project, ".ria", "memory", "deep-memory.md"), "utf8")).resolves.toContain("Full Memory History");
    await expect(fs.readFile(path.join(project, ".ria", "memory", "conversation-summary.md"), "utf8")).resolves.toContain("Decisions");
  });

  it("builds design-pack and agent-pack for next-agent workflows", async () => {
    const project = await makeProjectCopy();

    await runCli(["analyze", project]);
    await runCli(["context", "build", project]);
    await runCli(["memory", "add", project, "--title", "Preserve role-based routing", "--content", "Task: Room navigation | Reason: Avoid privilege leaks", "--type", "decision", "--files", "src/data/routes.js", "--agent", "codex"]);
    await runCli(["handoff", "create", project, "--task", "Room navigation", "--completed", "Route inventory", "--remaining", "UI cleanup", "--agent", "codex", "--next-action", "Read the agent pack before editing routes"]);
    await runCli(["figma", "import", project, FIGMA_EXPORT]);
    await runCli(["design-pack", project]);
    await runCli(["agent-pack", project]);

    await expect(fs.readFile(path.join(project, ".ria", "design", "DESIGN_PACK.md"), "utf8")).resolves.toContain("Design Pack");
    await expect(fs.readFile(path.join(project, ".ria", "agent-pack", "AGENT_PACK.md"), "utf8")).resolves.toContain("AGENT PACK");
    await expect(fs.readFile(path.join(project, ".ria", "agent-pack", "AGENT_PACK.md"), "utf8")).resolves.toContain("Preserve role-based routing");
    await expect(fs.readFile(path.join(project, ".ria", "context", "token-report.json"), "utf8")).resolves.toContain("\"rawTokens\"");
  });

  it("writes a budgeted brief pack and prints it for hooks", async () => {
    const project = await makeProjectCopy();
    await runCli(["analyze", project]);
    await runCli(["handoff", "create", project, "--task", "Checkout cleanup", "--agent", "claude"]);

    const report = await runCli(["agent-pack", project, "--max-chars", "1500"]);
    expect(report).toMatch(/brief: \d+\/1500 characters/);
    const brief = await fs.readFile(path.join(project, ".ria", "agent-pack", "AGENT_PACK_BRIEF.md"), "utf8");
    expect(brief.length).toBeLessThanOrEqual(1500);
    expect(brief).toContain("AGENT PACK (brief)");

    const printed = await runCli(["agent-pack", project, "--max-chars", "1500", "--print"]);
    const rewritten = await fs.readFile(path.join(project, ".ria", "agent-pack", "AGENT_PACK_BRIEF.md"), "utf8");
    expect(printed.trim()).toBe(rewritten.trim());
    expect(printed).not.toContain("wrote");
  });

  it("rejects a budget too small to be useful", async () => {
    const project = await makeProjectCopy();
    await expect(runCli(["agent-pack", project, "--max-chars", "50"])).rejects.toThrow(/at least 1000/);
  });
});
