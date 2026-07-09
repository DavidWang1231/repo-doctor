import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanRepository } from "../src/scanner.js";
import { renderMarkdown } from "../src/reporters/markdown.js";
import { renderHtml } from "../src/reporters/html.js";

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

async function makeTempRepo(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-doctor-test-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  return root;
}
