#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import readline from "node:readline/promises";
import { planFixes } from "./fixes.js";
import { scanRepository } from "./scanner.js";
import { renderPrioritySummary } from "./summarizer.js";
import { resolveScanTarget } from "./target.js";
import { renderHtml } from "./reporters/html.js";
import { renderMarkdown } from "./reporters/markdown.js";

const execFileAsync = promisify(execFile);
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = chooseProjectRoot();

async function main() {
  printHeader();
  const targetInput = await askForTarget();
  const target = await resolveScanTarget(targetInput);
  let report;

  try {
    report = await scanRepository(target.rootDir, target.source);
    const outputDir = await writeReports(report);
    await printFixPreview(target, report);
    await openReport(path.join(outputDir, "report.html"));
    printDone(outputDir);
  } finally {
    await target.cleanup();
  }
}

function printHeader() {
  console.log("");
  console.log("Repo Doctor One-Click Scan");
  console.log("==========================");
  console.log("Drag a project folder here, paste a GitHub URL, or press Enter to scan Repo Doctor itself.");
  console.log("");
}

function chooseProjectRoot() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "src", "one-click.js")) && existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }

  return scriptRoot;
}

async function askForTarget() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question("Project path or GitHub URL: ");
    return normalizeDraggedPath(answer) || projectRoot;
  } finally {
    rl.close();
  }
}

export function normalizeDraggedPath(value) {
  let normalized = String(value ?? "").trim();

  if (!normalized) {
    return "";
  }

  if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1);
  }

  if (normalized.startsWith("file://")) {
    normalized = decodeURIComponent(new URL(normalized).pathname);
  }

  return normalized
    .replaceAll("\\ ", " ")
    .replaceAll("\\(", "(")
    .replaceAll("\\)", ")")
    .replaceAll("\\[", "[")
    .replaceAll("\\]", "]")
    .replaceAll("\\&", "&");
}

async function writeReports(report) {
  const runName = `${slugify(report.project.name)}-${timestamp()}`;
  const outputDir = await createOutputDir(runName);
  await fs.writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "report.md"), renderMarkdown(report));
  await fs.writeFile(path.join(outputDir, "report.html"), renderHtml(report));
  await fs.writeFile(path.join(outputDir, "summary.md"), renderPrioritySummary(report));
  return outputDir;
}

async function createOutputDir(runName) {
  const candidates = [
    path.join(projectRoot, "repo-doctor-runs", runName),
    path.join(os.homedir(), "Desktop", "repo-doctor-runs", runName),
    path.join(os.tmpdir(), "repo-doctor-runs", runName)
  ];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      await fs.mkdir(candidate, { recursive: true });
      return candidate;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function printFixPreview(target, report) {
  if (report.project.source?.type !== "local") {
    return;
  }

  const plan = await planFixes(target.rootDir);
  if (plan.actions.length === 0) {
    console.log("");
    console.log("No low-risk auto-fixes are available for this project.");
    return;
  }

  console.log("");
  console.log("Low-risk fixes are available, but one-click mode will not change your project automatically:");
  for (const action of plan.actions) {
    console.log(`- ${action.path}: ${action.description}`);
  }
  console.log("");
  console.log("To apply them later, run:");
  console.log(`node ${path.join(projectRoot, "src/cli.js")} fix ${target.rootDir} --write`);
}

async function openReport(reportPath) {
  try {
    if (os.platform() === "darwin") {
      await execFileAsync("open", [reportPath]);
      return;
    }

    if (os.platform() === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", reportPath]);
      return;
    }

    await execFileAsync("xdg-open", [reportPath]);
  } catch {
    // The report path is printed below, so failing to open the browser is recoverable.
  }
}

function printDone(outputDir) {
  console.log("");
  console.log("Done. Your report is ready:");
  console.log(path.join(outputDir, "report.html"));
  console.log("");
  console.log("Also generated:");
  console.log(path.join(outputDir, "summary.md"));
  console.log("");
}

export function slugify(value) {
  return String(value || "repo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "repo";
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
}

main().catch((error) => {
  console.error("");
  console.error(`Repo Doctor could not finish: ${error.message}`);
  console.error("");
  process.exitCode = 1;
});
