import { promises as fs } from "node:fs";
import path from "node:path";
import {
  EXCLUDED_DIRECTORIES,
  LANGUAGE_BY_EXTENSION,
  TEXT_EXTENSIONS
} from "./constants.js";

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(targetPath) {
  return fs.readFile(targetPath, "utf8");
}

export async function readJsonFile(targetPath) {
  const raw = await readTextFile(targetPath);
  return JSON.parse(raw);
}

export function normalizePath(targetPath) {
  return targetPath.split(path.sep).join("/");
}

const MAX_CONCURRENT_READS = 64;

export async function walkRepository(rootDir) {
  const filePaths = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      // Skip directories that cannot be read (permissions, races) instead of failing the scan.
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          await walk(fullPath);
        }
        continue;
      }

      if (entry.isFile()) {
        filePaths.push(fullPath);
      }
    }
  }

  await walk(rootDir);

  const files = [];
  for (let index = 0; index < filePaths.length; index += MAX_CONCURRENT_READS) {
    const chunk = filePaths.slice(index, index + MAX_CONCURRENT_READS);
    const entries = await Promise.all(chunk.map((fullPath) => readFileEntry(rootDir, fullPath)));
    files.push(...entries.filter(Boolean));
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function readFileEntry(rootDir, fullPath) {
  const extension = path.extname(fullPath).toLowerCase();
  const isText = TEXT_EXTENSIONS.has(extension) || extension === "";
  let stat;

  try {
    stat = await fs.stat(fullPath);
  } catch {
    return null;
  }

  let lines = 0;
  let content = "";

  if (isText && stat.size <= 1024 * 1024) {
    try {
      content = await readTextFile(fullPath);
    } catch {
      content = "";
    }
    lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
  }

  return {
    path: normalizePath(path.relative(rootDir, fullPath)),
    absolutePath: fullPath,
    extension,
    language: LANGUAGE_BY_EXTENSION.get(extension) ?? "Other",
    bytes: stat.size,
    lines,
    isText,
    content
  };
}

export function findFile(files, candidates) {
  const candidateSet = new Set(candidates.map((item) => item.toLowerCase()));
  return files.find((file) => candidateSet.has(file.path.toLowerCase()));
}

export function findFiles(files, predicate) {
  return files.filter(predicate);
}

export function findLine(file, matcher) {
  if (!file?.content) {
    return 1;
  }

  const lines = file.content.split(/\r?\n/);
  const index = lines.findIndex((line) => matcher(line));
  return index >= 0 ? index + 1 : 1;
}

export function evidence(file, line = 1, detail = "") {
  return {
    file: file?.path ?? file,
    line,
    detail
  };
}
