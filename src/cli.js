#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { VERSION } from "./constants.js";
import { scanRepository } from "./scanner.js";
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

  if (command !== "scan") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }

  return runScan(rest);
}

async function runScan(args) {
  const options = parseScanArgs(args);
  const report = await scanRepository(options.target);
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

function parseScanArgs(args) {
  const options = {
    target: ".",
    out: "repo-doctor-report",
    format: "all",
    failUnder: null
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

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.target = arg;
  }

  if (!["all", "json", "md", "markdown", "html"].includes(options.format)) {
    throw new Error("--format must be one of: all, json, md, markdown, html.");
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

function printHelp() {
  console.log(`Repo Doctor ${VERSION}

Usage:
  repo-doctor scan [path] [options]

Options:
  -o, --out <dir>         Output directory (default: repo-doctor-report)
  -f, --format <format>   all, json, md, markdown, or html (default: all)
      --fail-under <n>    Exit with code 2 when score is below n
  -h, --help              Show help
  -v, --version           Show version

Examples:
  repo-doctor scan .
  repo-doctor scan ../my-app --format html --out doctor-report
  repo-doctor scan . --fail-under 75
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
