import { evidence, findLine } from "../file-system.js";
import { isStaticShowcaseProfile } from "../profile.js";
import { finding, skipped, strength } from "../rule-utils.js";

const ENV_REFERENCE_PATTERN = /process\.env(?:\.|\[)|os\.environ(?:\.|\[|\.get)|Deno\.env\.get|getenv\(/;

export function checkEnv({ files, sourceFiles, envExample, envFiles, findings, strengths }) {
  const referencesEnv = sourceFiles.some((file) => ENV_REFERENCE_PATTERN.test(file.content));

  if (referencesEnv && !envExample) {
    findings.push(finding({
      id: "env-example-missing",
      title: "Environment variables are used without an example file",
      severity: "warning",
      category: "documentation",
      summary: "The code references environment variables, but contributors do not have a safe template to copy.",
      recommendation: "Add .env.example with variable names and non-secret placeholder values.",
      evidence: sourceFiles
        .filter((file) => ENV_REFERENCE_PATTERN.test(file.content))
        .slice(0, 3)
        .map((file) => evidence(file, findLine(file, (line) => ENV_REFERENCE_PATTERN.test(line)))),
      fixable: true
    }));
  }

  if (envFiles.length > 0) {
    findings.push(finding({
      id: "env-file-committed",
      title: "Potential local environment file is committed",
      severity: "critical",
      category: "security",
      summary: "Committed .env files frequently contain credentials or machine-specific configuration.",
      recommendation: "Remove committed .env files, rotate any exposed secrets, and keep only .env.example.",
      evidence: envFiles.slice(0, 5).map((file) => evidence(file, 1))
    }));
  }

  if (referencesEnv && envExample) {
    strengths.push(strength({
      id: "env-example-present",
      title: "Environment template is present",
      category: "documentation",
      summary: "The repository uses environment variables and provides a safe example file.",
      evidence: [evidence(envExample, 1)]
    }));
  }

  const ignoredEnv = files.find((file) => file.path === ".gitignore" && /^\.env$/m.test(file.content));
  if (ignoredEnv) {
    strengths.push(strength({
      id: "env-ignored",
      title: "Local .env files are ignored",
      category: "security",
      summary: ".gitignore includes a rule for local .env files.",
      evidence: [evidence(ignoredEnv, findLine(ignoredEnv, (line) => line.trim() === ".env"))]
    }));
  }
}

export async function checkSecurityPatterns({ sourceFiles, profile, findings, skipped: skippedItems }) {
  const secretMatches = [];
  const riskyRuntimeMatches = [];
  const skippedRuntimeMatches = [];

  for (const file of sourceFiles) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/(api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}/i.test(line)) {
        secretMatches.push(evidence(file, index + 1, "Potential hard-coded credential pattern."));
      }

      if (/\beval\s*\(|new Function\s*\(|child_process\.exec\s*\(/.test(line)) {
        const entry = evidence(file, index + 1, "Dynamic execution pattern.");
        if (isStaticShowcaseProfile(profile) && isLocalToolingFile(file)) {
          skippedRuntimeMatches.push(entry);
        } else {
          riskyRuntimeMatches.push(entry);
        }
      }
    });
  }

  if (secretMatches.length > 0) {
    findings.push(finding({
      id: "possible-secret",
      title: "Potential hard-coded secret detected",
      severity: "critical",
      category: "security",
      summary: "Secret-like values appear in source code.",
      recommendation: "Move credentials to environment variables or a secret manager, then rotate any exposed values.",
      evidence: secretMatches.slice(0, 5)
    }));
  }

  if (riskyRuntimeMatches.length > 0) {
    findings.push(finding({
      id: "dynamic-execution",
      title: "Dynamic code execution pattern detected",
      severity: "warning",
      category: "security",
      summary: "Dynamic execution is sometimes necessary, but it creates injection and sandboxing risk.",
      recommendation: "Review these call sites and ensure untrusted input cannot reach them.",
      evidence: riskyRuntimeMatches.slice(0, 5)
    }));
  }

  if (skippedRuntimeMatches.length > 0) {
    skippedItems.push(skipped({
      id: "dynamic-tooling-not-runtime",
      title: "Dynamic execution in local tooling not treated as runtime risk",
      category: "security",
      reason: "This profile is a static browser project, so dynamic execution in scripts or tools is not scored like code shipped to users. Review it manually if it handles untrusted input.",
      evidence: skippedRuntimeMatches.slice(0, 5)
    }));
  }
}

function isLocalToolingFile(file) {
  return /^(scripts|tools|tasks|bin|\.github)\//i.test(file.path);
}
