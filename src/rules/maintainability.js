import path from "node:path";
import { evidence, findFile, findLine } from "../file-system.js";
import { finding, strength } from "../rule-utils.js";

export function checkMaintainability({ files, sourceFiles, findings, strengths }) {
  const largeFiles = sourceFiles.filter((file) => file.lines > 500);
  const hugeFiles = sourceFiles.filter((file) => file.lines > 1000);

  if (hugeFiles.length > 0) {
    findings.push(finding({
      id: "huge-source-files",
      title: "Very large source files detected",
      severity: "critical",
      category: "maintainability",
      summary: `${hugeFiles.length} source file(s) exceed 1000 lines.`,
      recommendation: "Split very large files around cohesive responsibilities and add tests before refactoring.",
      evidence: hugeFiles.slice(0, 5).map((file) => evidence(file, 1, `${file.lines} lines`))
    }));
  } else if (largeFiles.length > 0) {
    findings.push(finding({
      id: "large-source-files",
      title: "Large source files detected",
      severity: "warning",
      category: "maintainability",
      summary: `${largeFiles.length} source file(s) exceed 500 lines.`,
      recommendation: "Review large files for separable modules, especially if they combine IO, parsing, and rendering.",
      evidence: largeFiles.slice(0, 5).map((file) => evidence(file, 1, `${file.lines} lines`))
    }));
  }

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
