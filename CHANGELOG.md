# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] — 2026-11-13

### Fixed

- **Monorepos were described by their tooling root.** Run on a workspace root
  (npm/yarn/bun `workspaces`, pnpm, Turborepo, Lerna, Nx), ai-ria read only the
  root `package.json` and reported `Node, 0 routes` for repos whose app lives in
  `apps/web`. Each workspace is now analyzed on its own; the repo map gains
  `workspaces` and `primaryWorkspace`, and framework, routes and runtime
  dependencies come from the main app. On dubinc/dub: `Node, 0 routes` →
  `Next.js (apps/web), 456 routes`.
- **Components outside `components/` were missed.** Kebab-case files in `ui/`
  folders (`apps/web/ui/`, `packages/ui/`) counted as zero components. `ui/`,
  `widgets/`, `primitives/` and `elements/` folders now count; stories, tests and
  fixture folders do not. On dubinc/dub: 2 → 846 components.
- **Security noise.** Inline SVG namespaces (`xmlns="http://www.w3.org/2000/svg"`)
  were reported as insecure URLs, credentials in URLs to `localhost` were
  reported as critical, and Playwright/Cypress/e2e suites were scanned as
  production code. On dubinc/dub this was 382 findings, 2 of them critical/high,
  all false; now 0. Remote `http://` URLs and remote credentials are still
  flagged.
- The `ria` bin path is written without a leading `./`, which npm 11 flagged
  as invalid when publishing.

## First npm release — 0.2.0 on npm (2026-11-11)

The `ai-ria@0.2.0` package on npm was built from `main` on 2026-11-11 and
already contains everything below, which had been listed as unreleased.

### Added

- **Project inference.** `plan-ui` and `orchestrate` now derive the plan from
  the repository instead of a keyword template: routes become pages, existing
  component files become components to reuse rather than rebuild, the project's
  own CSS custom properties become the palette, and dependencies and file paths
  decide which flows need a security review (`stripe` → payments, `next-auth` →
  sessions, `prisma` → personal data). The template is now a fallback that
  carries greenfield projects only. Every plan records the source of each part
  (`repository routes` vs `template`) in `UI_PLAN.md`, `agent-routing.json` and
  the CLI output, so it can be audited rather than trusted.
- **Stack constraints.** Planning detects what the project already commits to
  across nine concerns — client state, server state, data layer, API shape,
  i18n, testing, styling, UI kit and forms — and turns each into a rule the
  agent must follow ("Every user-facing string goes through next-intl message
  files — never hardcode copy in a component"), with the dependency or file
  that proves it. UI-relevant rules go into `VISUAL_AGENT_PACK.md`; backend
  rules stay out of the visual agent's budget. Stack choices are also listed
  under "Do Not Change" in the generated `DESIGN.md`.
- Dependencies are collected from nested manifests, so monorepos and folders
  with no root `package.json` are covered.
- **Multi-page HTML sites now report their pages.** Routes were only read from a
  framework routes directory (`pages/`, `app/`, `src/routes/`), so a plain HTML
  or Vite MPA project — where `index.html`, `admin.html` and `login.html` *are*
  the pages — reported zero routes and had its plan invented from a template.
  Root-level HTML files are now routes; asset folders, partials, fixtures and
  deeply nested HTML are excluded.
- **`pnpm run ria -- <args>` no longer fails.** npm strips the `--` separator
  before handing arguments to a script; pnpm forwards it as a literal first
  argument, so every command with a required option died with
  "required option '--title <title>' not specified" — including the
  `memory add` call the README told people to run. A leading `--` is now
  dropped, so both package managers behave the same.
- **Packs nest their sections properly.** `AGENT_PACK.md` and the provider packs
  embed whole generated documents, and every one of them started at `#`, so the
  pack was a flat run of h1s with no way to tell a section title from its
  content. Sections are h2 now and embedded documents are pushed below them;
  headings inside fenced code blocks are left alone.
- **SQL files are scanned for secrets.** Migrations and schema dumps carry role
  passwords and connection strings and are committed more often than app config,
  but `.sql` was not in the scannable set. Two rules were added:
  `sql-role-password` (`create role … password '…'`) and
  `connection-string-credentials` (`postgres://user:pass@host`, any scheme).

### Changed

- Template matching weighs the goal above the project description and matches
  whole words. A README mentioning "dashboard" or "platform" used to outvote the
  goal the user typed, and `crm` matched inside `crumbs`.
- `orchestrate` scans the repository once and shares the map with planning,
  compression and the security pass.
- Fixture, test and example paths are now filtered centrally
  (`src/core/fixtures.ts`) and no longer count as evidence anywhere: not for
  security findings, not for the detected stack, not for the component
  inventory. On a real monorepo this removed a plan built on a test fixture's
  API folder and 9 fixture components listed as "reuse these".

### Fixed

- **Design token extraction broke on minified CSS.** A custom property was read
  up to the next `;`, but compact CSS omits the semicolon on the last
  declaration in a block (`:root{--max:1240px}`), so the value swallowed every
  following rule. `DESIGN.md` and `VISUAL_AGENT_PACK.md` then handed agents
  tokens like `--muted: #706e65}*{box-sizing:border-box}html,body{margin:0` as
  design guidance. Values now stop at the end of their block, empty values are
  skipped, and a property redefined later in the same file keeps its first
  definition.
- Tokens defined in several stylesheets were listed once per file. `DESIGN.md`
  now shows one row per token and adds a **Conflicting Definitions** section
  when the same name carries different values in different files.
- CI could not install: pnpm 11 requires Node >= 22.13 while the workflow pinned
  Node 20 to match `engines`. Now installs with pnpm 10 and runs the full verify
  across a Node 20 + 22 matrix, so the declared minimum is actually tested.

## [0.2.0] — 2026-07-29

First public release.

### Added

- **Context compression** — `ria analyze`, `ria compress`, `ria context build`:
  ranked, semantically compressed context packs with a per-run token report.
- **Layered memory** — short / working / deep memory, a searchable JSONL store,
  an importance-weighted memory graph, and conversation compression.
- **Agent handoff** — structured `handoffs/latest.json` + `HANDOFF.md` with
  decisions and design rules injected automatically.
- **Agent pack** — `AGENT_PACK.md`, the single file the next agent reads.
- **Provider packs** — `ria pack claude|cursor|codex|compact|visual|security`,
  each with its own token budget; the pack always states what was dropped.
- **Figma bridge** — API mode plus tokenless import of plugin/MCP exports,
  `figma to-design-md`, and draft code generation.
- **Security intelligence** — secrets, unsafe shell commands, suspicious install
  hooks, prompt injection in agent-instruction files, unpinned dependencies.
  Scan-and-report only; nothing is ever executed.
- **Orchestration** — `ria orchestrate --goal "…"` plans, routes agents and
  builds exactly the packs the routed agents need.
- **Studio** — `ria studio`, a local read-only dashboard over `.ria/` with a
  live JSON API, auto-discovered brand logo and GSAP motion that respects
  `prefers-reduced-motion`.
- **MCP server** — `ria mcp` exposes the tools to any MCP-capable agent.
- **Token accounting** — per-agent ledger, budgets and reports.
- CI (typecheck, lint, build, tests, self security scan), ESLint config,
  `LICENSE`, `CONTRIBUTING.md`.

### Fixed

- **Conversation compression grew the input.** Each line was matched against
  seven category regexes and written to every bucket it matched, so a summary
  could be several times larger than the conversation while still reporting a
  "compression ratio". Lines are now classified into exactly one category
  (explicit labels first, keywords second), near-duplicates collapse, and a
  token budget caps the result. A 1,549-token sample went from 11,017 tokens
  (ratio 7.11) to 102 tokens (ratio 0.066).
- **Security findings were mostly fixtures.** Tests, examples and the scanner's
  own rule definitions were being reported as vulnerabilities, and
  `ria security` exited non-zero on them — so it could never pass CI. Fixture
  paths are excluded by default (`--include-fixtures` restores them), lines
  marked `ria-security-ignore` are skipped, and `--fail-on <severity>` controls
  the exit code. On a 2,280-file project this went from 71 findings
  (13 critical/high) to 5 (3 critical/high).
- **Token savings were counted once per run instead of once per pack.** The
  ledger is append-only, so re-running `orchestrate` kept adding the same saving
  and reported totals larger than the repository itself (31M "saved" tokens for
  a 2.59M-token repo). Totals now describe the current set of packs and are
  stable across re-runs.
- **Duplicate memories.** Memory ids included the creation timestamp, so saving
  the same decision twice always created a new entry and repeated
  `memory compress-conversation` runs flooded the agent pack. Ids are now
  content-addressed and identical entries collapse.
- **Redundant disk scans.** `ria analyze` walked and read the entire repository
  four times (scan, design, security, compression). It now scans once and passes
  the `RepoMap` down.
- Version drift between `package.json`, `ria --version`, `summary.json` and the
  Studio "About" page — all now read a single source.
- Truncated final row in the CLI reference table.

[Unreleased]: https://github.com/maribostashvili-93/ai-ria/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/maribostashvili-93/ai-ria/releases/tag/v0.2.0
