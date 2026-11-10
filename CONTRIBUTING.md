# Contributing to AI RIA

Thanks for taking a look. AI RIA is a CLI-first intelligence layer for AI coding
agents — everything it produces lands in a project's `.ria/` folder.

## Getting set up

```bash
git clone https://github.com/maribostashvili-93/ai-ria.git
cd ai-ria/ai-ria
pnpm install
pnpm run verify        # typecheck + lint + tests
```

Run the CLI without installing it globally:

```bash
pnpm run ria -- analyze ./examples/demo-app
```

## Before opening a pull request

```bash
pnpm run verify
pnpm run build && node dist/cli/index.js security . --fail-on high
```

CI runs exactly these steps plus a build, so a green local run means a green PR.

## Ground rules

**Every number must be honest.** Token counts, compression ratios and savings
percentages are the product. If a change makes a number look better, the test
suite has to prove the number is real — see
`tests/core-engine.test.ts` ("shrinks a repetitive conversation instead of
growing it") and `tests/tokens.test.ts` ("does not multiply savings when the
same pack is rebuilt") for the shape these tests take.

**No noise in security findings.** A finding a maintainer has to dismiss is a
bug. Test fixtures, examples and the scanner's own rule definitions must never
be reported — add a path to `DEFAULT_EXCLUDES` or mark the line
`ria-security-ignore` rather than loosening a rule.

**The tool never executes what it scans.** `ria security` reads and reports.
`ria ui-fix` writes a patch preview, never the file. Keep it that way.

**Token budgets are contracts.** A pack that exceeds its budget must say which
sections were dropped, not silently truncate.

**One disk scan per command.** `scanRepo` reads every text file. Pass the
resulting `RepoMap` down (`analyzeDesign(root, map)`, `scanSecurity(root, { map })`)
instead of rescanning.

## Where help is most useful

| Area | Examples |
| --- | --- |
| Compression | Relevance ranking, preservation rules, better budget packing |
| Memory | Recall quality, graph edges, decay of stale entries |
| Planning | `inference.ts` reads routes, components, tokens and dependencies out of the repo; more signal kinds (state libraries, i18n, test setup, API shape) would sharpen it further |
| Figma bridge | More MCP/plugin export adapters, token extraction fidelity |
| Security | Higher-signal rules, fewer false positives, policy configuration |

## Project layout

```
ai-ria/src/
├── cli/          command surface (commander)
├── core/         paths, shared Zod types, version
├── repo/         scanner + analyzer (the one disk pass)
├── compression/  ranking, semantic compression, token math
├── memory/       store, index, search, layers, graph, handoff, conversation
├── design/       design analysis, DESIGN.md bridge, ui-fix previews
├── figma/        API client, offline import, token normalization, codegen
├── security/     rules + scan (report only)
├── agentpack/    AGENT_PACK.md assembly
├── exports/      per-provider packs with token budgets
├── planning/     UI planning templates
├── orchestration/ goal → agent routing → packs
├── tokens/       ledger, budgets, reports
├── visual/       visual memory + design graph
├── studio/       local dashboard (server + JSON API + embedded UI)
└── mcp/          MCP server exposing the tools to agents
```

## Commit and PR style

- One concern per PR; keep the diff reviewable.
- Add or update a test for any behavior change.
- Update `CHANGELOG.md` under `Unreleased`.
- If you change a number that appears in `README.md`, re-run the command and
  update the README in the same PR.
