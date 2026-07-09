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

export async function walkRepository(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = normalizePath(path.relative(rootDir, fullPath));

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const stat = await fs.stat(fullPath);
      const isText = TEXT_EXTENSIONS.has(extension) || extension === "";
      let lines = 0;
      let content = "";

      if (isText && stat.size <= 1024 * 1024) {
        content = await readTextFile(fullPath);
        lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
      }

      files.push({
        path: relativePath,
        absolutePath: fullPath,
        extension,
        language: LANGUAGE_BY_EXTENSION.get(extension) ?? "Other",
        bytes: stat.size,
        lines,
        isText,
        content
      });
    }
  }

  await walk(rootDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
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
