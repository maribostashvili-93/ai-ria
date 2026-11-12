# AI RIA plugin for Claude Code

Loads a compressed context pack of your repository into every Claude Code
session, so the agent starts with the architecture, routes, components,
conventions, memory and the last handoff instead of re-reading the repo.

## Install

```text
/plugin marketplace add maribostashvili-93/ai-ria
/plugin install ai-ria@ai-ria
```

Then, once per project, generate the `.ria/` folder: run `/ai-ria:pack` in
Claude Code, or from a terminal:

```bash
npx ai-ria analyze .
```

## What it does

| When | What happens |
| --- | --- |
| Session start, resume, `/clear`, after compaction | The project's agent pack, fitted to Claude Code's 10,000-character limit, is added to the context |
| Session end | A handoff is recorded in `.ria/handoffs/`, named after the session's first request, unless one was already written during the session |
| Any time | The `ai-ria` MCP server gives Claude the analysis, memory, handoff, design and security tools |

### Skills

| Skill | What it does |
| --- | --- |
| `/ai-ria:pack` | Analyze the repo and rebuild `.ria/` (run this once per project) |
| `/ai-ria:handoff` | Write a handoff from the conversation: task, done, remaining, warnings |
| `/ai-ria:security` | Scan for committed secrets and unsafe patterns, report only, never repeats a secret's value |
| `/ai-ria:remember` | Save a decision or rule to project memory for future sessions |

Projects without a `.ria/` folder are left alone: the hooks add nothing and
never create files. If ai-ria can't run, the session starts and ends normally.

## Requirements

Node.js ≥ 20. The plugin runs the ai-ria version matching its own
(`npx -y ai-ria@<version>`); the first session downloads it.

## Development

Point the hook at a local build instead of npm:

```bash
AI_RIA_CLI=/path/to/ai-ria/dist/cli/index.js claude --plugin-dir ./claude-plugin
```
