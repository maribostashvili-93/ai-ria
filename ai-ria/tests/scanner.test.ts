import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { scanRepo, detectRoutes, detectComponents } from "../src/repo/scanner.js";
import type { FileInfo } from "../src/core/types.js";

const file = (p: string): FileInfo => ({ path: p, ext: path.extname(p), bytes: 100, lines: 10 });

const SAMPLE = path.join(__dirname, "..", "examples", "sample-app");
const DEMO = path.join(__dirname, "..", "examples", "demo-app");

describe("scanRepo (sample-app)", () => {
  it("builds a repo map", async () => {
    const map = await scanRepo(SAMPLE);
    expect(map.fileCount).toBeGreaterThan(0);
    expect(map.languages["TypeScript"]).toBeGreaterThanOrEqual(2);
    expect(map.dependencies).toContain("express");
    expect(map.entryPoints).toContain("src/index.ts");
  });

  it("detects conventions", async () => {
    const map = await scanRepo(SAMPLE);
    expect(map.conventions.usesTypeScript).toBe(true);
    expect(map.conventions.hasSrcLayout).toBe(true);
    expect(map.conventions.hasDesignDoc).toBe(true);
  });
});

describe("detectRoutes", () => {
  it("treats the pages of a multi-page HTML site as routes", () => {
    const routes = detectRoutes([
      file("index.html"), file("admin.html"), file("login.html"),
      file("styles.css"), file("src/main.jsx"),
    ]);
    expect(routes).toEqual(["/", "/admin", "/login"]);
  });

  it("ignores asset folders, partials, fixtures and deep HTML", () => {
    const routes = detectRoutes([
      file("index.html"),
      file("public/favicon.html"),
      file("_partials/header.html"),
      file("test/fixtures/demo/page.html"),
      file("vendor/lib/docs/example.html"),
      file("a/b/c/deep.html"),
    ]);
    expect(routes).toEqual(["/"]);
  });

  it("still reads framework routes and does not duplicate the index", () => {
    const routes = detectRoutes([file("pages/index.tsx"), file("pages/about.tsx"), file("index.html")]);
    expect(routes).toEqual(["/", "/about"]);
  });
});

describe("detectComponents", () => {
  it("finds kebab-case components in ui/ folders, not only components/", () => {
    const components = detectComponents([
      file("ui/analytics/chart.tsx"),
      file("packages/ui/src/button.tsx"),
      file("components/Header.tsx"),
      file("app/dashboard/page.tsx"),
      file("lib/utils.ts"),
    ]);
    expect(components).toEqual(["components/Header.tsx", "packages/ui/src/button.tsx", "ui/analytics/chart.tsx"]);
  });

  it("skips stories, tests and fixture folders", () => {
    const components = detectComponents([
      file("ui/button.tsx"),
      file("ui/button.stories.tsx"),
      file("ui/button.test.tsx"),
      file("examples/demo/ui/Card.tsx"),
    ]);
    expect(components).toEqual(["ui/button.tsx"]);
  });
});

describe("scanRepo (monorepo)", () => {
  let root: string;
  const write = async (rel: string, content: string) => {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  };

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ria-monorepo-"));
    await write("package.json", JSON.stringify({ name: "root", private: true, workspaces: ["apps/*", "packages/*"], devDependencies: { turbo: "^2.0.0" } }));
    await write("apps/web/package.json", JSON.stringify({ name: "web", dependencies: { next: "15.0.0", react: "19.0.0" } }));
    await write("apps/web/app/page.tsx", "export default function Page() { return null; }");
    await write("apps/web/app/dashboard/page.tsx", "export default function Page() { return null; }");
    await write("apps/web/ui/chart.tsx", "export function Chart() { return null; }");
    await write("packages/ui/package.json", JSON.stringify({ name: "@acme/ui", dependencies: { react: "19.0.0" } }));
    await write("packages/ui/src/button.tsx", "export function Button() { return null; }");
    await write("packages/utils/package.json", JSON.stringify({ name: "@acme/utils" }));
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("describes the repo by its main app instead of the tooling root", async () => {
    const map = await scanRepo(root);
    expect(map.framework).toBe("Next.js");
    expect(map.primaryWorkspace).toBe("apps/web");
    expect(map.routes).toEqual(["/", "/dashboard"]);
    expect(map.dependencies).toContain("next");
  });

  it("lists every workspace with its own framework", async () => {
    const map = await scanRepo(root);
    expect(map.workspaces?.map((w) => [w.path, w.framework, w.components])).toEqual([
      ["apps/web", "Next.js", 1],
      ["packages/ui", "React", 1],
      ["packages/utils", "Node", 0],
    ]);
    expect(map.components).toEqual(["apps/web/ui/chart.tsx", "packages/ui/src/button.tsx"]);
  });

  it("leaves single-package repos without workspace fields", async () => {
    const map = await scanRepo(SAMPLE);
    expect(map.workspaces).toBeUndefined();
    expect(map.primaryWorkspace).toBeUndefined();
  });
});

describe("scanRepo (demo-app, v0.1)", () => {
  it("detects Next.js framework", async () => {
    const map = await scanRepo(DEMO);
    expect(map.framework).toBe("Next.js");
  });

  it("detects routes and components", async () => {
    const map = await scanRepo(DEMO);
    expect(map.routes).toContain("/about");
    expect(map.routes).toContain("/");
    expect(map.components.some((c) => c.endsWith("Button.tsx"))).toBe(true);
  });

  it("detects styles, configs, and important files", async () => {
    const map = await scanRepo(DEMO);
    expect(map.styles.some((s) => s.endsWith("globals.css"))).toBe(true);
    expect(map.configFiles).toContain("tailwind.config.js");
    expect(map.importantFiles).toContain(".env");
    expect(Object.keys(map.scripts)).toContain("deploy");
  });
});
