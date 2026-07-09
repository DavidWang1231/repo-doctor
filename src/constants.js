export const VERSION = "0.2.0";

export const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "vendor",
  "target",
  "__pycache__"
]);

export const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
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
