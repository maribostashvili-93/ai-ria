# AI RIA plugin for Claude Code

Loads a compressed context pack of your repository into every Claude Code
session, so the agent starts with the architecture, routes, components,
conventions, memory and the last handoff instead of re-reading the repo.

## Install

```text
/plugin marketplace add maribostashvili-93/ai-ria
/plugin install ai-ria@ai-ria
```

Then, once per project, generate the `.ria/` folder:

```bash
npx ai-ria analyze .
```

## What it does

| When | What happens |
| --- | --- |
| Session start, resume, `/clear`, after compaction | The project's agent pack, fitted to Claude Code's 10,000-character limit, is added to the context |
| Any time | The `ai-ria` MCP server gives Claude the analysis, memory, handoff, design and security tools |

Projects without a `.ria/` folder are left alone: the hook adds nothing and
never creates files. If ai-ria can't run, the session starts normally.

## Requirements

Node.js ≥ 20. The plugin runs the ai-ria version matching its own
(`npx -y ai-ria@<version>`); the first session downloads it.

## Development

Point the hook at a local build instead of npm:

```bash
AI_RIA_CLI=/path/to/ai-ria/dist/cli/index.js claude --plugin-dir ./claude-plugin
```
