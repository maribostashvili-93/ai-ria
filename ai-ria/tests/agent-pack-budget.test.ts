import { describe, expect, it } from "vitest";
import { fitAgentPack, type AgentPackData } from "../src/agentpack/agent-pack.js";

const lines = (label: string, n: number) => Array.from({ length: n }, (_, i) => `- ${label} line ${i + 1}: some detail about the project`).join("\n");

const pack = (): AgentPackData => ({
  generatedAt: "2026-11-13T00:00:00.000Z",
  tokens: 0,
  missing: [],
  sections: [
    { name: "Project", priority: 1, content: lines("project", 300) },
    { name: "Latest Handoff", priority: 1, content: lines("handoff", 20) },
    { name: "Short Memory", priority: 2, content: lines("memory", 30) },
    { name: "Compressed Repo Context", priority: 3, content: lines("context", 200) },
    { name: "Design Pack", priority: 4, content: lines("design", 100) },
  ],
});

describe("fitAgentPack", () => {
  it("never exceeds the budget", () => {
    for (const max of [1000, 2500, 9500, 20000]) {
      expect(fitAgentPack(pack(), max).markdown.length).toBeLessThanOrEqual(max);
    }
  });

  it("keeps everything when the pack fits", () => {
    const small: AgentPackData = { ...pack(), sections: [{ name: "Project", priority: 1, content: "Next.js app" }] };
    const fitted = fitAgentPack(small, 9500);
    expect(fitted.truncated).toEqual([]);
    expect(fitted.dropped).toEqual([]);
    expect(fitted.markdown).toContain("Next.js app");
    expect(fitted.markdown).not.toContain("## Not included");
  });

  it("shortens high-priority sections and drops low-priority ones", () => {
    const fitted = fitAgentPack(pack(), 9500);
    expect(fitted.truncated).toContain("Project");
    expect(fitted.dropped).toEqual(expect.arrayContaining(["Compressed Repo Context", "Design Pack"]));
    expect(fitted.markdown).toContain("## Project");
  });

  it("keeps the handoff and memory whole when only the project section is huge", () => {
    const fitted = fitAgentPack(pack(), 9500);
    expect(fitted.truncated).toEqual(["Project"]);
    expect(fitted.markdown).toContain("- handoff line 20:");
    expect(fitted.markdown).toContain("- memory line 30:");
  });

  it("splits the budget when several important sections are large", () => {
    const big: AgentPackData = {
      ...pack(),
      sections: [
        { name: "Project", priority: 1, content: lines("project", 300) },
        { name: "Latest Handoff", priority: 1, content: lines("handoff", 300) },
      ],
    };
    const fitted = fitAgentPack(big, 9500);
    expect(fitted.truncated).toEqual(["Project", "Latest Handoff"]);
    const project = fitted.markdown.split("## Project")[1].split("## Latest Handoff")[0].length;
    const handoff = fitted.markdown.split("## Latest Handoff")[1].split("## Not included")[0].length;
    expect(Math.abs(project - handoff)).toBeLessThan(200);
  });

  it("uses leftover room for lower-priority sections", () => {
    const fitted = fitAgentPack(pack(), 60000);
    expect(fitted.truncated).toEqual([]);
    expect(fitted.markdown).toContain("## Compressed Repo Context");
  });

  it("names what it left out and where the full pack is", () => {
    const fitted = fitAgentPack(pack(), 9500);
    expect(fitted.markdown).toContain("## Not included");
    expect(fitted.markdown).toContain("Design Pack");
    expect(fitted.markdown).toContain(".ria/agent-pack/AGENT_PACK.md");
  });

  it("cuts at line boundaries, not mid-line", () => {
    const fitted = fitAgentPack(pack(), 9500);
    const projectBody = fitted.markdown.split("## Project")[1].split("\n…")[0];
    const last = projectBody.trimEnd().split("\n").pop() ?? "";
    expect(last).toMatch(/some detail about the project$/);
  });
});
