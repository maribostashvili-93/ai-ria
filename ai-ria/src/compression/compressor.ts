import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  CompressedContext, CompressedContextSchema, ContextFile, ContextPack, ContextPackSchema, RepoMap,
} from "../core/types.js";

/**
 * Rough token estimate. ASCII averages ~4 chars per token; non-ASCII text
 * (Georgian, CJK, emoji, …) tokenizes far denser — ~1.5 chars per token on
 * cl100k-class vocabularies. Still a heuristic, not a real tokenizer.
 */
export function estimateTokens(text: string): number {
  let nonAscii = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) nonAscii++;
  }
  return Math.ceil((text.length - nonAscii) / 4 + nonAscii / 1.5);
}

/** Estimate tokens an agent would spend reading the entire repo raw. */
export function estimateRepoTokens(map: RepoMap): number {
  const textBytes = map.files.filter((f) => f.lines > 0).reduce((sum, f) => sum + f.bytes, 0);
  return Math.ceil(textBytes / 4);
}

function topEntries(record: Record<string, number>, n: number): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Compress a repo map into a one-screen summary block. */
export function compressRepoMap(map: RepoMap): CompressedContext {
  const lines: string[] = [];
  lines.push(`# Repo context: ${map.root.split(/[\\/]/).pop()}`);
  lines.push(`${map.framework} project. ${map.fileCount} files, ${map.totalLines} lines.`);
  if (map.workspaces?.length) {
    const listed = map.workspaces.map((w) => `${w.path} (${w.framework}${w.routes ? `, ${w.routes} routes` : ""})`);
    lines.push(`Monorepo, main app ${map.primaryWorkspace ?? "unknown"}. Workspaces: ${listed.slice(0, 8).join(", ")}${listed.length > 8 ? ", …" : ""}.`);
  }

  const langs = topEntries(map.languages, 5).map(([l, c]) => `${l} (${c})`).join(", ");
  if (langs) lines.push(`Languages: ${langs}.`);
  const dirs = topEntries(map.topLevelDirs, 8).map(([d, c]) => `${d} ${c}`).join(", ");
  if (dirs) lines.push(`Layout: ${dirs}.`);
  if (map.entryPoints.length) lines.push(`Entry points: ${map.entryPoints.join(", ")}.`);
  if (map.routes.length) lines.push(`Routes: ${map.routes.map((r) => r || "/").join(", ")}.`);
  if (map.components.length) lines.push(`Components: ${map.components.length} (${map.components.slice(0, 8).join(", ")}${map.components.length > 8 ? ", …" : ""}).`);
  if (map.dependencies.length) lines.push(`Deps: ${map.dependencies.join(", ")}.`);
  if (map.devDependencies.length) lines.push(`Dev deps: ${map.devDependencies.join(", ")}.`);

  const c = map.conventions;
  const conv: string[] = [c.usesTypeScript ? "TypeScript" : "JavaScript"];
  if (c.hasSrcLayout) conv.push("src/ layout");
  if (c.hasTests) conv.push("has tests");
  if (c.hasDesignDoc) conv.push("has DESIGN.md");
  if (c.packageManager !== "unknown") conv.push(`${c.packageManager} package manager`);
  lines.push(`Conventions: ${conv.join(", ")}.`);

  const summary = lines.join("\n");
  const tokenEstimate = estimateTokens(summary);
  const originalTokenEstimate = Math.max(estimateRepoTokens(map), 1);

  return CompressedContextSchema.parse({
    summary,
    tokenEstimate,
    originalTokenEstimate,
    compressionRatio: Number((tokenEstimate / originalTokenEstimate).toFixed(4)),
  });
}

const MAX_FILES = 30;
const MAX_LINES_PER_FILE = 50;
const SKIP_BYTES = 100_000;

function roleOf(map: RepoMap, p: string): string | null {
  if (map.entryPoints.includes(p)) return "entry point";
  if (p === "package.json" || map.configFiles.includes(p)) return "config";
  if (p === "README.md" || map.importantFiles.includes(p)) return "doc";
  if (map.routes.length && /(^|\/)(pages|app|routes)\//.test(p)) return "route";
  if (map.components.includes(p)) return "component";
  if (map.styles.includes(p)) return "style";
  return null;
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const re = /export\s+(?:default\s+)?(?:async\s+)?(function|const|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g;
  for (const m of content.matchAll(re)) exports.push(`${m[1]} ${m[2]}`);
  return exports;
}

/**
 * v0.1: build a full compressed context pack.
 * Selects important files, removes duplicates, summarizes long files.
 */
export async function buildContextPack(root: string, map: RepoMap): Promise<ContextPack> {
  const absRoot = path.resolve(root);
  const seen = new Set<string>();
  const files: ContextFile[] = [];

  // Priority order: entries → configs → docs → routes → components → styles
  const prioritized = [...map.files].sort((a, b) => {
    const order = ["entry point", "config", "doc", "route", "component", "style"];
    const ra = roleOf(map, a.path);
    const rb = roleOf(map, b.path);
    return (ra ? order.indexOf(ra) : 99) - (rb ? order.indexOf(rb) : 99);
  });

  for (const f of prioritized) {
    if (files.length >= MAX_FILES) break;
    const role = roleOf(map, f.path);
    if (!role || f.lines === 0 || f.bytes > SKIP_BYTES) continue;
    if (/lock|\.min\./.test(f.path)) continue;
    if (/(^|\/)\.env/.test(f.path)) continue; // never put secrets in agent context

    const content = await fs.readFile(path.join(absRoot, f.path), "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    if (seen.has(hash)) continue; // remove duplicate content
    seen.add(hash);

    const lines = content.split("\n");
    let excerpt: string;
    let truncated = false;
    if (lines.length > MAX_LINES_PER_FILE) {
      truncated = true;
      const head = lines.slice(0, MAX_LINES_PER_FILE).join("\n");
      const exports = extractExports(content);
      excerpt = head + `\n… (${lines.length - MAX_LINES_PER_FILE} more lines)` +
        (exports.length ? `\nExports: ${exports.join(", ")}` : "");
    } else {
      excerpt = content.trimEnd();
    }

    files.push({ path: f.path, role, excerpt, truncated, tokens: estimateTokens(excerpt) });
  }

  const summaryCtx = compressRepoMap(map);
  const originalTokenEstimate = Math.max(estimateRepoTokens(map), 1);

  // Enforce the compression budget: the pack must always cost less than
  // reading the repo raw. Drop lowest-priority files until under budget.
  const budget = Math.max(Math.floor(originalTokenEstimate * 0.9) - summaryCtx.tokenEstimate, 0);
  let fileTokens = files.reduce((s, f) => s + f.tokens, 0);
  while (files.length > 1 && fileTokens > budget) {
    const dropped = files.pop()!;
    fileTokens -= dropped.tokens;
  }

  const totalTokens = summaryCtx.tokenEstimate + fileTokens;

  return ContextPackSchema.parse({
    root: absRoot,
    generatedAt: new Date().toISOString(),
    summary: summaryCtx.summary,
    files,
    totalTokens,
    originalTokenEstimate,
    compressionRatio: Number((totalTokens / originalTokenEstimate).toFixed(4)),
  });
}
