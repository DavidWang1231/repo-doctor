import { findFile, findFiles, readJsonFile, evidence } from "./file-system.js";
import { detectProjectProfile } from "./profile.js";
import { finding, isTestPath } from "./rule-utils.js";
import { calculateOverallScore, scoreCategories, sortFindings } from "./scoring.js";
import {
  checkCi,
  checkDocker,
  checkOpenSourceFiles,
  checkPackageScripts,
  checkReadme,
  checkReadmeScripts,
  checkTesting
} from "./rules/project-hygiene.js";
import { checkEnv, checkSecurityPatterns } from "./rules/security.js";
import { checkMaintainability, checkTypeScript } from "./rules/maintainability.js";

export async function runChecks({ rootDir, files, profileOverride = null }) {
  const findings = [];
  const strengths = [];
  const skipped = [];
  const context = buildContext({ rootDir, files, findings, strengths, skipped, profileOverride });

  if (context.packageFile) {
    try {
      context.packageJson = await readJsonFile(context.packageFile.absolutePath);
    } catch (error) {
      findings.push(finding({
        id: "package-json-invalid",
        title: "package.json is not valid JSON",
        severity: "critical",
        category: "maintainability",
        summary: "Node tooling cannot reliably install, test, or publish this project while package.json is invalid.",
        recommendation: "Fix the JSON syntax and rerun Repo Doctor.",
        evidence: [evidence(context.packageFile, 1, error.message)]
      }));
    }
  }

  context.profile = detectProjectProfile(context);
  runProjectHygieneChecks(context);
  runSecurityChecks(context);
  runMaintainabilityChecks(context);

  const categories = scoreCategories(findings);

  return {
    score: calculateOverallScore(categories),
    categories,
    findings: sortFindings(findings),
    strengths,
    skipped,
    profile: context.profile
  };
}

function buildContext({ rootDir, files, findings, strengths, skipped, profileOverride }) {
  const sourceFiles = files.filter((file) =>
    [".js", ".jsx", ".mjs", ".ts", ".tsx", ".py", ".go", ".rs", ".rb", ".php", ".java"].includes(file.extension)
  );

  return {
    rootDir,
    files,
    findings,
    strengths,
    skipped,
    profile: null,
    profileOverride,
    packageFile: findFile(files, ["package.json"]),
    packageJson: null,
    readmeFile: files.find((file) => /^readme\.(md|txt)$/i.test(file.path)),
    licenseFile: files.find((file) => /^licen[sc]e(\.|$)/i.test(file.path)),
    contributingFile: files.find((file) => /^contributing\.(md|txt)$/i.test(file.path)),
    securityFile: files.find((file) => /^security\.(md|txt)$/i.test(file.path)),
    gitignoreFile: findFile(files, [".gitignore"]),
    dockerfile: findFile(files, ["Dockerfile", "dockerfile"]),
    composeFile: findFile(files, ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]),
    workflowFiles: findFiles(files, (file) => /^\.github\/workflows\/.+\.ya?ml$/i.test(file.path)),
    testFiles: findFiles(files, (file) => isTestPath(file.path)),
    envExample: findFile(files, [".env.example", ".env.sample"]),
    envFiles: findFiles(files, (file) => /^\.env(\.|$)/i.test(file.path) && file.path !== ".env.example"),
    sourceFiles,
    productionSourceFiles: sourceFiles.filter((file) => !isTestPath(file.path))
  };
}

function runProjectHygieneChecks(context) {
  checkReadme(context);
  checkPackageScripts(context);
  checkReadmeScripts(context);
  checkTesting(context);
  checkCi(context);
  checkOpenSourceFiles(context);
  checkDocker(context);
}

function runSecurityChecks(context) {
  checkEnv({
    ...context,
    sourceFiles: context.productionSourceFiles
  });
  checkSecurityPatterns({
    ...context,
    sourceFiles: context.productionSourceFiles
  });
}

function runMaintainabilityChecks(context) {
  checkMaintainability(context);
  checkTypeScript(context);
}
