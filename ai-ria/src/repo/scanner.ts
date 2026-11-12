import { promises as fs } from "node:fs";
import path from "node:path";
import { RepoMap, RepoMapSchema, FileInfo, Conventions, Framework, Workspace } from "../core/types.js";
import { isFixturePath } from "../core/fixtures.js";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  ".cache", ".turbo", "out", ".vercel", ".idea", ".vscode", ".ria",
]);

export const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md",
  ".css", ".scss", ".less", ".html", ".yml", ".yaml", ".txt",
  ".svelte", ".vue", ".astro", ".py", ".rs", ".go", ".java", ".rb", ".sh", ".env",
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".css": "CSS", ".scss": "CSS", ".less": "CSS",
  ".html": "HTML", ".md": "Markdown", ".json": "JSON",
  ".yml": "YAML", ".yaml": "YAML",
  ".py": "Python", ".rs": "Rust", ".go": "Go", ".java": "Java",
  ".rb": "Ruby", ".sh": "Shell", ".svelte": "Svelte", ".vue": "Vue", ".astro": "Astro",
};

const CONFIG_FILE_PATTERNS = [
  /^package\.json$/, /^tsconfig.*\.json$/, /^vite\.config\./, /^next\.config\./,
  /^astro\.config\./, /^nuxt\.config\./, /^svelte\.config\./, /^tailwind\.config\./,
  /^postcss\.config\./, /^\.eslintrc/, /^eslint\.config\./, /^vitest\.config\./,
  /^jest\.config\./, /^\.prettierrc/, /^pnpm-workspace\.yaml$/, /^turbo\.json$/,
];

const IMPORTANT_FILE_NAMES = new Set([
  "README.md", "DESIGN.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "AGENTS.md",
  "CLAUDE.md", "package.json", ".env", ".env.local", ".env.example",
  "pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb",
]);

async function walk(root: string, dir: string, files: FileInfo[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && !entry.name.startsWith(".env") && !/^\.(gitignore|eslintrc|prettierrc|cursorrules)/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) await walk(root, full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const stat = await fs.stat(full);
    let lines = 0;
    if ((TEXT_EXTS.has(ext) || entry.name.startsWith(".env")) && stat.size < 2_000_000) {
      const content = await fs.readFile(full, "utf8");
      lines = content.length === 0 ? 0 : content.split("\n").length;
    }
    files.push({
      path: path.relative(root, full).split(path.sep).join("/"),
      ext,
      bytes: stat.size,
      lines,
    });
  }
}

async function readPackageJson(root: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(root: string): Promise<Conventions["packageManager"]> {
  if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(root, "yarn.lock"))) return "yarn";
  if (await exists(path.join(root, "bun.lockb"))) return "bun";
  if (await exists(path.join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

const DESIGN_DOC_CANDIDATES = ["DESIGN.md", "design.md", "docs/DESIGN.md", "docs/design.md"];

export async function findDesignDoc(root: string): Promise<string | null> {
  for (const candidate of DESIGN_DOC_CANDIDATES) {
    if (await exists(path.join(root, candidate))) return candidate;
  }
  return null;
}

export function detectFramework(deps: string[], files: FileInfo[]): Framework {
  const has = (d: string) => deps.includes(d);
  if (has("next")) return "Next.js";
  if (has("nuxt")) return "Nuxt";
  if (has("astro")) return "Astro";
  if (has("vue")) return "Vue";
  if (has("svelte") || has("@sveltejs/kit")) return "Svelte";
  if (has("react") || has("react-dom")) return "React";
  if (files.some((f) => f.ext === ".html") && !files.some((f) => f.ext === ".ts" || f.ext === ".tsx")) return "Plain HTML";
  if (files.some((f) => f.path === "package.json")) return "Node";
  return "Unknown";
}

const ROUTE_DIRS = ["pages/", "app/", "src/pages/", "src/app/", "src/routes/"];

/** Directories that hold assets, not pages, even when they contain HTML. */
const NON_PAGE_DIRS = /^(public|static|assets|docs?\/assets)\//i;
/** HTML that is a piece of a page rather than a page (`_partials/`, `x.partial.html`). */
const HTML_PARTIAL = /(^|[/\-_.])_?(partial|fragment|include|snippet|template)s?([/\-_.]|$)/i;
/** `index.html` at the root is a page; `vendor/lib/demo/x.html` is not. */
const MAX_HTML_ROUTE_DEPTH = 2;

const normalize = (rel: string) => "/" + rel.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\/+/, "");

/**
 * Routes of a project.
 *
 * Framework projects declare them in a routes directory. Multi-page sites —
 * plain HTML, Vite MPA, static builders — declare them as HTML files instead:
 * `index.html`, `admin.html`, `login.html` *are* the pages, and ignoring them
 * left those projects reporting zero routes.
 */
export function detectRoutes(files: FileInfo[]): string[] {
  const routes = new Set<string>();
  for (const f of files) {
    if (isFixturePath(f.path)) continue;
    const dir = ROUTE_DIRS.find((d) => f.path.startsWith(d));
    if (!dir) continue;
    if (![".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte", ".astro", ".html"].includes(f.ext)) continue;
    if (/(layout|loading|error|_app|_document|\.test\.|\.spec\.)/.test(f.path)) continue;
    const rel = f.path.slice(dir.length).replace(/\.[a-z]+$/, "").replace(/\/?(index|page)$/, "");
    routes.add(normalize(rel));
  }

  for (const f of files) {
    if (f.ext !== ".html" || isFixturePath(f.path)) continue;
    if (NON_PAGE_DIRS.test(f.path) || HTML_PARTIAL.test(f.path)) continue;
    if (f.path.split("/").length > MAX_HTML_ROUTE_DEPTH) continue;
    if (ROUTE_DIRS.some((d) => f.path.startsWith(d))) continue; // already handled above
    routes.add(normalize(f.path.replace(/\.html$/i, "").replace(/(^|\/)index$/, "")));
  }
  return [...routes].sort();
}

/**
 * Directories that hold UI building blocks. `components/` is only one
 * convention: shadcn-style and monorepo projects keep them in `ui/`
 * (`apps/web/ui/`, `packages/ui/`) with kebab-case file names, which the
 * PascalCase fallback below cannot see.
 */
const COMPONENT_DIRS = /(^|\/)(components?|ui|widgets|primitives|elements)\//i;
/** Storybook stories and similar sidecar files are not components. */
const COMPONENT_SIDECAR = /\.(stories|story|test|spec)\.[a-z]+$/i;

export function detectComponents(files: FileInfo[]): string[] {
  return files
    .filter((f) => {
      if (![".tsx", ".jsx", ".vue", ".svelte"].includes(f.ext)) return false;
      if (isFixturePath(f.path) || COMPONENT_SIDECAR.test(f.path)) return false;
      const base = path.basename(f.path, f.ext);
      return COMPONENT_DIRS.test(f.path) || /^[A-Z][A-Za-z0-9]*$/.test(base);
    })
    .map((f) => f.path)
    .sort();
}

const UI_FRAMEWORKS = new Set<Framework>(["Next.js", "Nuxt", "Astro", "Vue", "Svelte", "React", "Plain HTML"]);
/** `apps/web/package.json` or `packages/ui/package.json` — never deeper. */
const MAX_WORKSPACE_DEPTH = 3;

const depsOf = (pkg: Record<string, unknown> | null): string[] =>
  pkg ? [...Object.keys((pkg.dependencies as object) ?? {}), ...Object.keys((pkg.devDependencies as object) ?? {})] : [];

/** True for npm/yarn/bun workspaces, pnpm workspaces, Turborepo and Lerna roots. */
async function isWorkspaceRoot(root: string, pkg: Record<string, unknown> | null): Promise<boolean> {
  if (pkg && pkg.workspaces) return true;
  for (const marker of ["pnpm-workspace.yaml", "turbo.json", "lerna.json", "nx.json"]) {
    if (await exists(path.join(root, marker))) return true;
  }
  return false;
}

/** The files inside `dir`, with paths made relative to it. */
function filesUnder(files: FileInfo[], dir: string): FileInfo[] {
  const prefix = dir + "/";
  return files.filter((f) => f.path.startsWith(prefix)).map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
}

/**
 * Packages of a monorepo. A workspace root's own package.json usually lists
 * only tooling, so reading it alone reported "Node, 0 routes" for repos whose
 * real app lives in `apps/web`. Each package is analyzed against its own files.
 */
interface DetectedWorkspace {
  workspace: Workspace;
  /** Files of this package, paths relative to its directory. */
  files: FileInfo[];
  runtimeDeps: string[];
}

async function detectWorkspaces(root: string, files: FileInfo[], pkg: Record<string, unknown> | null): Promise<DetectedWorkspace[]> {
  if (!(await isWorkspaceRoot(root, pkg))) return [];
  const dirs = files
    .filter((f) => f.path.endsWith("/package.json"))
    .map((f) => f.path.slice(0, -"/package.json".length))
    .filter((dir) => dir.split("/").length <= MAX_WORKSPACE_DEPTH - 1 && !isFixturePath(dir + "/"));

  const out: DetectedWorkspace[] = [];
  for (const dir of dirs.sort()) {
    const wsPkg = await readPackageJson(path.join(root, dir));
    const wsFiles = filesUnder(files, dir);
    const deps = depsOf(wsPkg);
    const runtimeDeps = Object.keys((wsPkg?.dependencies as object) ?? {});
    out.push({
      workspace: {
        path: dir,
        name: typeof wsPkg?.name === "string" ? wsPkg.name : undefined,
        framework: detectFramework(deps, wsFiles),
        routes: detectRoutes(wsFiles).length,
        // Full paths: the package directory itself (`packages/ui/`) is often the only component signal.
        components: detectComponents(files.filter((f) => f.path.startsWith(dir + "/"))).length,
      },
      files: wsFiles,
      runtimeDeps,
    });
  }
  return out;
}

/**
 * The app that should describe a monorepo: a UI framework package, preferring
 * the one with the most routes, then one under `apps/`, then the largest.
 */
function pickPrimary(workspaces: DetectedWorkspace[]): DetectedWorkspace | undefined {
  return workspaces
    .filter((w) => UI_FRAMEWORKS.has(w.workspace.framework) && w.workspace.framework !== "Plain HTML")
    .sort((a, b) =>
      b.workspace.routes - a.workspace.routes ||
      Number(b.workspace.path.startsWith("apps/")) - Number(a.workspace.path.startsWith("apps/")) ||
      b.files.length - a.files.length,
    )[0];
}

/** Scan a repository and build a structured intelligence map (v0.1). */
export async function scanRepo(root: string): Promise<RepoMap> {
  const absRoot = path.resolve(root);
  const files: FileInfo[] = [];
  await walk(absRoot, absRoot, files);

  const languages: Record<string, number> = {};
  const topLevelDirs: Record<string, number> = {};
  let totalBytes = 0;
  let totalLines = 0;

  for (const f of files) {
    totalBytes += f.bytes;
    totalLines += f.lines;
    const lang = LANGUAGE_BY_EXT[f.ext];
    if (lang) languages[lang] = (languages[lang] ?? 0) + 1;
    const top = f.path.includes("/") ? f.path.split("/")[0] + "/" : "(root)";
    topLevelDirs[top] = (topLevelDirs[top] ?? 0) + 1;
  }

  const pkg = await readPackageJson(absRoot);
  let dependencies = pkg ? Object.keys((pkg.dependencies as object) ?? {}) : [];
  const devDependencies = pkg ? Object.keys((pkg.devDependencies as object) ?? {}) : [];

  // Monorepo: when the root is only tooling, describe the repo by its main app.
  const workspaces = await detectWorkspaces(absRoot, files, pkg);
  let framework = detectFramework(dependencies, files);
  let routes = detectRoutes(files);
  let primaryWorkspace: string | undefined;
  const primary = !UI_FRAMEWORKS.has(framework) || framework === "Plain HTML" ? pickPrimary(workspaces) : undefined;
  if (primary) {
    primaryWorkspace = primary.workspace.path;
    framework = primary.workspace.framework;
    routes = detectRoutes(primary.files);
    dependencies = [...new Set([...dependencies, ...primary.runtimeDeps])];
  }
  const scripts = (pkg?.scripts as Record<string, string>) ?? {};

  const entryPoints: string[] = [];
  for (const candidate of ["src/index.ts", "src/index.js", "src/main.ts", "src/main.tsx", "src/cli/index.ts", "index.ts", "index.js", "index.html"]) {
    if (files.some((f) => f.path === candidate)) entryPoints.push(candidate);
  }
  if (pkg && typeof pkg.main === "string") entryPoints.push(pkg.main);

  const configFiles = files
    .filter((f) => !f.path.includes("/") && CONFIG_FILE_PATTERNS.some((p) => p.test(f.path)))
    .map((f) => f.path)
    .sort();

  const importantFiles = files
    .filter((f) => IMPORTANT_FILE_NAMES.has(path.basename(f.path)) || f.path.startsWith(".env"))
    .map((f) => f.path)
    .sort();

  const styles = files
    .filter((f) => [".css", ".scss", ".less"].includes(f.ext) || /^tailwind\.config\./.test(f.path))
    .map((f) => f.path)
    .sort();

  const designDoc = await findDesignDoc(absRoot);

  const conventions: Conventions = {
    usesTypeScript: files.some((f) => f.ext === ".ts" || f.ext === ".tsx"),
    hasTests: files.some((f) => /(^|\/)(tests?|__tests__)\//.test(f.path) || /\.(test|spec)\.[jt]sx?$/.test(f.path)),
    hasSrcLayout: files.some((f) => f.path.startsWith("src/")),
    packageManager: await detectPackageManager(absRoot),
    hasDesignDoc: designDoc !== null,
  };

  const map: RepoMap = {
    root: absRoot,
    scannedAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes,
    totalLines,
    framework,
    languages,
    topLevelDirs,
    dependencies,
    devDependencies,
    scripts,
    entryPoints: [...new Set(entryPoints)],
    routes,
    components: detectComponents(files),
    styles,
    configFiles,
    importantFiles,
    conventions,
    ...(workspaces.length ? { workspaces: workspaces.map((w) => w.workspace), primaryWorkspace } : {}),
    files,
  };
  return RepoMapSchema.parse(map);
}
