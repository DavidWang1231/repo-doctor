import path from "node:path";
import { evidence, findFile, findLine } from "../file-system.js";
import { finding, strength } from "../rule-utils.js";

export function checkMaintainability({ files, sourceFiles, profile, findings, strengths, skipped }) {
  checkLargeSourceFiles({ sourceFiles, profile, findings, skipped });

  const todoMatches = [];
  for (const file of sourceFiles) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\b(TODO|FIXME|HACK)\b/i.test(line)) {
        todoMatches.push(evidence(file, index + 1, line.trim().slice(0, 120)));
      }
    });
  }

  if (todoMatches.length >= 10) {
    findings.push(finding({
      id: "todo-debt",
      title: "Many TODO/FIXME markers detected",
      severity: "info",
      category: "maintainability",
      summary: `${todoMatches.length} TODO/FIXME/HACK markers were found in source files.`,
      recommendation: "Convert durable TODOs into issues or remove stale comments.",
      evidence: todoMatches.slice(0, 5)
    }));
  }

  const topLevelDirs = new Set(
    files
      .map((file) => file.path.split("/"))
      .filter((parts) => parts.length > 1)
      .map((parts) => parts[0])
  );

  if (topLevelDirs.has("src") || topLevelDirs.has("lib") || topLevelDirs.has("packages")) {
    strengths.push(strength({
      id: "source-directory-present",
      title: "Source files are organized under conventional directories",
      category: "maintainability",
      summary: "The repository uses src, lib, or packages as a clear home for implementation code.",
      evidence: [evidence([...topLevelDirs].find((dir) => ["src", "lib", "packages"].includes(dir)) + "/", 1)]
    }));
  }
}

function checkLargeSourceFiles({ sourceFiles, profile, findings, skipped }) {
  const largeFiles = sourceFiles
    .filter((file) => file.lines > 500)
    .filter((file) => !isGeneratedOrMinified(file));

  if (largeFiles.length === 0) {
    return;
  }

  const mixedResponsibilityFiles = largeFiles
    .filter((file) => file.lines > 1000)
    .map((file) => ({ file, concerns: detectConcerns(file) }))
    .filter(({ concerns }) => concerns.length >= 2);

  if (!["static-game", "static-site", "docs-only"].includes(profile?.id) && mixedResponsibilityFiles.length > 0) {
    findings.push(finding({
      id: "large-source-files",
      title: "Very large files may mix multiple responsibilities",
      severity: "warning",
      category: "maintainability",
      summary: `${mixedResponsibilityFiles.length} source file(s) exceed 1000 lines and contain signals from multiple responsibility areas. File size alone is not treated as a defect.`,
      recommendation: "Review whether these responsibilities change independently. Split only where a clear module boundary would make changes safer.",
      evidence: mixedResponsibilityFiles.slice(0, 5).map(({ file, concerns }) =>
        evidence(file, 1, `${file.lines} lines; signals: ${concerns.join(", ")}`)
      )
    }));
  }

  const findingPaths = new Set(mixedResponsibilityFiles.map(({ file }) => file.path));
  const contextOnlyFiles = largeFiles.filter((file) => !findingPaths.has(file.path));

  if (contextOnlyFiles.length > 0 || ["static-game", "static-site", "docs-only"].includes(profile?.id)) {
    const observedFiles = ["static-game", "static-site", "docs-only"].includes(profile?.id)
      ? largeFiles
      : contextOnlyFiles;

    skipped.push({
      id: "large-source-files-context-only",
      title: "Large files treated as context only",
      reason: `${observedFiles.length} source file(s) exceed 500 lines, but line count alone is not evidence of poor maintainability and does not affect the score.`
    });
  }
}

function detectConcerns(file) {
  const content = file.content;
  const concernPatterns = [
    ["UI/rendering", /\b(?:document|window|render|component|canvas|getContext)\b|<\w+[\s>]/i],
    ["network/API", /\b(?:fetch|axios|request|response|router|route|listen)\b|https?:\/\//i],
    ["filesystem/process", /\b(?:readFile|writeFile|createReadStream|process\.argv|child_process|subprocess)\b/i],
    ["database/persistence", /\b(?:database|repository|query|transaction|SELECT|INSERT|UPDATE|DELETE)\b/i],
    ["authentication", /\b(?:authenticate|authorization|jwt|session|password|oauth)\b/i],
    ["parsing/serialization", /\b(?:parse|parser|tokenize|serialize|deserialize|JSON\.parse|JSON\.stringify)\b/i]
  ];

  return concernPatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([label]) => label);
}

function isGeneratedOrMinified(file) {
  return /(^|\/)(?:generated|gen)(\/|$)|(?:\.min|\.generated|\.bundle)\.[^.]+$/i.test(file.path);
}

export function checkTypeScript({ rootDir, files, findings, strengths }) {
  const tsconfig = findFile(files, ["tsconfig.json"]);
  const tsFiles = files.filter((file) => file.extension === ".ts" || file.extension === ".tsx");

  if (tsFiles.length === 0) {
    return;
  }

  if (!tsconfig) {
    findings.push(finding({
      id: "tsconfig-missing",
      title: "TypeScript files exist without tsconfig.json",
      severity: "warning",
      category: "maintainability",
      summary: "TypeScript behavior can vary across editors and build tools without an explicit tsconfig.",
      recommendation: "Add tsconfig.json and enable strict mode when practical.",
      evidence: tsFiles.slice(0, 3).map((file) => evidence(file, 1))
    }));
    return;
  }

  try {
    const config = JSON.parse(tsconfig.content);
    if (config.compilerOptions?.strict === true) {
      strengths.push(strength({
        id: "typescript-strict",
        title: "TypeScript strict mode is enabled",
        category: "maintainability",
        summary: "Strict mode improves static guarantees and makes AI-assisted changes easier to verify.",
        evidence: [evidence(tsconfig, findLine(tsconfig, (line) => line.includes('"strict"')))]
      }));
    } else {
      findings.push(finding({
        id: "typescript-strict-disabled",
        title: "TypeScript strict mode is not enabled",
        severity: "info",
        category: "maintainability",
        summary: "The project uses TypeScript but does not enable strict mode.",
        recommendation: "Enable strict mode incrementally or document why it is disabled.",
        evidence: [evidence(tsconfig, findLine(tsconfig, (line) => line.includes("compilerOptions")))]
      }));
    }
  } catch {
    findings.push(finding({
      id: "tsconfig-invalid",
      title: "tsconfig.json is invalid JSON",
      severity: "warning",
      category: "maintainability",
      summary: "Invalid TypeScript configuration can break editor and build behavior.",
      recommendation: "Fix tsconfig.json syntax.",
      evidence: [evidence(path.relative(rootDir, path.join(rootDir, "tsconfig.json")), 1)]
    }));
  }
}
