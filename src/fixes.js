import { promises as fs } from "node:fs";
import path from "node:path";
import { findFile, findFiles, walkRepository } from "./file-system.js";
import { isTestPath } from "./rule-utils.js";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".py", ".go", ".rs", ".rb"]);

export async function planFixes(targetPath = ".") {
  const rootDir = path.resolve(targetPath);
  const files = await walkRepository(rootDir);
  const packageFile = findFile(files, ["package.json"]);
  const workflowFiles = findFiles(files, (file) => /^\.github\/workflows\/.+\.ya?ml$/i.test(file.path));
  const actions = [];

  maybeCreateEnvExample({ files, rootDir, actions });
  maybeCreatePullRequestTemplate({ files, rootDir, actions });
  maybeCreateIssueTemplate({ files, rootDir, actions });
  maybeCreateCiWorkflow({ packageFile, workflowFiles, rootDir, actions });

  return {
    rootDir,
    actions
  };
}

export async function applyFixes(plan, { write = false } = {}) {
  const results = [];

  for (const action of plan.actions) {
    if (write) {
      await fs.mkdir(path.dirname(action.absolutePath), { recursive: true });
      await fs.writeFile(action.absolutePath, action.content, { flag: "wx" });
    }

    results.push({
      type: action.type,
      path: action.path,
      description: action.description,
      applied: write
    });
  }

  return results;
}

function maybeCreateEnvExample({ files, rootDir, actions }) {
  if (findFile(files, [".env.example", ".env.sample"])) {
    return;
  }

  const envNames = extractEnvNames(files);
  if (envNames.length === 0) {
    return;
  }

  const content = envNames
    .map((name) => `${name}=`)
    .join("\n") + "\n";

  actions.push(createFileAction({
    rootDir,
    relativePath: ".env.example",
    description: "Create .env.example from environment variable references found in source files.",
    content
  }));
}

function maybeCreatePullRequestTemplate({ files, rootDir, actions }) {
  if (findFile(files, [".github/pull_request_template.md", "PULL_REQUEST_TEMPLATE.md"])) {
    return;
  }

  actions.push(createFileAction({
    rootDir,
    relativePath: ".github/pull_request_template.md",
    description: "Create a lightweight pull request template.",
    content: [
      "## Summary",
      "",
      "- ",
      "",
      "## Verification",
      "",
      "- [ ] Tests or checks were run",
      "- [ ] Documentation was updated when needed",
      "",
      "## Notes",
      "",
      ""
    ].join("\n")
  }));
}

function maybeCreateIssueTemplate({ files, rootDir, actions }) {
  const hasIssueTemplate = files.some((file) => /^\.github\/ISSUE_TEMPLATE\//i.test(file.path));
  if (hasIssueTemplate) {
    return;
  }

  actions.push(createFileAction({
    rootDir,
    relativePath: ".github/ISSUE_TEMPLATE/bug_report.md",
    description: "Create a bug report issue template.",
    content: [
      "---",
      "name: Bug report",
      "about: Report a reproducible problem",
      "title: \"\"",
      "labels: bug",
      "assignees: \"\"",
      "---",
      "",
      "## What happened?",
      "",
      "",
      "## How to reproduce",
      "",
      "1. ",
      "",
      "## Expected behavior",
      "",
      "",
      "## Environment",
      "",
      "- OS:",
      "- Runtime:",
      "- Version:",
      ""
    ].join("\n")
  }));
}

function maybeCreateCiWorkflow({ packageFile, workflowFiles, rootDir, actions }) {
  if (!packageFile || workflowFiles.length > 0) {
    return;
  }

  let packageJson = {};
  try {
    packageJson = JSON.parse(packageFile.content);
  } catch {
    return;
  }

  const scripts = packageJson.scripts ?? {};
  const commands = [];
  if (scripts.lint) {
    commands.push("npm run lint");
  }
  if (scripts.test) {
    commands.push("npm test");
  }
  if (scripts.build) {
    commands.push("npm run build");
  }

  if (commands.length === 0) {
    return;
  }

  actions.push(createFileAction({
    rootDir,
    relativePath: ".github/workflows/ci.yml",
    description: "Create a starter Node.js CI workflow from package.json scripts.",
    content: [
      "name: CI",
      "",
      "on:",
      "  pull_request:",
      "  push:",
      "    branches:",
      "      - main",
      "",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-node@v4",
      "        with:",
      "          node-version: 20",
      ...commands.map((command) => `      - run: ${command}`),
      ""
    ].join("\n")
  }));
}

function createFileAction({ rootDir, relativePath, description, content }) {
  return {
    type: "create-file",
    path: relativePath,
    absolutePath: path.join(rootDir, relativePath),
    description,
    content
  };
}

function extractEnvNames(files) {
  const names = new Set();

  for (const file of files) {
    if (!SOURCE_EXTENSIONS.has(file.extension) || isTestPath(file.path)) {
      continue;
    }

    collectMatches(file.content, /process\.env\.([A-Z0-9_]+)/g, names);
    collectMatches(file.content, /process\.env\[['"]([A-Z0-9_]+)['"]\]/g, names);
    collectMatches(file.content, /Deno\.env\.get\(['"]([A-Z0-9_]+)['"]\)/g, names);
    collectMatches(file.content, /os\.environ(?:\.get)?\(['"]([A-Z0-9_]+)['"]\)/g, names);
    collectMatches(file.content, /os\.environ\[['"]([A-Z0-9_]+)['"]\]/g, names);
    collectMatches(file.content, /getenv\(['"]([A-Z0-9_]+)['"]\)/g, names);
  }

  return [...names].sort();
}

function collectMatches(content, pattern, names) {
  for (const match of content.matchAll(pattern)) {
    names.add(match[1]);
  }
}
