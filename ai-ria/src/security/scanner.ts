import { promises as fs } from "node:fs";
import path from "node:path";
import { RepoMap, SecurityFinding, SecurityReport, SecurityReportSchema } from "../core/types.js";
import { FIXTURE_PATHS, isFixturePath } from "../core/fixtures.js";
import { scanRepo } from "../repo/scanner.js";

interface Rule {
  id: string;
  severity: SecurityFinding["severity"];
  pattern: RegExp;
  message: string;
}

/**
 * Hosts that only resolve on the developer's machine. Credentials and plain
 * http to these are local dev defaults (docker-compose, `.env.example` hints),
 * not leaks — flagging them buried real findings under noise.
 */
const LOCAL_HOST = String.raw`(?:(?:[\w-]+\.)*localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?=[:/'"\s]|$)`;

/**
 * XML namespace identifiers are written as http:// URIs by spec
 * (`xmlns="http://www.w3.org/2000/svg"`) and are never fetched. Every inline
 * SVG in a React app matched the insecure-URL rule before this list.
 */
const XML_NAMESPACE_HOST = String.raw`(?:www\.)?w3\.org/|schemas\.[\w.-]+/|purl\.org/|ns\.adobe\.com/|xmlns\.com/`;

/** Defensive detection rules: secrets and unsafe patterns. Scan-and-report only. */
export const RULES: Rule[] = [
  { id: "aws-access-key", severity: "critical", pattern: /\bAKIA[0-9A-Z]{16}\b/, message: "Possible AWS access key ID committed to source" },
  { id: "private-key-block", severity: "critical", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY/, message: "Private key material in source" },
  { id: "hardcoded-secret", severity: "high", pattern: /(?:api[_-]?key|secret|password|auth[_-]?token)\s*[:=]\s*["'][^"']{8,}["']/i, message: "Possible hardcoded secret — move to environment variables" },
  { id: "eval-usage", severity: "medium", pattern: /\beval\s*\(/, message: "eval() usage — code injection risk" }, // ria-security-ignore
  { id: "insecure-http-url", severity: "low", pattern: new RegExp(String.raw`["']http://(?!${LOCAL_HOST}|${XML_NAMESPACE_HOST})[^"']+["']`), message: "Insecure http:// URL — prefer https://" },
  { id: "curl-pipe-shell", severity: "critical", pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/, message: "Remote script piped into a shell — supply-chain risk" },
  { id: "dangerous-rm", severity: "high", pattern: /\brm\s+-rf\s+(?:\/(?!tmp)|~|\$HOME)/, message: "Destructive rm -rf on home or filesystem root" },
  { id: "world-writable-chmod", severity: "medium", pattern: /\bchmod\s+(?:-R\s+)?777\b/, message: "chmod 777 — world-writable permissions" }, // ria-security-ignore
  { id: "sql-role-password", severity: "critical", pattern: /\b(?:encrypted\s+)?password\s+'[^']{6,}'/i, message: "Database role password in a SQL file — rotate it and move it to a secret store" },
  { id: "connection-string-credentials", severity: "critical", pattern: new RegExp(String.raw`\b[a-z][a-z0-9+.-]*://[^\s:@/'"]+:[^\s@/'"]+@(?!${LOCAL_HOST})`, "i"), message: "Credentials embedded in a connection URL — move them to environment variables" },
];

/** Prompt-injection patterns checked only in agent-instruction files. */
export const INJECTION_RULES: Rule[] = [
  { id: "prompt-injection-override", severity: "high", pattern: /(ignore|disregard|forget)\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts)/i, message: "Instruction-override phrase in agent file — possible prompt injection" },
  { id: "prompt-injection-roleplay", severity: "medium", pattern: /you are now\s+(?!an? (assistant|agent) (for|working))/i, message: "Role-reassignment phrase in agent file" },
  { id: "prompt-injection-exfil", severity: "high", pattern: /(send|post|upload|exfiltrate)\s+[^\n]{0,40}(secrets?|credentials?|tokens?|\.env)/i, message: "Possible data-exfiltration instruction in agent file" },
  { id: "hidden-html-comment-instruction", severity: "medium", pattern: /<!--[^>]*(instruction|ignore|system prompt)[^>]*-->/i, message: "Hidden HTML comment with instructions in agent file" },
];

const AGENT_FILES = /(^|\/)(AGENTS?\.md|CLAUDE\.md|\.cursorrules|copilot-instructions\.md|AGENT_CONTEXT\.md|SYSTEM_PROMPT\.md)$/i;

const SCANNABLE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
  ".yml", ".yaml", ".sh", ".py", ".rb", ".go", ".rs",
  // Migrations and schema dumps routinely carry role passwords and connection
  // strings, and they are committed far more often than application config.
  ".sql",
]);

/**
 * Paths whose findings are fixtures, not production risk — reporting them
 * buries the real findings and makes `ria security` fail CI forever.
 */
export const DEFAULT_EXCLUDES = FIXTURE_PATHS;

/** Lines carrying this marker are skipped — used by rule definitions themselves. */
const IGNORE_MARKER = "ria-security-ignore";

/** True when the file is a fixture/test path that should not produce findings. */
export function isExcludedPath(file: string, extraExcludes: RegExp[] = []): boolean {
  return isFixturePath(file, extraExcludes);
}

function applyRules(file: string, content: string, rules: Rule[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  content.split("\n").forEach((lineText, i) => {
    if (lineText.includes(IGNORE_MARKER)) return;
    for (const rule of rules) {
      if (rule.pattern.test(lineText)) {
        findings.push({
          file,
          line: i + 1,
          rule: rule.id,
          severity: rule.severity,
          message: rule.message,
          snippet: lineText.trim().slice(0, 120),
        });
      }
    }
  });
  return findings;
}

/** Scan a single file's content with the standard rules. Exported for testability. */
export function scanContent(file: string, content: string): SecurityFinding[] {
  return applyRules(file, content, RULES);
}

/** Scan agent-instruction content for prompt-injection patterns. */
export function scanAgentFile(file: string, content: string): SecurityFinding[] {
  return applyRules(file, content, INJECTION_RULES);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export interface SecurityScanOptions {
  /** Reuse an already-built repo map instead of rescanning the disk. */
  map?: RepoMap;
  /** Extra path patterns to exclude on top of `DEFAULT_EXCLUDES`. */
  exclude?: RegExp[];
  /** Scan fixture/test/example paths too (off by default — they are noise). */
  includeFixtures?: boolean;
}

/** v0.3: full security scan. Scan and report only — never executes anything. */
export async function scanSecurity(root: string, options: SecurityScanOptions = {}): Promise<SecurityReport> {
  const absRoot = path.resolve(root);
  const map = options.map ?? (await scanRepo(absRoot));
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;
  const skip = (file: string) => !options.includeFixtures && isExcludedPath(file, options.exclude);

  // 1) Exposed .env files
  const envFiles = map.files.filter((f) => /(^|\/)\.env(\.|$)/.test(f.path) && !f.path.endsWith(".example") && !skip(f.path));
  if (envFiles.length) {
    let gitignore = "";
    if (await exists(path.join(absRoot, ".gitignore"))) {
      gitignore = await fs.readFile(path.join(absRoot, ".gitignore"), "utf8");
    }
    for (const f of envFiles) {
      if (!/(^|\n)\s*\.env/.test(gitignore)) {
        findings.push({
          file: f.path, line: 1, rule: "exposed-env-file", severity: "critical",
          message: ".env file present and not covered by .gitignore — secrets may be committed",
          snippet: f.path,
        });
      }
      // Scan env contents for real-looking values
      const content = await fs.readFile(path.join(absRoot, f.path), "utf8");
      findings.push(...applyRules(f.path, content, RULES.filter((r) => r.id === "aws-access-key" || r.id === "private-key-block")));
    }
  }

  // 2) Code + script files
  for (const f of map.files) {
    if (!SCANNABLE_EXTS.has(f.ext) || skip(f.path)) continue;
    scannedFiles++;
    const content = await fs.readFile(path.join(absRoot, f.path), "utf8");
    findings.push(...scanContent(f.path, content));
  }

  // 3) package.json scripts (unsafe lifecycle / dangerous commands)
  for (const [scriptName, cmd] of Object.entries(map.scripts)) {
    for (const rule of RULES.filter((r) => ["curl-pipe-shell", "dangerous-rm", "world-writable-chmod"].includes(r.id))) {
      if (rule.pattern.test(cmd)) {
        findings.push({
          file: "package.json", line: 1, rule: rule.id, severity: rule.severity,
          message: `${rule.message} (script: "${scriptName}")`, snippet: `${scriptName}: ${cmd}`.slice(0, 120),
        });
      }
    }
    if (/^(pre|post)install$/.test(scriptName) && /\b(curl|wget|node -e|npx )/.test(cmd)) {
      findings.push({
        file: "package.json", line: 1, rule: "suspicious-install-hook", severity: "high",
        message: `Lifecycle script "${scriptName}" downloads or executes code at install time`,
        snippet: `${scriptName}: ${cmd}`.slice(0, 120),
      });
    }
  }

  // 4) Prompt injection in agent-instruction files
  for (const f of map.files) {
    if (!AGENT_FILES.test(f.path) || skip(f.path)) continue;
    scannedFiles++;
    const content = await fs.readFile(path.join(absRoot, f.path), "utf8");
    findings.push(...scanAgentFile(f.path, content));
  }

  // 5) Dependency risk notes
  try {
    const pkgRaw = await fs.readFile(path.join(absRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    for (const [dep, ver] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (ver === "*" || ver === "latest") {
        findings.push({
          file: "package.json", line: 1, rule: "unpinned-dependency", severity: "info",
          message: `Dependency "${dep}" uses floating version "${ver}" — supply-chain risk`, snippet: `${dep}: ${ver}`,
        });
      }
    }
  } catch { /* no package.json */ }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return SecurityReportSchema.parse({ root: absRoot, scannedFiles, findings });
}
