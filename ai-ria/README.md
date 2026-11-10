# ai-ria

**AI RIA — Git for AI context and memory.** An intelligence layer for AI coding agents.

[Repository](https://github.com/maribostashvili-93/ai-ria) ·
[Changelog](https://github.com/maribostashvili-93/ai-ria/blob/main/CHANGELOG.md) ·
[Contributing](https://github.com/maribostashvili-93/ai-ria/blob/main/CONTRIBUTING.md) ·
MIT · Node.js ≥ 20

Not another agent: a CLI + MCP server that enters an existing project, compresses its context, keeps persistent agent memory, and builds handoffs and agent packs — so the next AI agent (Claude, Cursor, Codex, …) starts fully informed at a fraction of the token cost. All outputs land in the target repo's **`.ria/`** folder, ready for any agent to consume.

```
Git Repo / Agent Conversation / Figma / DESIGN.md
        ↓
      AI RIA
        ↓
Compressed Agent Pack  (.ria/agent-pack/AGENT_PACK.md)
        ↓
    Next Agent
```

## Core Workflow

```bash
pnpm ria analyze <project>                                    # repo intelligence → .ria/
pnpm ria context build <project>                              # compressed context + token report
pnpm ria memory compress-conversation <project> ./conv.txt    # conversation → durable memory
pnpm ria handoff create <project> --task "Improve checkout"   # handoff for the next agent
pnpm ria design-pack <project>                                # design rules for UI agents
pnpm ria agent-pack <project>                                 # THE file the next agent reads
pnpm ria pack compact <project>                               # budgeted export (claude|cursor|codex|compact)
```

The next agent reads only `.ria/agent-pack/AGENT_PACK.md`. If it needs more, it reads `.ria/memory/deep-memory.md`.

## Install

```bash
npm install -g ai-ria     # then: ria analyze ./my-project
```

Or run it without installing:

```bash
npx ai-ria analyze ./my-project
```

AI RIA makes **no LLM calls** — no API key, no inference cost. It is static
analysis plus bookkeeping, and every run is reproducible.

## Quick Start (clone experience)

```bash
pnpm install
pnpm build

# One command generates the complete .ria/ knowledge folder:
pnpm ria analyze ./examples/demo-app

# Or run the phases individually:
pnpm ria scan ./examples/demo-app
pnpm ria compress ./examples/demo-app
pnpm ria design ./examples/demo-app
pnpm ria security ./examples/demo-app
```

Then point it at your own project:

```bash
pnpm ria analyze ../your-project
```

After that, `your-project/.ria/` contains:

```
.ria/
├── repo-map.json          ← machine-readable repo intelligence
├── repo-summary.md
├── ARCHITECTURE.md        ← agent-readable knowledge map
├── FEATURES.md
├── DESIGN.md              ← generated design contract
├── AGENTS.md              ← working rules for agents
├── AGENT_CONTEXT.md       ← token-cheap entry point for agents
├── context-pack.md/.json  ← compressed full context
├── SECURITY_REPORT.md/.json
└── summary.json           ← one machine-readable rollup
```

`pnpm test` runs the Vitest suite (136 tests). `pnpm dev <command>` runs the CLI without building.

## Using It With Your AI Agent

AI RIA prepares context for other AI agents. After `ria analyze`, tell Cursor / Claude Code / Codex:

> Before editing this project, read `.ria/AGENT_CONTEXT.md`, `.ria/DESIGN.md` and `.ria/ARCHITECTURE.md`. Follow `.ria/AGENTS.md` rules.

The agent gets the whole project's knowledge for a fraction of the tokens instead of re-reading the repo. Real measurement, `ria analyze` on this repository itself: the context pack is ~2,639 tokens vs ~108,345 raw — a ~97% reduction. (`raw` is the cost of reading every text file once; token counts are heuristic estimates, not tokenizer output.)

## Commands by Version

| Version | Command | Output in `.ria/` |
|---|---|---|
| v0.1 Context Engine | `ria context build <path> [--budget N]` | `context/context-pack.md/.json`, `context/token-report.json` — ranked critical files, a reason per keep/drop, raw vs compressed tokens |
| v0.1 Agent Memory | `ria memory add <path> --title "..." [--type decision]` | `memory/memories.jsonl`, `memory/memory-index.json` — types: decision, task, design-rule, architecture-note, warning, security-note, figma-note |
| v0.1 Agent Memory | `ria memory search <path> "query"` / `ria memory list <path>` | search/list over project memory |
| v0.1 Agent Memory | `ria memory short <path>` / `ria memory deep <path>` / `ria memory compress <path>` | `memory/short-memory.md`, `working-memory.md`, `deep-memory.md`, `summary.md` |
| v0.1 Agent Memory | `ria memory compress-conversation <path> <file>` | `memory/conversation-summary.md` + decisions/warnings saved as memories (claude-mem-style observe→compress→store) |
| v0.1 Agent Memory | `ria memory graph <path>` | `memory/memory-graph.json`, `memory/memory-graph.md` — memories, agents, handoff and design memory as a Mermaid thought web (importance-weighted nodes) |
| v0.1 Handoff | `ria handoff create <path> --task "..." [--completed a,b] [--remaining c] [--avoid payment.js] [--next-action "..."]` | `handoffs/latest-handoff.json`, `handoffs/HANDOFF.md` — memory decisions and design rules injected automatically |
| v0.1 Handoff | `ria handoff load <path>` | prints the latest handoff as agent-ready markdown |
| v0.1 Agent Pack | `ria agent-pack <path>` | `agent-pack/AGENT_PACK.md` + `agent-pack.json` — combines context, short memory, handoff, design pack, security warnings |
| v0.1 Provider Packs | `ria pack claude\|cursor\|codex\|compact <path>` | `exports/<PROVIDER>_CONTEXT.md` — per-agent token budgets (12k/8k/6k/2.5k); always says what was removed |
| v0.4 Role Packs | `ria pack visual <path>` / `ria pack security <path>` | `exports/VISUAL_CONTEXT.md` (design pack + Figma summary first, 10k) / `exports/SECURITY_CONTEXT.md` (severity-ordered findings first, 6k) |
| v0.4 Orchestration | `ria orchestrate <path> --goal "..."` | routes agents by goal, builds exactly the packs they need (security pack triggers a fresh scan), writes `orchestration/ORCHESTRATION.md` + knowledge graph |
| v0.4 Knowledge Graph | `ria graph build <path>` | `memory/memory-graph.{json,md}` — memories, agents, handoff, design as an importance-weighted Mermaid graph |
| v0.4 Visual Memory | `ria visual memory <path>` / `ria visual graph <path>` | `visual/{visual-memory.json,component-map.json,VISUAL_MEMORY.md,design-graph.json}` — design decision → component → Figma node → code file → agent task chains (the data layer `ria studio` renders) |
| v0.4 Studio | `ria studio <path> [--port 3333]` | local dashboard at `http://localhost:3333` — Overview, Memory Graph, Agent Routing, Visual Memory, Figma Design, Token Usage, Security, Handoffs, About; live `/api/*` JSON over `.ria/` |
| v0.4 Studio Branding | automatic | brand logo auto-discovered from `assets/` (`airialogo.svg` → `airialogo.png` → `logo.svg` → `logo.png`; package, repo, then project) and used as favicon, sidebar, header, splash and About; GSAP motion (card stagger, graph node entrance, count-up numbers, security pulse) served from local `node_modules`, fully disabled under `prefers-reduced-motion` |
| v0.4 Figma Bridge | `ria figma to-design-md <path>` | imported Figma tokens -> structured `design/DESIGN.md`, merged back into design memory |
| v0.2 Figma Import | `ria figma import <path> <tokens.json>` | `figma/figma-tokens.json`, `figma/FIGMA_SUMMARY.md` + merged into `design-memory.json` (colors, typography, spacing, radius, shadows, components) |
| v0.2 Figma Codegen | `ria figma generate-code <path>` | `figma/generated/` — draft HTML/CSS + Tailwind suggestions (starter code, not production) |
| v0.2 DESIGN.md Bridge | `ria design-md import <path> <DESIGN.md>` / `ria design-pack <path>` | rules + tokens into design memory; `design/DESIGN_PACK.md` for UI agents |
| v0.1 Token Accounting | `ria tokens report <path>` | `tokens/TOKEN_REPORT.md`, `tokens/token-summary.json` — raw vs compressed vs saved tokens, by agent/task/pack, budget warnings |
| v0.1 Token Accounting | `ria tokens agent <path> <name>` / `ria tokens compare <path>` | per-agent usage; pack sizes vs every agent's preferred budget |
| v0.1 Token Accounting | `ria tokens budget <path> --agent claude --limit 200000` | `tokens/budgets.json` — custom token limits per agent |
| v0.2 UI/UX Planning | `ria plan-ui <path> --goal "Build dashboard UI for LMS platform"` | `design/UI_PLAN.md`, `design/DESIGN.md`, `design/DESIGN_PACK.md`, `agent-pack/VISUAL_AGENT_PACK.md`, `orchestration/agent-routing.json` — the plan is **inferred from the repository**: routes become pages, existing component files become components to reuse, the project's CSS custom properties become the palette, and dependencies/paths decide which flows need a security review. A keyword template fills gaps and carries greenfield projects. Every part records its source (`repository routes` vs `template`) |
| v0.2 Design Suggest | `ria design suggest <path> --goal "LMS dashboard"` | style direction + `design/DESIGN.md` + compact visual pack (awesome-design-md / design.md-style structure) |
| v0.4 Orchestrate | `ria orchestrate <path> --goal "..."` | plan + compress + all packs for routed agents + token report in one run |
| v0.1 Repository Scanner | `ria scan <path>` | `repo-map.json`, `repo-summary.md` — framework (Next.js/React/Vue/Astro/…), package manager, routes, components, styles, configs |
| v0.1 Repo Brain | `ria analyze <path>` | the complete `.ria/` folder in one run: `repo-map.json`, `repo-summary.md`, `ARCHITECTURE.md`, `FEATURES.md`, `AGENTS.md`, `AGENT_CONTEXT.md`, `DESIGN.md`, `context-pack.{md,json}`, `SECURITY_REPORT.md`, `security-report.json`, `summary.json` — one disk scan feeds design, security and compression |
| v0.3 Security Brain | `ria security <path> [--fail-on high] [--include-fixtures] [--exclude <patterns>]` | `SECURITY_REPORT.md`, `security-report.json` — secrets, unsafe commands, prompt injection in agent files, unpinned deps. Scan-and-report only, never executes. Tests, examples and fixtures are skipped by default; a line marked `ria-security-ignore` is never reported. `--fail-on` controls the exit code (`critical\|high\|medium\|low\|info\|none`, default `high`) |

## Development

```bash
pnpm install
pnpm run verify    # typecheck + lint + tests
pnpm run build
```

See [CONTRIBUTING.md](https://github.com/maribostashvili-93/ai-ria/blob/main/CONTRIBUTING.md).

## License

MIT © Mariam Bostashvili
