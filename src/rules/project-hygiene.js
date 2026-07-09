import { evidence, findLine } from "../file-system.js";
import { finding, strength } from "../rule-utils.js";

export function checkReadme({ readmeFile, packageJson, findings, strengths }) {
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

  const content = readmeFile.content.toLowerCase();
  const missingSections = [];
  const expectedSections = [
    ["install", "installation", "setup"],
    ["usage", "quick start", "getting started"],
    ["test", "testing"],
    ["config", "configuration", "environment"]
  ];

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

export function checkTesting({ packageFile, packageJson, testFiles, workflowFiles, findings, strengths }) {
  const hasTestScript = Boolean(packageJson?.scripts?.test);

  if (testFiles.length === 0) {
    findings.push(finding({
      id: "tests-missing",
      title: "No test files were found",
      severity: "critical",
      category: "testing",
      summary: "The repository has no obvious automated tests, which makes regressions difficult to catch.",
      recommendation: "Add tests around the main public API or command-line workflow first.",
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

export function checkCi({ workflowFiles, findings, strengths }) {
  if (workflowFiles.length === 0) {
    findings.push(finding({
      id: "ci-missing",
      title: "No GitHub Actions workflow found",
      severity: "critical",
      category: "ci",
      summary: "Without CI, contributors cannot tell whether a pull request passes the expected checks.",
      recommendation: "Add a workflow that runs install, test, and build or lint commands on pull requests.",
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

export function checkOpenSourceFiles({ licenseFile, contributingFile, securityFile, gitignoreFile, findings, strengths }) {
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

  if (!contributingFile) {
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

  if (!securityFile) {
    findings.push(finding({
      id: "security-policy-missing",
      title: "Security policy is missing",
      severity: "info",
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
