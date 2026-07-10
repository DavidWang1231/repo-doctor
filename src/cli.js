#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { renderFixPrompt } from "./ai-prompt.js";
import { VERSION } from "./constants.js";
import { applyFixes, planFixes } from "./fixes.js";
import { listProjectProfiles } from "./profile.js";
import { scanRepository } from "./scanner.js";
import { loadReport, renderPrioritySummary } from "./summarizer.js";
import { resolveScanTarget } from "./target.js";
import { parseWebArgs, startWebServer } from "./web-server.js";
import { renderHtml } from "./reporters/html.js";
import { renderMarkdown } from "./reporters/markdown.js";

async function main(argv) {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(VERSION);
    return 0;
  }

  if (command === "scan") {
    return runScan(rest);
  }

  if (command === "summarize") {
    return runSummarize(rest);
  }

  if (command === "prompt") {
    return runPrompt(rest);
  }

  if (command === "fix") {
    return runFix(rest);
  }

  if (command === "web") {
    return runWeb(rest);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  return 1;
}

async function runScan(args) {
  const options = parseScanArgs(args);
  const target = await resolveScanTarget(options.target);
  let report;

  try {
    report = await scanRepository(target.rootDir, target.source, { profile: options.profile });
  } finally {
    await target.cleanup();
  }

  const outputDir = path.resolve(options.out);
  await fs.mkdir(outputDir, { recursive: true });

  const outputs = [];
  if (options.format === "all" || options.format === "json") {
    const target = path.join(outputDir, "report.json");
    await fs.writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
    outputs.push(target);
  }

  if (options.format === "all" || options.format === "md" || options.format === "markdown") {
    const target = path.join(outputDir, "report.md");
    await fs.writeFile(target, renderMarkdown(report));
    outputs.push(target);
  }

  if (options.format === "all" || options.format === "html") {
    const target = path.join(outputDir, "report.html");
    await fs.writeFile(target, renderHtml(report));
    outputs.push(target);
  }

  printSummary(report, outputs);

  if (options.failUnder !== null && report.score < options.failUnder) {
    console.error(`Repo Doctor score ${report.score} is below fail-under threshold ${options.failUnder}.`);
    return 2;
  }

  return 0;
}

async function runSummarize(args) {
  const options = parseSummarizeArgs(args);
  const report = await loadReport(options.report);
  const summary = renderPrioritySummary(report);
  const outputPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, summary);
  console.log(`Priority summary written to ${outputPath}`);
  return 0;
}

async function runPrompt(args) {
  const options = parsePromptArgs(args);
  const report = await loadReport(options.report);
  const prompt = renderFixPrompt(report);
  const outputPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, prompt);
  console.log(`AI fix prompt written to ${outputPath}`);
  return 0;
}

async function runFix(args) {
  const options = parseFixArgs(args);
  const plan = await planFixes(options.target);
  const results = await applyFixes(plan, { write: options.write });

  if (results.length === 0) {
    console.log("No low-risk fixes are available.");
    return 0;
  }

  console.log(options.write ? "Applied fixes:" : "Planned fixes:");
  for (const result of results) {
    console.log(`- ${result.path}: ${result.description}`);
  }

  if (!options.write) {
    console.log("Run again with --write to create these files.");
  }

  return 0;
}

async function runWeb(args) {
  await startWebServer(parseWebArgs(args));
  return 0;
}

function parseScanArgs(args) {
  const options = {
    target: ".",
    out: "repo-doctor-report",
    format: "all",
    failUnder: null,
    profile: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out" || arg === "-o") {
      options.out = requireValue(args, ++index, arg);
      continue;
    }

    if (arg === "--format" || arg === "-f") {
      options.format = requireValue(args, ++index, arg);
      continue;
    }

    if (arg === "--fail-under") {
      const raw = requireValue(args, ++index, arg);
      const threshold = Number(raw);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        throw new Error("--fail-under must be a number between 0 and 100.");
      }
      options.failUnder = threshold;
      continue;
    }

    if (arg === "--profile") {
      options.profile = requireValue(args, ++index, arg);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.target = arg;
  }

  if (!["all", "json", "md", "markdown", "html"].includes(options.format)) {
    throw new Error("--format must be one of: all, json, md, markdown, html.");
  }

  validateProfileOption(options.profile);

  return options;
}

function parseSummarizeArgs(args) {
  const options = {
    report: "repo-doctor-report/report.json",
    out: "repo-doctor-report/summary.md"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out" || arg === "-o") {
      options.out = requireValue(args, ++index, arg);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.report = arg;
  }

  return options;
}

function parsePromptArgs(args) {
  const options = {
    report: "repo-doctor-report/report.json",
    out: "repo-doctor-report/fix-prompt.md"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out" || arg === "-o") {
      options.out = requireValue(args, ++index, arg);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.report = arg;
  }

  return options;
}

function parseFixArgs(args) {
  const options = {
    target: ".",
    write: false
  };

  for (const arg of args) {
    if (arg === "--write") {
      options.write = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.write = false;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.target = arg;
  }

  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function validateProfileOption(profile) {
  if (!profile) {
    return;
  }

  const profileIds = listProjectProfiles().map((item) => item.id);
  if (!profileIds.includes(profile)) {
    throw new Error(`--profile must be one of: ${profileIds.join(", ")}.`);
  }
}

function printHelp() {
  console.log(`Repo Doctor ${VERSION}

Usage:
  repo-doctor scan [path] [options]
  repo-doctor summarize [report.json] [options]
  repo-doctor prompt [report.json] [options]
  repo-doctor fix [path] [--write]
  repo-doctor web [options]

Options:
  -o, --out <dir>         Output directory (default: repo-doctor-report)
  -f, --format <format>   all, json, md, markdown, or html (default: all)
      --fail-under <n>    Exit with code 2 when score is below n
      --profile <id>      Override detected project type
      --write             Create low-risk fix files for the fix command
      --port <n>           Web command port (default: 5177)
      --host <host>        Web command host (default: 127.0.0.1)
      --no-open            Do not open the browser for the web command
  -h, --help              Show help
  -v, --version           Show version

Examples:
  repo-doctor scan .
  repo-doctor scan https://github.com/owner/repo
  repo-doctor scan ../my-app --format html --out doctor-report
  repo-doctor scan . --profile static-game
  repo-doctor scan . --fail-under 75
  repo-doctor summarize repo-doctor-report/report.json
  repo-doctor prompt repo-doctor-report/report.json
  repo-doctor fix . --write
  repo-doctor web

Profiles:
  ${listProjectProfiles().map((profile) => profile.id).join(", ")}
`);
}

function printSummary(report, outputs) {
  const critical = report.findings.filter((finding) => finding.severity === "critical").length;
  const warnings = report.findings.filter((finding) => finding.severity === "warning").length;

  console.log(`Repo Doctor scanned ${report.project.name}`);
  console.log(`Health score: ${report.score}/100`);
  console.log(`Findings: ${critical} critical, ${warnings} warnings, ${report.findings.length} total`);
  console.log("Outputs:");
  for (const output of outputs) {
    console.log(`- ${output}`);
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
