import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { renderFixPrompt } from "../src/ai-prompt.js";
import { applyFixes, planFixes } from "../src/fixes.js";
import { scanRepository } from "../src/scanner.js";
import { renderPrioritySummary } from "../src/summarizer.js";
import { parseGitHubTarget } from "../src/target.js";
import { renderMarkdown } from "../src/reporters/markdown.js";
import { renderHtml } from "../src/reporters/html.js";
import { scanForWeb } from "../src/web-server.js";

test("scanRepository reports missing project hygiene files", async () => {
  const root = await makeTempRepo({
    "package.json": JSON.stringify({
      name: "thin-app",
      scripts: {
        start: "node index.js"
      }
    }, null, 2),
    "index.js": "console.log(process.env.API_URL);\n"
  });

  const report = await scanRepository(root);
  const ids = report.findings.map((finding) => finding.id);

  assert.equal(report.project.name, "thin-app");
  assert.ok(report.score < 80);
  assert.ok(ids.includes("readme-missing"));
  assert.ok(ids.includes("ci-missing"));
  assert.ok(ids.includes("tests-missing"));
  assert.ok(ids.includes("env-example-missing"));
});

test("scanRepository rewards a small healthy Node repository", async () => {
  const root = await makeTempRepo({
    "README.md": [
      "# Healthy App",
      "",
      "## Installation",
      "npm install",
      "",
      "## Usage",
      "npm test",
      "",
      "## Testing",
      "npm test",
      "",
      "## Configuration",
      "Copy .env.example."
    ].join("\n"),
    "LICENSE": "MIT\n",
    "SECURITY.md": "# Security\n",
    "CONTRIBUTING.md": "# Contributing\n",
    ".gitignore": "node_modules/\n.env\n",
    ".env.example": "API_URL=https://example.test\n",
    "package.json": JSON.stringify({
      name: "healthy-app",
      scripts: {
        test: "node --test",
        lint: "node --check index.js"
      }
    }, null, 2),
    ".github/workflows/ci.yml": [
      "name: CI",
      "on:",
      "  pull_request:",
      "  push:",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - run: npm test"
    ].join("\n"),
    "src/index.js": "export function add(a, b) { return a + b; }\n",
    "test/index.test.js": "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('ok', () => assert.equal(1, 1));\n"
  });

  const report = await scanRepository(root);

  assert.ok(report.score >= 85);
  assert.ok(report.strengths.some((strength) => strength.id === "tests-present"));
  assert.ok(report.strengths.some((strength) => strength.id === "ci-present"));
});

test("scanRepository applies a lighter profile to static canvas games", async () => {
  const root = await makeTempRepo({
    "README.md": [
      "# Signal Defender",
      "",
      "Play the live demo on GitHub Pages.",
      "",
      "## Run locally",
      "",
      "```bash",
      "python3 -m http.server 8000",
      "```",
      "",
      "## Controls",
      "",
      "Use the mouse and keyboard to defend the signal."
    ].join("\n"),
    "LICENSE": "MIT\n",
    ".gitignore": ".DS_Store\n.claude/\n",
    "scripts/capture.mjs": "import child_process from 'node:child_process';\nchild_process.exec('node -v');\n",
    "index.html": [
      "<!doctype html>",
      "<canvas id=\"game\"></canvas>",
      "<script>",
      "const canvas = document.getElementById('game');",
      "const ctx = canvas.getContext('2d');",
      "let score = 0;",
      "let player = { x: 0, y: 0 };",
      "let enemy = { x: 10, y: 10 };",
      "function loop() { score += enemy.x - player.x; requestAnimationFrame(loop); }",
      "window.addEventListener('keydown', () => {});",
      "loop();",
      "</script>"
    ].join("\n")
  });

  const report = await scanRepository(root);
  const ids = report.findings.map((finding) => finding.id);
  const skippedIds = report.skipped.map((item) => item.id);

  assert.equal(report.project.profile.id, "static-game");
  assert.ok(report.score >= 85);
  assert.ok(ids.includes("static-syntax-workflow-missing"));
  assert.ok(!ids.includes("tests-missing"));
  assert.ok(!ids.includes("dynamic-execution"));
  assert.ok(!ids.includes("contributing-missing"));
  assert.ok(!ids.includes("security-policy-missing"));
  assert.ok(skippedIds.includes("unit-tests-not-required"));
  assert.ok(skippedIds.includes("contributing-not-required"));
  assert.ok(skippedIds.includes("security-policy-not-required"));
  assert.ok(skippedIds.includes("dynamic-tooling-not-runtime"));
});

test("scanRepository detects common non-static project profiles", async () => {
  const docsRoot = await makeTempRepo({
    "README.md": "# Docs\n",
    "guide.md": "# Guide\n",
    "reference.md": "# Reference\n"
  });
  const cliRoot = await makeTempRepo({
    "package.json": JSON.stringify({
      name: "cli-app",
      bin: {
        "cli-app": "./cli.js"
      }
    }, null, 2),
    "cli.js": "console.log('ok');\n"
  });
  const backendRoot = await makeTempRepo({
    "package.json": JSON.stringify({
      name: "api-app",
      dependencies: {
        express: "latest"
      }
    }, null, 2),
    "server.js": "import express from 'express';\nexpress().listen(3000);\n"
  });
  const libraryRoot = await makeTempRepo({
    "package.json": JSON.stringify({
      name: "lib-app",
      main: "index.js"
    }, null, 2),
    "index.js": "export function ok() { return true; }\n"
  });

  const docsReport = await scanRepository(docsRoot);
  const cliReport = await scanRepository(cliRoot);
  const backendReport = await scanRepository(backendRoot);
  const libraryReport = await scanRepository(libraryRoot);

  assert.equal(docsReport.project.profile.id, "docs-only");
  assert.equal(cliReport.project.profile.id, "cli-tool");
  assert.equal(backendReport.project.profile.id, "backend-service");
  assert.equal(libraryReport.project.profile.id, "library");
  assert.ok(docsReport.skipped.some((item) => item.id === "unit-tests-not-required"));
  assert.ok(backendReport.findings.some((finding) => finding.id === "security-policy-missing" && finding.severity === "warning"));
  assert.ok(libraryReport.findings.some((finding) => finding.id === "tests-missing" && finding.severity === "critical"));
});

test("scanRepository accepts a manual project profile override", async () => {
  const root = await makeTempRepo({
    "README.md": "# Small page\n\nOpen index.html locally.\n",
    "index.html": "<!doctype html><h1>Hello</h1>\n"
  });

  const report = await scanRepository(root, null, { profile: "static-game" });

  assert.equal(report.project.profile.id, "static-game");
  assert.equal(report.project.profile.override, true);
  assert.ok(report.project.profile.rationale.includes("manual override: static-game"));
  assert.ok(!report.findings.some((finding) => finding.id === "tests-missing"));
  assert.ok(report.skipped.some((item) => item.id === "unit-tests-not-required"));
});

test("reporters render evidence-bearing output", async () => {
  const root = await makeTempRepo({
    "package.json": JSON.stringify({ name: "render-app" }, null, 2)
  });
  const report = await scanRepository(root);

  const markdown = renderMarkdown(report);
  const html = renderHtml(report);

  assert.match(markdown, /Repo Doctor Report/);
  assert.match(markdown, /Evidence/);
  assert.match(html, /Repo Doctor Report/);
  assert.match(html, /Health score/);
});

test("parseGitHubTarget recognizes common GitHub repository URLs", () => {
  assert.deepEqual(parseGitHubTarget("https://github.com/octocat/Hello-World"), {
    owner: "octocat",
    repo: "Hello-World",
    cloneUrl: "https://github.com/octocat/Hello-World.git",
    webUrl: "https://github.com/octocat/Hello-World"
  });
  assert.deepEqual(parseGitHubTarget("git@github.com:octocat/Hello-World.git"), {
    owner: "octocat",
    repo: "Hello-World",
    cloneUrl: "https://github.com/octocat/Hello-World.git",
    webUrl: "https://github.com/octocat/Hello-World"
  });
  assert.equal(parseGitHubTarget("../local-project"), null);
});

test("renderPrioritySummary produces a grounded repair plan", async () => {
  const root = await makeTempRepo({
    "package.json": JSON.stringify({ name: "summary-app" }, null, 2)
  });
  const report = await scanRepository(root);
  const summary = renderPrioritySummary(report);

  assert.match(summary, /Priority Repair Plan/);
  assert.match(summary, /AI Handoff Prompt/);
  assert.match(summary, /README is missing/);
  assert.match(summary, /README.md:1/);
});

test("renderFixPrompt produces a copyable AI repair prompt", async () => {
  const root = await makeTempRepo({
    "package.json": JSON.stringify({ name: "prompt-app" }, null, 2)
  });
  const report = await scanRepository(root);
  const prompt = renderFixPrompt(report);

  assert.match(prompt, /AI Fix Prompt/);
  assert.match(prompt, /Use only the findings/);
  assert.match(prompt, /Project: prompt-app/);
  assert.match(prompt, /Evidence: README.md:1/);
});

test("scanForWeb returns report downloads for the browser UI", async () => {
  const root = await makeTempRepo({
    "README.md": "# Web scan app\n\n## Usage\n\nRun it.\n",
    "index.html": "<!doctype html><h1>Hello</h1>\n"
  });

  const result = await scanForWeb({ target: root, profile: "static-site" });

  assert.equal(result.report.project.profile.id, "static-site");
  assert.match(result.downloads.html, /Repo Doctor Report/);
  assert.match(result.downloads.markdown, /Repo Doctor Report/);
  assert.match(result.downloads.json, /"score"/);
  assert.match(result.downloads.summary, /Priority Summary/);
  assert.match(result.downloads.fixPrompt, /AI Fix Prompt/);
});

test("fix command plans and applies only missing low-risk files", async () => {
  const root = await makeTempRepo({
    "package.json": JSON.stringify({
      name: "fixable-app",
      scripts: {
        test: "node --test"
      }
    }, null, 2),
    "src/index.js": "console.log(process.env.API_URL);\n"
  });

  const plan = await planFixes(root);
  const plannedPaths = plan.actions.map((action) => action.path);

  assert.ok(plannedPaths.includes(".env.example"));
  assert.ok(plannedPaths.includes(".github/pull_request_template.md"));
  assert.ok(plannedPaths.includes(".github/ISSUE_TEMPLATE/bug_report.md"));
  assert.ok(plannedPaths.includes(".github/workflows/ci.yml"));

  await applyFixes(plan, { write: true });

  const envExample = await fs.readFile(path.join(root, ".env.example"), "utf8");
  const workflow = await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");

  assert.match(envExample, /API_URL=/);
  assert.match(workflow, /npm test/);
});

async function makeTempRepo(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-doctor-test-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  return root;
}
