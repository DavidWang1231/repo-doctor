#!/usr/bin/env node
// Syntax-checks every JavaScript file under src/ and test/ with `node --check`,
// so new files are covered without editing package.json.
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_DIRECTORIES = ["src", "test", "scripts"];
const JS_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

async function collectFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile() && JS_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = (await Promise.all(
  TARGET_DIRECTORIES.map((dir) => collectFiles(path.join(rootDir, dir)))
)).flat().sort();

const failures = [];
for (const file of files) {
  try {
    await execFileAsync(process.execPath, ["--check", file]);
  } catch (error) {
    failures.push({ file, message: error.stderr || error.message });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Syntax check failed: ${path.relative(rootDir, failure.file)}`);
    console.error(failure.message.trim());
  }
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} file(s).`);
