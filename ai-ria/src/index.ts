/** Public programmatic API of ai-ria. */
export * from "./core/types.js";
export { ensureRiaDir, writeRiaFile, readRiaFile, RIA_DIR } from "./core/paths.js";
export { scanRepo, detectFramework, detectRoutes, detectComponents, findDesignDoc } from "./repo/scanner.js";
export { generateArchitectureMd, generateFeaturesMd, generateAgentsMd, generateAgentContextMd, buildSummary } from "./repo/analyzer.js";
export { compressRepoMap, buildContextPack, estimateTokens, estimateRepoTokens } from "./compression/compressor.js";
export { scanSecurity, scanContent, scanAgentFile, RULES, INJECTION_RULES } from "./security/scanner.js";
export { analyzeDesign, extractTokens } from "./design/analyzer.js";
export { generateDesignMd, categorizeTokens } from "./design/generator.js";
export { buildUiFixSuggestions, suggestionsToPatch, suggestionsToReport } from "./design/uifix.js";
export { listSkills, getSkill, runSkill } from "./skills/registry.js";
export { FigmaClient, extractFromFigmaFile, figmaSummaryMarkdown, rgbToHex } from "./figma/client.js";
export { compareFigmaToCode, diffToMarkdown } from "./figma/compare.js";
export { toJson } from "./output/json.js";
export { collectAgentPack, agentPackToMarkdown, fitAgentPack, buildAgentPack } from "./agentpack/agent-pack.js";
export type { AgentPackData, AgentPackSection, FittedAgentPack, BuildAgentPackOptions } from "./agentpack/agent-pack.js";
export * from "./output/markdown.js";
