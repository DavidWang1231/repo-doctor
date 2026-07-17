import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

export const VERSION = packageJson.version;

export const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".svelte-kit",
  ".idea",
  ".vscode",
  "vendor",
  "target",
  "Pods",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".tox"
]);

export const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cjs",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

export const SOURCE_FILE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".java"
]);

export const ENV_REFERENCE_PATTERN =
  /process\.env(?:\.|\[)|os\.environ(?:\.|\[|\.get)|Deno\.env\.get|getenv\(/;

export const LANGUAGE_BY_EXTENSION = new Map([
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".py", "Python"],
  [".go", "Go"],
  [".rs", "Rust"],
  [".java", "Java"],
  [".rb", "Ruby"],
  [".php", "PHP"],
  [".cs", "C#"],
  [".cpp", "C++"],
  [".cc", "C++"],
  [".c", "C"],
  [".html", "HTML"],
  [".css", "CSS"],
  [".sh", "Shell"],
  [".yml", "YAML"],
  [".yaml", "YAML"],
  [".md", "Markdown"],
  [".json", "JSON"]
]);

export const CATEGORY_LABELS = {
  documentation: "Documentation",
  maintainability: "Maintainability",
  testing: "Testing",
  ci: "CI/CD",
  security: "Security",
  open_source: "Open Source"
};

export const CATEGORY_WEIGHTS = {
  documentation: 16,
  maintainability: 20,
  testing: 20,
  ci: 16,
  security: 18,
  open_source: 10
};

export const SEVERITY_DEDUCTIONS = {
  critical: 12,
  warning: 6,
  info: 2
};
