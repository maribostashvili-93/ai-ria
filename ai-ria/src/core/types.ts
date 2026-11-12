import { z } from "zod";

/** A single file in the repository map. */
export const FileInfoSchema = z.object({
  path: z.string(),
  ext: z.string(),
  bytes: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
});
export type FileInfo = z.infer<typeof FileInfoSchema>;

/** Detected project conventions. */
export const ConventionsSchema = z.object({
  usesTypeScript: z.boolean(),
  hasTests: z.boolean(),
  hasSrcLayout: z.boolean(),
  packageManager: z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]),
  hasDesignDoc: z.boolean(),
});
export type Conventions = z.infer<typeof ConventionsSchema>;

export const FrameworkSchema = z.enum(["Next.js", "React", "Vue", "Nuxt", "Astro", "Svelte", "Plain HTML", "Node", "Unknown"]);
export type Framework = z.infer<typeof FrameworkSchema>;

/** One package of a monorepo (`apps/web`, `packages/ui`, …). */
export const WorkspaceSchema = z.object({
  path: z.string(),
  name: z.string().optional(),
  framework: FrameworkSchema,
  routes: z.number().int().nonnegative(),
  components: z.number().int().nonnegative(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Structured repository intelligence map (v0.1). */
export const RepoMapSchema = z.object({
  root: z.string(),
  scannedAt: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  framework: FrameworkSchema,
  languages: z.record(z.string(), z.number()),
  topLevelDirs: z.record(z.string(), z.number()),
  dependencies: z.array(z.string()),
  devDependencies: z.array(z.string()),
  scripts: z.record(z.string(), z.string()),
  entryPoints: z.array(z.string()),
  routes: z.array(z.string()),
  components: z.array(z.string()),
  styles: z.array(z.string()),
  configFiles: z.array(z.string()),
  importantFiles: z.array(z.string()),
  conventions: ConventionsSchema,
  /** Monorepo packages; absent for single-package repositories. */
  workspaces: z.array(WorkspaceSchema).optional(),
  /** The workspace whose framework and routes describe the repo (monorepos only). */
  primaryWorkspace: z.string().optional(),
  files: z.array(FileInfoSchema),
});
export type RepoMap = z.infer<typeof RepoMapSchema>;

/** Token-efficient compressed summary (v0.1, summary level). */
export const CompressedContextSchema = z.object({
  summary: z.string(),
  tokenEstimate: z.number().int().nonnegative(),
  originalTokenEstimate: z.number().int().nonnegative(),
  compressionRatio: z.number().nonnegative(),
});
export type CompressedContext = z.infer<typeof CompressedContextSchema>;

/** One file inside a context pack. */
export const ContextFileSchema = z.object({
  path: z.string(),
  role: z.string(),
  excerpt: z.string(),
  truncated: z.boolean(),
  tokens: z.number().int().nonnegative(),
});
export type ContextFile = z.infer<typeof ContextFileSchema>;

/** Full compressed context pack for agents (v0.1). */
export const ContextPackSchema = z.object({
  root: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  files: z.array(ContextFileSchema),
  totalTokens: z.number().int().nonnegative(),
  originalTokenEstimate: z.number().int().nonnegative(),
  compressionRatio: z.number().nonnegative(),
});
export type ContextPack = z.infer<typeof ContextPackSchema>;

/** A security finding (v0.3). */
export const SecurityFindingSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  rule: z.string(),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  message: z.string(),
  snippet: z.string(),
});
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityReportSchema = z.object({
  root: z.string(),
  scannedFiles: z.number().int().nonnegative(),
  findings: z.array(SecurityFindingSchema),
});
export type SecurityReport = z.infer<typeof SecurityReportSchema>;

/** A design token (CSS custom property or Figma token). */
export const DesignTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  source: z.string(),
});
export type DesignToken = z.infer<typeof DesignTokenSchema>;

export const DesignReportSchema = z.object({
  root: z.string(),
  hasDesignDoc: z.boolean(),
  designDocPath: z.string().nullable(),
  hasTailwindConfig: z.boolean(),
  tokens: z.array(DesignTokenSchema),
  tokenCount: z.number().int().nonnegative(),
});
export type DesignReport = z.infer<typeof DesignReportSchema>;

/** Figma extraction results (v0.2). */
export const FigmaTokensSchema = z.object({
  source: z.string(),
  colors: z.array(DesignTokenSchema),
  typography: z.array(z.object({ name: z.string(), fontFamily: z.string(), fontSize: z.number() })),
  radii: z.array(DesignTokenSchema),
  spacing: z.array(DesignTokenSchema),
});
export type FigmaTokens = z.infer<typeof FigmaTokensSchema>;

export const FigmaComponentSchema = z.object({ name: z.string(), type: z.string() });
export type FigmaComponent = z.infer<typeof FigmaComponentSchema>;

/** One check inside a skill run (v0.3). */
export const SkillCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  details: z.string(),
});
export type SkillCheck = z.infer<typeof SkillCheckSchema>;

export const SkillEvidenceSchema = z.object({
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  note: z.string(),
});
export type SkillEvidence = z.infer<typeof SkillEvidenceSchema>;

/** Result of running an agent skill (v0.3). */
export const SkillResultSchema = z.object({
  skill: z.string(),
  root: z.string(),
  passed: z.boolean(),
  checks: z.array(SkillCheckSchema),
  evidence: z.array(SkillEvidenceSchema),
  outputFile: z.string(),
});
export type SkillResult = z.infer<typeof SkillResultSchema>;

/** A registered agent skill definition (v0.3). */
export const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  input: z.string(),
  steps: z.array(z.string()),
  checks: z.array(z.string()),
  output: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

/** Kind of knowledge a memory entry holds (v0.1 Memory Engine). */
export const MemoryTypeSchema = z.enum(["decision", "task", "design-rule", "architecture-note", "warning", "security-note", "figma-note"]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

/** One project-scoped memory entry — what an agent decided and why (v0.1). */
export const MemoryEntrySchema = z.object({
  id: z.string(),
  type: MemoryTypeSchema,
  title: z.string(),
  content: z.string().default(""),
  files: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  agent: z.string().default("unknown"),
  /** 1-10; how much the next agent should care (memory graph node weight) */
  importance: z.number().int().min(1).max(10).default(5),
  createdAt: z.string(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

/** .ria/memory/memory-index.json — fast lookup over all memory entries (v0.1). */
export const MemoryIndexSchema = z.object({
  updatedAt: z.string(),
  count: z.number().int().nonnegative(),
  byType: z.record(z.string(), z.number()),
  entries: z.array(
    z.object({
      id: z.string(),
      type: MemoryTypeSchema,
      title: z.string(),
      tags: z.array(z.string()),
      files: z.array(z.string()),
      createdAt: z.string(),
    }),
  ),
});
export type MemoryIndex = z.infer<typeof MemoryIndexSchema>;

/** A scored memory search hit (v0.1). */
export const MemorySearchHitSchema = z.object({
  entry: MemoryEntrySchema,
  score: z.number().nonnegative(),
});
export type MemorySearchHit = z.infer<typeof MemorySearchHitSchema>;

/** Compressed memory pack — long history distilled, noise removed (v0.1). */
export const MemoryPackSchema = z.object({
  generatedAt: z.string(),
  entryCount: z.number().int().nonnegative(),
  markdown: z.string(),
  tokenEstimate: z.number().int().nonnegative(),
  originalTokenEstimate: z.number().int().nonnegative(),
  compressionRatio: z.number().nonnegative(),
});
export type MemoryPack = z.infer<typeof MemoryPackSchema>;

/** .ria/handoffs/latest-handoff.json — task-scoped view of memory so the next agent resumes losslessly (v0.1). */
export const HandoffSchema = z.object({
  id: z.string(),
  task: z.string(),
  agent: z.string().default("unknown"),
  nextAgent: z.string().default(""),
  createdAt: z.string(),
  completed: z.array(z.string()).default([]),
  remaining: z.array(z.string()).default([]),
  changedFiles: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  nextAction: z.string().default(""),
  memoryRefs: z.array(z.string()).default([]),
  designRules: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  safetyNotes: z.array(z.string()).default([]),
});
export type Handoff = z.infer<typeof HandoffSchema>;

/** .ria/design-memory.json — persistent design knowledge for agents (v0.2). */
export const DesignMemorySchema = z.object({
  updatedAt: z.string(),
  sources: z.array(z.string()),
  rules: z.array(z.string()),
  tokens: z.array(DesignTokenSchema),
  components: z.record(
    z.string(),
    z.object({
      props: z.record(z.string(), z.string()).default({}),
      files: z.array(z.string()).default([]),
    }),
  ),
});
export type DesignMemory = z.infer<typeof DesignMemorySchema>;

/** .ria/summary.json — one machine-readable rollup of everything AI RIA knows. */
export const RiaSummarySchema = z.object({
  tool: z.string(),
  version: z.string(),
  generatedAt: z.string(),
  root: z.string(),
  framework: FrameworkSchema,
  packageManager: z.string(),
  usesTypeScript: z.boolean(),
  counts: z.object({
    files: z.number().int().nonnegative(),
    lines: z.number().int().nonnegative(),
    routes: z.number().int().nonnegative(),
    components: z.number().int().nonnegative(),
    styles: z.number().int().nonnegative(),
    designTokens: z.number().int().nonnegative(),
    securityFindings: z.number().int().nonnegative(),
    criticalOrHigh: z.number().int().nonnegative(),
  }),
  compression: z.object({
    packTokens: z.number().int().nonnegative(),
    rawTokens: z.number().int().nonnegative(),
    ratio: z.number().nonnegative(),
  }),
  generatedFiles: z.array(z.string()),
});
export type RiaSummary = z.infer<typeof RiaSummarySchema>;
