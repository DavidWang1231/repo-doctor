import { ENV_REFERENCE_PATTERN } from "../constants.js";
import { evidence, findLine } from "../file-system.js";
import {
  isStaticShowcaseProfile,
  missingCiPolicy,
  missingTestsSeverity,
  securityPolicy,
  shouldSkipContributing,
  shouldSkipUnitTests
} from "../profile.js";
import { finding, skipped, strength } from "../rule-utils.js";

export function checkReadme({ readmeFile, packageJson, profile, testFiles, productionSourceFiles, findings, strengths }) {
  if (!readmeFile) {
    findings.push(finding({
      id: "readme-missing",
      title: "README is missing",
      severity: "critical",
      category: "documentation",
      summary: "A repository without a README makes onboarding, review, and reuse unnecessarily difficult.",
      recommendation: "Add a README with purpose, installation, usage, configuration, testing, and contribution notes.",
      evidence: [evidence("README.md", 1, "No README file found.")],
      fixable: true
    }));
    return;
  }

  if (isStaticShowcaseProfile(profile)) {
    checkStaticShowcaseReadme({ readmeFile, findings, strengths });
    return;
  }

  const content = readmeFile.content.toLowerCase();
  const missingSections = [];
  const expectedSections = [
    ["install", "installation", "setup"],
    ["usage", "quick start", "getting started", "run locally", "local setup", "demo", "play"]
  ];

  if (packageJson?.scripts?.test || testFiles?.length > 0) {
    expectedSections.push(["test", "testing", "verification", "checks"]);
  }

  if (usesEnvironmentVariables(productionSourceFiles)) {
    expectedSections.push(["config", "configuration", "environment", ".env"]);
  }

  for (const aliases of expectedSections) {
    if (!aliases.some((alias) => content.includes(alias))) {
      missingSections.push(aliases[0]);
    }
  }

  if (missingSections.length > 0) {
    findings.push(finding({
      id: "readme-thin",
      title: "README is missing key onboarding sections",
      severity: missingSections.length >= 3 ? "warning" : "info",
      category: "documentation",
      summary: `Missing sections: ${missingSections.join(", ")}.`,
      recommendation: "Add concise sections for setup, common commands, tests, and configuration so new contributors can run the project quickly.",
      evidence: [evidence(readmeFile, 1, "README exists but does not cover all expected onboarding topics.")],
      fixable: true
    }));
  } else {
    strengths.push(strength({
      id: "readme-complete",
      title: "README covers core onboarding topics",
      category: "documentation",
      summary: "The README includes setup, usage, testing, and configuration guidance.",
      evidence: [evidence(readmeFile, 1)]
    }));
  }

  if (packageJson?.name && !content.includes(packageJson.name.toLowerCase())) {
    findings.push(finding({
      id: "readme-name-mismatch",
      title: "README does not mention the package name",
      severity: "info",
      category: "documentation",
      summary: `The package is named ${packageJson.name}, but the README does not mention that name.`,
      recommendation: "Make the project name obvious in the README title or first paragraph.",
      evidence: [evidence(readmeFile, 1), evidence("package.json", 2, `name: ${packageJson.name}`)],
      fixable: true
    }));
  }
}

export function checkPackageScripts({ packageFile, packageJson, findings, strengths }) {
  if (!packageFile || !packageJson) {
    return;
  }

  const scripts = packageJson.scripts ?? {};
  const missing = ["test", "lint"].filter((script) => !scripts[script]);

  if (!scripts.test) {
    findings.push(finding({
      id: "script-test-missing",
      title: "No test script is defined",
      severity: "warning",
      category: "testing",
      summary: "A standard test script lets contributors and CI verify changes without guessing commands.",
      recommendation: "Add a package.json test script, even if it starts with a focused smoke test.",
      evidence: [evidence(packageFile, findLine(packageFile, (line) => line.includes('"scripts"')), "scripts block")],
      fixable: true
    }));
  }

  if (!scripts.lint) {
    findings.push(finding({
      id: "script-lint-missing",
      title: "No lint script is defined",
      severity: "info",
      category: "maintainability",
      summary: "A lint script gives maintainers a repeatable quality gate.",
      recommendation: "Add a lint or check script and run it in CI.",
      evidence: [evidence(packageFile, findLine(packageFile, (line) => line.includes('"scripts"')), "scripts block")],
      fixable: true
    }));
  }

  if (missing.length === 0) {
    strengths.push(strength({
      id: "standard-scripts",
      title: "Standard package scripts are present",
      category: "maintainability",
      summary: "The package defines both test and lint scripts.",
      evidence: [evidence(packageFile, findLine(packageFile, (line) => line.includes('"scripts"')))]
    }));
  }
}

export function checkReadmeScripts({ readmeFile, packageFile, packageJson, findings }) {
  if (!readmeFile || !packageFile || !packageJson?.scripts) {
    return;
  }

  const mentionedScripts = [...readmeFile.content.matchAll(/npm\s+run\s+([a-zA-Z0-9:_-]+)/g)].map((match) => match[1]);
  const missingScripts = [...new Set(mentionedScripts.filter((script) => !packageJson.scripts[script]))];

  if (missingScripts.length > 0) {
    findings.push(finding({
      id: "readme-script-mismatch",
      title: "README references package scripts that do not exist",
      severity: "warning",
      category: "documentation",
      summary: `Missing scripts in package.json: ${missingScripts.join(", ")}.`,
      recommendation: "Either add the scripts or update the README commands so setup instructions are executable.",
      evidence: [
        evidence(readmeFile, findLine(readmeFile, (line) => missingScripts.some((script) => line.includes(`npm run ${script}`)))),
        evidence(packageFile, findLine(packageFile, (line) => line.includes('"scripts"')))
      ]
    }));
  }
}

export function checkTesting({ packageFile, packageJson, testFiles, workflowFiles, profile, findings, strengths, skipped: skippedItems }) {
  const hasTestScript = Boolean(packageJson?.scripts?.test);

  if (testFiles.length === 0) {
    if (shouldSkipUnitTests(profile)) {
      skippedItems.push(skipped({
        id: "unit-tests-not-required",
        title: "Unit test requirement skipped for this project profile",
        category: "testing",
        reason: "This project profile does not have an obvious exported API or command-line workflow. Lightweight validation is more useful than forcing unit tests.",
        evidence: [evidence("tests/", 1, "No test files matched common test naming conventions.")]
      }));
      return;
    }

    const severity = missingTestsSeverity(profile);
    findings.push(finding({
      id: "tests-missing",
      title: "No test files were found",
      severity,
      category: "testing",
      summary: severity === "critical"
        ? "This project type usually needs automated tests to prevent regressions in public behavior."
        : "No obvious automated tests were found. A lightweight smoke test may be enough for this project type.",
      recommendation: severity === "critical"
        ? "Add tests around the main public API, service behavior, or command-line workflow first."
        : "Add a small smoke test for the most important user path, or document why manual verification is enough.",
      evidence: [evidence("tests/", 1, "No test files matched common test naming conventions.")],
      fixable: false
    }));
  } else {
    strengths.push(strength({
      id: "tests-present",
      title: "Automated tests are present",
      category: "testing",
      summary: `${testFiles.length} test file(s) were detected.`,
      evidence: testFiles.slice(0, 3).map((file) => evidence(file, 1))
    }));
  }

  if (testFiles.length > 0 && !hasTestScript && packageFile) {
    findings.push(finding({
      id: "tests-not-scripted",
      title: "Tests exist but are not exposed through package.json",
      severity: "warning",
      category: "testing",
      summary: "Contributors may not know how to run the test suite.",
      recommendation: "Add a package.json test script that runs the detected tests.",
      evidence: [evidence(packageFile, findLine(packageFile, (line) => line.includes('"scripts"')))]
    }));
  }

  if (hasTestScript && workflowFiles.length > 0) {
    const workflowRunsTests = workflowFiles.some((file) => /npm\s+(run\s+)?test|pnpm\s+test|yarn\s+test|pytest|go\s+test|cargo\s+test/i.test(file.content));
    if (!workflowRunsTests) {
      findings.push(finding({
        id: "ci-does-not-run-tests",
        title: "CI exists but does not appear to run tests",
        severity: "warning",
        category: "ci",
        summary: "The workflow files do not contain a recognizable test command.",
        recommendation: "Run the test command in CI so pull requests get a real quality gate.",
        evidence: workflowFiles.slice(0, 3).map((file) => evidence(file, 1))
      }));
    }
  }
}

export function checkCi({ workflowFiles, profile, findings, strengths }) {
  if (workflowFiles.length === 0) {
    const policy = missingCiPolicy(profile);

    findings.push(finding({
      id: policy.id,
      title: policy.title,
      severity: policy.severity,
      category: "ci",
      summary: policy.summary,
      recommendation: policy.recommendation,
      evidence: [evidence(".github/workflows/", 1, "No workflow YAML files found.")],
      fixable: true
    }));
    return;
  }

  strengths.push(strength({
    id: "ci-present",
    title: "GitHub Actions workflow is present",
    category: "ci",
    summary: `${workflowFiles.length} workflow file(s) were detected.`,
    evidence: workflowFiles.slice(0, 3).map((file) => evidence(file, 1))
  }));

  const hasPullRequestTrigger = workflowFiles.some((file) => /pull_request:/i.test(file.content));
  if (!hasPullRequestTrigger) {
    findings.push(finding({
      id: "ci-no-pr-trigger",
      title: "CI does not appear to run on pull requests",
      severity: "warning",
      category: "ci",
      summary: "Workflows should usually validate pull requests before merge.",
      recommendation: "Add a pull_request trigger to the main validation workflow.",
      evidence: workflowFiles.slice(0, 3).map((file) => evidence(file, 1))
    }));
  }
}

export function checkOpenSourceFiles({ licenseFile, contributingFile, securityFile, gitignoreFile, profile, findings, strengths, skipped: skippedItems }) {
  if (!licenseFile) {
    findings.push(finding({
      id: "license-missing",
      title: "License file is missing",
      severity: "warning",
      category: "open_source",
      summary: "A missing license makes reuse legally ambiguous.",
      recommendation: "Add a LICENSE file that matches the intended distribution model.",
      evidence: [evidence("LICENSE", 1, "No license file found.")],
      fixable: true
    }));
  } else {
    strengths.push(strength({
      id: "license-present",
      title: "License file is present",
      category: "open_source",
      summary: "The repository declares a license.",
      evidence: [evidence(licenseFile, 1)]
    }));
  }

  if (!contributingFile && shouldSkipContributing(profile)) {
    skippedItems.push(skipped({
      id: "contributing-not-required",
      title: "Contribution guide not required for this project type",
      category: "open_source",
      reason: "This profile looks more like a showcase, static site, or documentation repository than a reusable project seeking outside contributors.",
      evidence: [evidence("CONTRIBUTING.md", 1, "No contribution guide found.")]
    }));
  } else if (!contributingFile) {
    findings.push(finding({
      id: "contributing-missing",
      title: "Contribution guide is missing",
      severity: "info",
      category: "open_source",
      summary: "External contributors need a short path for setup, branches, tests, and review expectations.",
      recommendation: "Add CONTRIBUTING.md with local setup, testing, issue, and pull request expectations.",
      evidence: [evidence("CONTRIBUTING.md", 1, "No contribution guide found.")],
      fixable: true
    }));
  }

  const securityTreatment = securityPolicy(profile);
  if (!securityFile && securityTreatment === "skip") {
    skippedItems.push(skipped({
      id: "security-policy-not-required",
      title: "Security policy not required for this project type",
      category: "security",
      reason: "This project profile has no backend service, account system, or dependency tree that would make a vulnerability disclosure policy essential.",
      evidence: [evidence("SECURITY.md", 1, "No security policy found.")]
    }));
  } else if (!securityFile) {
    findings.push(finding({
      id: "security-policy-missing",
      title: "Security policy is missing",
      severity: securityTreatment,
      category: "security",
      summary: "A security policy tells users how to report vulnerabilities responsibly.",
      recommendation: "Add SECURITY.md with supported versions and vulnerability reporting instructions.",
      evidence: [evidence("SECURITY.md", 1, "No security policy found.")],
      fixable: true
    }));
  }

  if (!gitignoreFile) {
    findings.push(finding({
      id: "gitignore-missing",
      title: ".gitignore is missing",
      severity: "warning",
      category: "maintainability",
      summary: "Build artifacts, local settings, and secrets are easier to commit accidentally without a .gitignore.",
      recommendation: "Add a .gitignore for the project language and tooling.",
      evidence: [evidence(".gitignore", 1, "No .gitignore found.")],
      fixable: true
    }));
  }
}

function checkStaticShowcaseReadme({ readmeFile, findings, strengths }) {
  const content = readmeFile.content.toLowerCase();
  const hasRunInstructions = hasCommandBlock(readmeFile.content) ||
    /run locally|local setup|open index\.html|python3? -m http\.server|npx serve|live server/.test(content);
  const hasPlaySignal = /play|demo|github\.io|live|try it|试玩|在线/.test(content);
  const hasControlSignal = /control|keyboard|mouse|arrow|wasd|space|click|tap|操作|按键/.test(content);
  const missing = [];

  if (!hasRunInstructions) {
    missing.push("local run instructions");
  }

  if (!hasPlaySignal) {
    missing.push("play/demo link or gameplay description");
  }

  if (!hasControlSignal) {
    missing.push("controls");
  }

  if (missing.length === 0) {
    strengths.push(strength({
      id: "static-showcase-readme",
      title: "README fits a static showcase project",
      category: "documentation",
      summary: "The README includes practical play/demo, local run, and control guidance for a static game or demo.",
      evidence: [evidence(readmeFile, 1)]
    }));
    return;
  }

  findings.push(finding({
    id: "static-showcase-readme-thin",
    title: "README could better present this static demo",
    severity: missing.includes("local run instructions") ? "warning" : "info",
    category: "documentation",
    summary: `Missing static-demo guidance: ${missing.join(", ")}.`,
    recommendation: "For a static game or demo, add a live play link, local run instructions, controls, and ideally a screenshot or GIF.",
    evidence: [evidence(readmeFile, 1, "README exists but does not cover all static-demo signals.")],
    fixable: true
  }));
}

function hasCommandBlock(content) {
  return /```(?:bash|sh|shell|text)?\s*[\s\S]*?(npm|node|python|open|serve|http-server|vite)[\s\S]*?```/i.test(content);
}

function usesEnvironmentVariables(sourceFiles = []) {
  return sourceFiles.some((file) => ENV_REFERENCE_PATTERN.test(file.content));
}

export function checkDocker({ dockerfile, composeFile, findings, strengths }) {
  if (dockerfile && !composeFile) {
    findings.push(finding({
      id: "docker-compose-missing",
      title: "Dockerfile exists without a compose example",
      severity: "info",
      category: "documentation",
      summary: "A compose file makes local service dependencies and environment wiring easier to discover.",
      recommendation: "Consider adding docker-compose.yml or documenting the exact docker run command.",
      evidence: [evidence(dockerfile, 1)],
      fixable: true
    }));
  }

  if (dockerfile && composeFile) {
    strengths.push(strength({
      id: "docker-local-workflow",
      title: "Docker local workflow is documented by files",
      category: "documentation",
      summary: "Both Dockerfile and compose configuration were found.",
      evidence: [evidence(dockerfile, 1), evidence(composeFile, 1)]
    }));
  }
}
