import { readRiaFile, writeRiaFile } from "../core/paths.js";
import { demoteHeadings } from "../output/markdown.js";
import { estimateTokens } from "../compression/tokenizer.js";
import { compressMemories } from "../memory/memory-compressor.js";
import { loadHandoff, handoffToMarkdown } from "../memory/memory-handoff.js";
import { buildDesignPack } from "../design/designmd.js";

export interface AgentPackSection {
  name: string;
  /** lower = more important; provider packs drop high numbers first */
  priority: number;
  content: string;
}

export interface AgentPackData {
  generatedAt: string;
  sections: AgentPackSection[];
  missing: string[];
  tokens: number;
}

const excerpt = (text: string, maxLines: number) => {
  const lines = text.split("\n");
  return lines.length <= maxLines ? text : lines.slice(0, maxLines).join("\n") + "\n…(see source file for the rest)";
};

/**
 * Collect everything AI RIA knows into ordered sections.
 * AGENT_PACK.md is the one file the next agent reads before editing.
 */
export async function collectAgentPack(root: string): Promise<AgentPackData> {
  const sections: AgentPackSection[] = [];
  const missing: string[] = [];

  const agentContext = await readRiaFile(root, "AGENT_CONTEXT.md");
  if (agentContext) sections.push({ name: "Project", priority: 1, content: excerpt(agentContext, 60) });
  else missing.push("AGENT_CONTEXT.md (run `ria analyze`)");

  const contextPack = (await readRiaFile(root, "context/context-pack.md")) ?? (await readRiaFile(root, "context-pack.md"));
  if (contextPack) sections.push({ name: "Compressed Repo Context", priority: 3, content: excerpt(contextPack, 120) });
  else missing.push("context pack (run `ria context build`)");

  const tokenReport = await readRiaFile(root, "context/token-report.json");
  if (tokenReport) {
    try {
      const r = JSON.parse(tokenReport);
      sections.push({
        name: "Token Report",
        priority: 6,
        content: `~${r.compressedTokens} tokens vs ~${r.rawTokens} raw (ratio ${r.compressionRatio}). Included ${r.includedFiles?.length ?? 0} files, excluded ${r.excludedFiles?.length ?? 0}.`,
      });
    } catch { /* ignore */ }
  }

  const memoryPack = await compressMemories(root);
  if (memoryPack.entryCount > 0) sections.push({ name: "Short Memory", priority: 2, content: memoryPack.markdown });
  else missing.push("memories (use `ria memory add`)");

  const handoff = await loadHandoff(root);
  if (handoff) sections.push({ name: "Latest Handoff", priority: 1, content: handoffToMarkdown(handoff) });
  else missing.push("handoff (run `ria handoff create`)");

  const designPack = await buildDesignPack(root);
  sections.push({ name: "Design Pack", priority: 4, content: excerpt(designPack, 80) });

  const security = await readRiaFile(root, "security-report.json");
  if (security) {
    try {
      const report = JSON.parse(security);
      const serious = (report.findings ?? []).filter((f: { severity: string }) => f.severity === "critical" || f.severity === "high");
      if (serious.length) {
        sections.push({
          name: "Security Warnings",
          priority: 1,
          content: serious.slice(0, 15).map((f: { file: string; line: number; message: string }) => `- ${f.file}:${f.line} — ${f.message}`).join("\n"),
        });
      }
    } catch { /* ignore */ }
  } else missing.push("security report (run `ria security`)");

  const generatedAt = new Date().toISOString();
  const tokens = sections.reduce((sum, s) => sum + estimateTokens(s.content), 0);
  return { generatedAt, sections, missing, tokens };
}

/** Render the full AGENT_PACK.md. */
export function agentPackToMarkdown(data: AgentPackData): string {
  const lines: string[] = [
    "# AGENT PACK",
    "",
    `Generated: ${data.generatedAt} · ~${data.tokens} tokens`,
    "",
    "**Read this file before editing the project.** Deeper context: `.ria/memory/deep-memory.md`, `.ria/context/context-pack.md`.",
    "",
  ];
  for (const s of [...data.sections].sort((a, b) => a.priority - b.priority)) {
    // Section titles are h2; the document embedded under them starts at h3.
    lines.push(`## ${s.name}`, "", demoteHeadings(s.content, 2), "", "---", "");
  }
  if (data.missing.length) {
    lines.push("## Missing Inputs", "", ...data.missing.map((m) => `- ${m}`), "");
  }
  return lines.join("\n");
}

/** Sections at or below this priority are truncated to fit instead of dropped. */
const KEEP_PRIORITY = 2;
/** Smallest useful slice of a section; anything shorter is dropped instead. */
const MIN_SECTION_CHARS = 200;
const FULL_PACK_PATH = ".ria/agent-pack/AGENT_PACK.md";

export interface FittedAgentPack {
  markdown: string;
  /** Sections cut short to fit. */
  truncated: string[];
  /** Sections left out entirely. */
  dropped: string[];
}

/** Cut text at a line boundary so it is at most `max` characters. */
function cutToLines(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastBreak = slice.lastIndexOf("\n");
  return (lastBreak > max / 2 ? slice.slice(0, lastBreak) : slice).trimEnd();
}

/**
 * AGENT_PACK.md within a character budget.
 *
 * Hosts cap injected context (Claude Code's SessionStart `additionalContext`
 * is 10,000 characters), while the full pack of a large repo runs to tens of
 * kilobytes. Sections go in by priority; a high-priority section that does
 * not fit is cut short, a low-priority one is dropped, and the pack ends by
 * naming what was left out and where the full version lives — so the agent
 * knows it is reading a summary, not the whole picture.
 */
export function fitAgentPack(data: AgentPackData, maxChars: number): FittedAgentPack {
  const truncated: string[] = [];
  const dropped: string[] = [];
  const header = [
    "# AGENT PACK (brief)",
    "",
    `Generated: ${data.generatedAt} · budget ${maxChars} characters · full pack: \`${FULL_PACK_PATH}\``,
    "",
    "",
  ].join("\n");
  const footerFor = (t: string[], d: string[]) => {
    if (!t.length && !d.length) return "";
    const parts = [
      t.length ? `shortened: ${t.join(", ")}` : "",
      d.length ? `left out: ${d.join(", ")}` : "",
    ].filter(Boolean);
    return `\n## Not included\n\n${parts.join("; ")}. The full pack is \`${FULL_PACK_PATH}\`.\n`;
  };
  // Reserve room for the longest footer this pack could need: every name listed twice.
  const names = data.sections.map((s) => s.name);
  const worstFooter = footerFor(names, names).length;
  const ELLIPSIS = "\n…\n\n";

  const ordered = [...data.sections].sort((a, b) => a.priority - b.priority).map((s) => {
    const title = `## ${s.name}\n\n`;
    const body = demoteHeadings(s.content, 2);
    return { s, title, body, full: `${title}${body}\n\n` };
  });

  // Important sections share the budget fairly: the short ones go in whole, the
  // long ones split what is left equally. Without this, one huge section (the
  // project summary of a big monorepo) used the whole budget and pushed the
  // handoff out.
  let available = maxChars - header.length - worstFooter;
  const allotment = new Map<string, number>();
  const keep = ordered.filter((o) => o.s.priority <= KEEP_PRIORITY).sort((a, b) => a.full.length - b.full.length);
  keep.forEach((o, i) => {
    const share = Math.floor(available / (keep.length - i));
    const give = Math.min(o.full.length, share);
    allotment.set(o.s.name, give);
    available -= give;
  });

  const blocks: string[] = [];
  for (const o of ordered) {
    if (o.s.priority <= KEEP_PRIORITY) {
      const give = allotment.get(o.s.name) ?? 0;
      if (give >= o.full.length) {
        blocks.push(o.full);
        continue;
      }
      const bodyRoom = give - o.title.length - ELLIPSIS.length;
      if (bodyRoom >= MIN_SECTION_CHARS) {
        blocks.push(`${o.title}${cutToLines(o.body, bodyRoom)}${ELLIPSIS}`);
        truncated.push(o.s.name);
      } else {
        dropped.push(o.s.name);
        available += give;
      }
      continue;
    }
    // Lower-priority sections only use what the important ones left over.
    if (o.full.length <= available) {
      blocks.push(o.full);
      available -= o.full.length;
    } else {
      dropped.push(o.s.name);
    }
  }

  let markdown = header + blocks.join("") + footerFor(truncated, dropped);
  // The reservation above makes this unreachable in practice; keep the budget a hard limit regardless.
  if (markdown.length > maxChars) markdown = cutToLines(markdown, maxChars);
  return { markdown, truncated, dropped };
}

/** `ria agent-pack` — write .ria/agent-pack/AGENT_PACK.md + agent-pack.json. */
export interface BuildAgentPackOptions {
  /** Also write AGENT_PACK_BRIEF.md, fitted to this many characters. */
  maxChars?: number;
}

export async function buildAgentPack(
  root: string,
  options: BuildAgentPackOptions = {},
): Promise<{ data: AgentPackData; files: string[]; markdown: string; brief?: FittedAgentPack }> {
  const data = await collectAgentPack(root);
  const markdown = agentPackToMarkdown(data);
  const files = [
    await writeRiaFile(root, "agent-pack/AGENT_PACK.md", markdown),
    await writeRiaFile(root, "agent-pack/agent-pack.json", JSON.stringify({
      generatedAt: data.generatedAt,
      tokens: data.tokens,
      sections: data.sections.map((s) => ({ name: s.name, priority: s.priority, tokens: estimateTokens(s.content) })),
      missing: data.missing,
    }, null, 2)),
  ];
  let brief: FittedAgentPack | undefined;
  if (options.maxChars !== undefined) {
    brief = fitAgentPack(data, options.maxChars);
    files.push(await writeRiaFile(root, "agent-pack/AGENT_PACK_BRIEF.md", brief.markdown));
  }

  // Token accounting: every pack generation lands in the ledger.
  let rawTokens = data.tokens;
  const tokenReport = await readRiaFile(root, "context/token-report.json");
  if (tokenReport) {
    try {
      rawTokens = Math.max(rawTokens, Number(JSON.parse(tokenReport).rawTokens) || 0);
    } catch { /* ignore */ }
  }
  const { recordPackGeneration } = await import("../tokens/token-ledger.js");
  await recordPackGeneration(root, { agent: "any", task: "agent pack build", pack: "AGENT_PACK.md", rawTokens, compressedTokens: estimateTokens(markdown) });

  return { data, files, markdown, brief };
}
