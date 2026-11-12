import { describe, expect, it } from "vitest";
import { demoteHeadings } from "../src/output/markdown.js";
import path from "node:path";
import { scanRepo } from "../src/repo/scanner.js";
import { compressRepoMap, buildContextPack, estimateTokens } from "../src/compression/compressor.js";

const SAMPLE = path.join(__dirname, "..", "examples", "sample-app");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("abcd".repeat(10))).toBe(10);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("compressRepoMap", () => {
  it("produces a summary smaller than the raw repo", async () => {
    const map = await scanRepo(SAMPLE);
    const ctx = compressRepoMap(map);
    expect(ctx.summary).toContain("sample-app");
    expect(ctx.summary).toContain("express");
    expect(ctx.tokenEstimate).toBeLessThan(ctx.originalTokenEstimate);
    expect(ctx.compressionRatio).toBeLessThan(1);
  });

  it("caps long route and dependency lists instead of listing hundreds", async () => {
    const map = await scanRepo(SAMPLE);
    map.routes = Array.from({ length: 456 }, (_, i) => `/page-${i}`);
    map.dependencies = Array.from({ length: 120 }, (_, i) => `dep-${i}`);
    const ctx = compressRepoMap(map);
    const routesLine = ctx.summary.split("\n").find((l) => l.startsWith("Routes")) ?? "";
    expect(routesLine).toContain("Routes (456):");
    expect(routesLine).toContain("/page-39");
    expect(routesLine).not.toContain("/page-40,");
    expect(routesLine).toContain("+416 more in .ria/repo-map.json");
    expect(routesLine.length).toBeLessThan(800);
    expect(ctx.summary).toContain("+90 more");
  });
});

describe("buildContextPack (v0.1)", () => {
  it("selects key files with roles and compresses", async () => {
    const map = await scanRepo(DEMO);
    const pack = await buildContextPack(DEMO, map);
    expect(pack.files.length).toBeGreaterThan(0);
    expect(pack.files.some((f) => f.path === "package.json" && f.role === "config")).toBe(true);
    expect(pack.compressionRatio).toBeLessThan(1);
    expect(pack.totalTokens).toBeGreaterThan(0);
  });

  it("deduplicates identical content and respects limits", async () => {
    const map = await scanRepo(DEMO);
    const pack = await buildContextPack(DEMO, map);
    const paths = pack.files.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(pack.files.length).toBeLessThanOrEqual(30);
  });
});

describe("demoteHeadings", () => {
  it("pushes headings down and caps at h6", () => {
    expect(demoteHeadings("# A\n## B\n###### F", 2)).toBe("### A\n#### B\n###### F");
  });

  it("leaves headings inside fenced code blocks alone", () => {
    const md = ["# Title", "```", "# not a heading", "```", "## After"].join("\n");
    expect(demoteHeadings(md, 1)).toBe(["## Title", "```", "# not a heading", "```", "### After"].join("\n"));
  });

  it("ignores lines that only look like headings", () => {
    expect(demoteHeadings("#nospace\n#", 1)).toBe("#nospace\n#");
  });
});
