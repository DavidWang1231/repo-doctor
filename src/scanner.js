import path from "node:path";
import { runChecks } from "./checks.js";
import { walkRepository } from "./file-system.js";

export async function scanRepository(targetPath = ".", source = null) {
  const rootDir = path.resolve(targetPath);
  const files = await walkRepository(rootDir);
  const stats = buildStats(files);
  const checks = await runChecks({ rootDir, files });

  return {
    tool: {
      name: "Repo Doctor",
      version: "0.1.0"
    },
    project: {
      name: inferProjectName(rootDir, files),
      root: rootDir,
      source: source ?? {
        type: "local",
        input: targetPath
      },
      scannedAt: new Date().toISOString()
    },
    stats,
    score: checks.score,
    categories: checks.categories,
    findings: checks.findings,
    strengths: checks.strengths,
    aiContext: {
      instruction: "Use only the structured evidence in this JSON when writing recommendations. Do not invent missing files, tests, workflows, or vulnerabilities.",
      evidenceContract: "Each finding includes file and line references where Repo Doctor found the signal."
    }
  };
}

function buildStats(files) {
  const languageLines = new Map();
  const languageFiles = new Map();
  let totalLines = 0;
  let totalBytes = 0;

  for (const file of files) {
    totalLines += file.lines;
    totalBytes += file.bytes;
    languageLines.set(file.language, (languageLines.get(file.language) ?? 0) + file.lines);
    languageFiles.set(file.language, (languageFiles.get(file.language) ?? 0) + 1);
  }

  const languages = [...languageFiles.entries()]
    .map(([language, count]) => ({
      language,
      files: count,
      lines: languageLines.get(language) ?? 0
    }))
    .sort((a, b) => b.lines - a.lines || b.files - a.files);

  return {
    files: files.length,
    lines: totalLines,
    bytes: totalBytes,
    languages,
    largestFiles: files
      .filter((file) => file.lines > 0)
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
      .map((file) => ({
        path: file.path,
        lines: file.lines,
        language: file.language
      }))
  };
}

function inferProjectName(rootDir, files) {
  const packageFile = files.find((file) => file.path === "package.json");
  if (packageFile?.content) {
    try {
      const packageJson = JSON.parse(packageFile.content);
      if (packageJson.name) {
        return packageJson.name;
      }
    } catch {
      // Fall back to the directory name below.
    }
  }

  return path.basename(rootDir);
}
