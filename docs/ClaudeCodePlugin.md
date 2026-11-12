# ai-ria Claude Code plugin: გეგმა (0.3.0)

**მიზანი:** ai-ria Claude Code-ში თავისით მუშაობს და ბრძანებების ხელით გაშვება აღარ სჭირდება. სესიის დაწყებისას Claude პროექტის შეკუმშულ აღწერასა და ბოლო handoff-ს იღებს, სესიის ბოლოს კი ახალი handoff იწერება. ერთხელ დაყენების შემდეგ ai-ria ყოველ სესიაში გამოიყენება.

> ეს დოკუმენტი ეყრდნობა Claude Code-ის ოფიციალურ დოკუმენტაციას (plugins reference, hooks reference; code.claude.com/docs, 2026-11-13) და ai-ria 0.2.1-ზე ჩატარებულ გაზომვებს. ის, რაც ჯერ შესამოწმებელია, ცალკეა მონიშნული: **⚠️ შესამოწმებელი**.

---

## 1. რას აკეთებს (მომხმარებლის თვალით)

```text
/plugin marketplace add maribostashvili-93/ai-ria
/plugin install ai-ria@ai-ria
```

ამის შემდეგ:

| როდის | რა ხდება | მომხმარებელი |
|---|---|---|
| სესიის დაწყება | Claude-ს კონტექსტში ავტომატურად ხვდება პროექტის მოკლე აღწერა (≤10k სიმბოლო) და ბოლო handoff | არაფერს აკეთებს |
| `/compact`-მდე | მნიშვნელოვანი გადაწყვეტილებები memory-ში ინახება, რომ შეკუმშვისას არ დაიკარგოს | არაფერს აკეთებს |
| სესიის დასრულება | `.ria/handoffs/HANDOFF.md` ახლდება | არაფერს აკეთებს |
| ნებისმიერ დროს | skills: `/ai-ria:pack`, `/ai-ria:handoff`, `/ai-ria:security`, `/ai-ria:remember` | იძახებს საჭიროებისამებრ |
| ნებისმიერ დროს | MCP tools (`repo_analyze`, `memory_search`, `handoff_load`, `agent_pack`, …) | Claude თვითონ იძახებს |

---

## 2. ფაილების სტრუქტურა

plugin ai-ria-ს რეპოში ცალკე საქაღალდეში იქნება, ხოლო რეპოს root-ი ერთდროულად marketplace იქნება.

```text
ai-ria/                               ← GitHub რეპო
├── .claude-plugin/
│   └── marketplace.json              ← marketplace: "ai-ria", ერთი plugin
├── ai-ria/                           ← npm პაკეტი (უცვლელი)
└── claude-plugin/                    ← plugin-ის root
    ├── .claude-plugin/
    │   └── plugin.json
    ├── hooks/
    │   └── hooks.json
    ├── scripts/
    │   ├── session-start.mjs
    │   ├── pre-compact.mjs
    │   └── session-end.mjs
    ├── skills/
    │   ├── pack/SKILL.md
    │   ├── handoff/SKILL.md
    │   ├── security/SKILL.md
    │   └── remember/SKILL.md
    ├── .mcp.json
    └── README.md
```

**წესები დოკუმენტაციიდან:**
- `plugin.json` მხოლოდ `.claude-plugin/`-შია. ყველაფერი დანარჩენი plugin-ის root-ში დევს.
- ყველა ბილიკი `./`-ით იწყება და plugin-ის საქაღალდიდან ვერ გავა (`..` აკრძალულია).
- სახელი **`ai-ria`** კარგია. `claude-`-ით დაწყებული სახელები Anthropic-ისთვისაა დაჯავშნული, ხოლო `claude` სახელის შიგნით გაფრთხილებას იწვევს.
- ახალ plugin-ებს `commands/`-ის ნაცვლად `skills/` ურჩევენ.
- plugin-ის root-ში `CLAUDE.md` კონტექსტად არ იტვირთება. ინსტრუქციები skill-ებში უნდა ჩაიწეროს.

---

## 3. ფაილები

### `claude-plugin/.claude-plugin/plugin.json`

```json
{
  "name": "ai-ria",
  "displayName": "AI RIA",
  "version": "0.3.0",
  "description": "Context packs, memory and handoffs for Claude Code: your repo compressed into what the agent reads at session start.",
  "author": { "name": "Mariam Bostashvili", "url": "https://github.com/maribostashvili-93" },
  "homepage": "https://github.com/maribostashvili-93/ai-ria#readme",
  "repository": "https://github.com/maribostashvili-93/ai-ria",
  "license": "MIT",
  "keywords": ["context", "memory", "handoff", "tokens", "mcp", "design-tokens"]
}
```

### `claude-plugin/.mcp.json`

```json
{
  "mcpServers": {
    "ai-ria": { "command": "npx", "args": ["-y", "ai-ria@0.3.0", "mcp"] }
  }
}
```

> ვერსია დაფიქსირებულია (`@0.3.0`), რომ plugin-მა და npm პაკეტმა ერთმანეთს არ „უღალატონ“.

### `claude-plugin/hooks/hooks.json`

```json
{
  "description": "AI RIA: load the context pack at session start, save state before compaction and at session end",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/session-start.mjs"], "timeout": 30 }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "manual|auto",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/pre-compact.mjs"], "timeout": 30 }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/session-end.mjs"], "timeout": 10 }
        ]
      }
    ]
  }
}
```

**exec form** (`command` + `args`) აქ შემთხვევით არ არის არჩეული. Windows-ზე ბილიკში შეიძლება სფეისები იყოს (მაგ. `C:\AI ria`), ხოლო exec form-ში ყოველი ბილიკი ერთ არგუმენტად გადაეცემა და ბრჭყალები არ სჭირდება.

---

## 4. Hook-ები: რას აკეთებს თითოეული

ყველა hook stdin-ზე JSON-ს იღებს. შიგ არის `session_id`, `transcript_path`, `cwd` და `hook_event_name`, ხოლო SessionStart-ს დამატებით `source` აქვს.

### 4.1 `session-start.mjs`: კონტექსტის მიწოდება

```text
stdin JSON → cwd
  1. თუ cwd-ში .ria/ არ არის → ჩუმად გასვლა (exit 0, ცარიელი stdout)
       (plugin-ი ყველა პროექტში ძალით არ ქმნის .ria/-ს)
  2. თუ .ria/agent-pack/AGENT_PACK.md 24 საათზე ძველია ან არ არსებობს → `ria agent-pack cwd`
  3. ააწყე ≤ 9 500 სიმბოლოს ტექსტი:
       • პროექტის ნაწილი AGENT_PACK.md-დან (framework, routes, components, conventions)
       • ბოლო handoff (`ria handoff load`)
       • ბოლო გადაწყვეტილებები memory-დან (short-memory.md)
       • ბოლოს: „სრული ვერსია: .ria/agent-pack/AGENT_PACK.md“
  4. stdout: {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext": "..."}}
```

**⚠️ მთავარი შეზღუდვა:** `additionalContext` მაქსიმუმ **10 000 სიმბოლოა**. dub-ის `AGENT_PACK.md` კი **52 898 ბაიტია**, ანუ ხუთჯერ მეტი. ამიტომ ai-ria-ში ახალი ბრძანება ან ფუნქცია გვჭირდება: **„budgeted agent pack“**, რომელიც pack-ს მითითებულ ზომამდე ამოკლებს და ბოლოში წერს, რა ამოიჭრა. ai-ria-ში `pack` ბრძანებას token budget-ები უკვე აქვს, ამიტომ ლოგიკის ნაწილი არსებობს.

**ტექსტის სტილი:** დოკუმენტაცია გვირჩევს `additionalContext` ფაქტების სახით დაიწეროს და არა ბრძანებების. ბრძანებით დაწერილი, სისტემური ტონის ტექსტი შეიძლება prompt injection-ის დაცვამ დაბლოკოს. ამიტომ:
- ✅ „This is a Next.js monorepo; the main app is apps/web. Last session: …“
- ❌ „You MUST read …“, „IGNORE …“

**გაზომილი სიჩქარე:** `agent-pack` 0.3–0.4 წმ, `handoff load` ~0.27 წმ. 30 წამი სრულიად საკმარისია.

### 4.2 `pre-compact.mjs`: გადაწყვეტილებების შენახვა შეკუმშვამდე

```text
stdin JSON → transcript_path, cwd
  1. თუ .ria/ არ არის → exit 0
  2. transcript_path (JSONL) → ბოლო N შეტყობინება → `ria memory compress-conversation cwd <ფაილი>`
  3. stdout: მოკლე ინსტრუქცია compaction summary-სთვის, მაგ. „Keep: decisions recorded in .ria/memory/summary.md“
```

- PreCompact-ის stdout (exit 0) **compaction summary-ის ინსტრუქციად** იქცევა.
- **⚠️ შესამოწმებელი:** `compress-conversation` ახლა ტექსტურ ლოგს კითხულობს. Claude Code-ის transcript JSONL ფორმატშია, ამიტომ adapter გვჭირდება, რომელიც JSONL-იდან user/assistant ტექსტს ამოიღებს. transcript ფაილი ასინქრონულად იწერება და შეიძლება ბოლო ტურს ჩამორჩებოდეს. ეს მისაღებია.

### 4.3 `session-end.mjs`: handoff-ის ჩაწერა

```text
stdin JSON → cwd, transcript_path
  1. თუ .ria/ არ არის → exit 0
  2. სწრაფად: `ria handoff create cwd --task "<ბოლო user prompt-ის პირველი ხაზი>"`
```

**⚠️ დროის ლიმიტი:** SessionEnd hook-ებს ერთობლივად **1.5 წამი** აქვთ. თუ hook-ს უფრო დიდი `timeout` აქვს, ლიმიტი მაქსიმუმ 60 წამამდე იზრდება. ამიტომ `timeout: 10` დავაყენეთ. შემდეგ შესამოწმებელია, რომ `npx`-ის ცივი გაშვება ამ დროში ეტევა. თუ არა, ორი გზა გვაქვს:
- ai-ria-ს `${CLAUDE_PLUGIN_DATA}`-ში ერთხელ დავაყენებთ (`npm install ai-ria@0.3.0`) და პირდაპირ `node`-ით გავუშვებთ, `npx`-ის გარეშე;
- ან SessionEnd-ზე მხოლოდ მინიმალურ JSON-ს ჩავწერთ, ხოლო სრულ handoff-ს შემდეგი SessionStart ააწყობს.

---

## 5. Skills (slash commands)

ყოველი skill-ი არის `skills/<name>/SKILL.md`, frontmatter-ით (`name`, `description`) და ინსტრუქციით Claude-ისთვის. Claude Code სახელებს plugin-ის სახელით ანიჭებს namespace-ს: `/ai-ria:pack`.

| skill | რას აკეთებს |
|---|---|
| `pack` | `npx ai-ria analyze` + `agent-pack` მიმდინარე პროექტზე; აჩვენებს Checklist-ს და pack-ის ზომას |
| `handoff` | ახლავე წერს handoff-ს: რა გაკეთდა, რა დარჩა (`--completed`, `--remaining`) |
| `security` | `ria security`, შედეგები სიმძიმის მიხედვით, მხოლოდ critical/high დეტალურად |
| `remember` | `ria memory add`: მომხმარებლის მიერ ნათქვამ გადაწყვეტილებას memory-ში ინახავს |

---

## 6. ai-ria-ში საჭირო ცვლილებები (npm 0.3.0)

1. **Budgeted agent pack:** `ria agent-pack --max-chars 9500` (ან `--budget`). ამოკლებს თავს-თავის მიხედვით და ბოლოში წერს, რა ამოიჭრა.
2. **Claude transcript adapter:** `compress-conversation`-მა JSONL transcript-იც უნდა მიიღოს.
3. **სწრაფი handoff:** `handoff create`-ს repo-ს ხელახლა სკანირება არ უნდა სჭირდებოდეს. გამოიყენოს არსებული `.ria/`.
4. **ბაგი:** MCP სერვერი თავის ვერსიად ხისტად ჩაწერილ `"0.2.0"`-ს აცხადებს (`src/mcp/server.ts:232`). უნდა გამოიყენოს `VERSION` `core/version.ts`-დან.

---

## 7. ტესტირება

| რა | როგორ |
|---|---|
| manifest | `claude plugin validate ./claude-plugin --strict` (CI-შიც) |
| hook სკრიპტები | vitest: stdin-ზე JSON-ის მიწოდება, stdout-ის და exit code-ის შემოწმება; `.ria/`-ს არარსებობისას ჩუმად გასვლა; `additionalContext` ≤ 10 000 |
| budgeted pack | dub-ზე (52.9KB) → ≤ 9 500 სიმბოლო, ბოლოში „ამოჭრილია: …“ |
| ხელით | `claude --plugin-dir ./claude-plugin` ლოკალურად; სესიის დაწყება, `/compact`, გასვლა; შემოწმება, რომ `.ria/handoffs/HANDOFF.md` განახლდა |
| Windows | ბილიკი სფეისით (`C:\AI ria`) |

---

## 8. გამოქვეყნება

1. **საკუთარი marketplace:** რეპოს root-ში `.claude-plugin/marketplace.json`. მომხმარებელი იყენებს `/plugin marketplace add maribostashvili-93/ai-ria`.
2. **Anthropic-ის დირექტორია:** დოკუმენტაციაში აღწერილია plugin-ის გაგზავნა Anthropic-ის დირექტორიაში. ამისთვის `plugin.json`-ში დაემატება `icon`, `documentationUrl` და `supportUrl`. **⚠️ შესამოწმებელი:** ზუსტი პროცესი და მოთხოვნები, code.claude.com/docs/en/plugins/publish.
3. **README + სტატია:** „ai-ria now loads itself into every Claude Code session“. dev.to-ზე მეორე სტატია, X-ზე განახლება.

---

## 9. ვადები

| დღე | სამუშაო |
|---|---|
| 1–2 | ai-ria: budgeted agent pack, MCP-ის ვერსიის ბაგი, ტესტები |
| 3 | plugin-ის ჩონჩხი: `plugin.json`, `.mcp.json`, `marketplace.json`, `claude plugin validate` |
| 4–5 | `session-start.mjs` + ტესტები; ხელით შემოწმება |
| 6 | `session-end.mjs` (დროის ლიმიტის გაზომვა), `pre-compact.mjs` + transcript adapter |
| 7 | skills (4), README, CHANGELOG |
| 8 | ai-ria 0.3.0 npm-ზე, plugin-ის გამოქვეყნება, სტატია |

---

## 10. რას ვიღებთ Claude for Open Source-ის განაცხადისთვის

- ai-ria Claude Code-ის **plugin-ია**, ანუ პირდაპირ Claude-ის ეკოსისტემის ნაწილია.
- ყოველი სესია = გამოყენება. ერთჯერადი `npx`-ის ნაცვლად ვიღებთ რეგულარულ npm ჩამოტვირთვებს, რადგან MCP სერვერი `npx`-ით ეშვება.
- თუ plugin-ი Anthropic-ის დირექტორიაში მოხვდება, ხილვადობა ბევრად გაიზრდება.
