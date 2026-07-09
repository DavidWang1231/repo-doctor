export function detectProjectProfile({ files, packageJson }) {
  const indexHtml = files.find((file) => file.path.toLowerCase() === "index.html");
  const htmlFiles = files.filter((file) => file.extension === ".html");
  const markdownFiles = files.filter((file) => file.extension === ".md");
  const sourceFiles = files.filter((file) =>
    [".js", ".jsx", ".mjs", ".ts", ".tsx", ".py", ".go", ".rs", ".rb", ".php", ".java"].includes(file.extension)
  );
  const pythonProjectFile = files.find((file) =>
    ["pyproject.toml", "setup.py", "requirements.txt", "poetry.lock"].includes(file.path.toLowerCase())
  );
  const packageScripts = packageJson?.scripts ?? {};
  const packageDependencies = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies
  };
  const signals = [];

  if (indexHtml) {
    signals.push("top-level index.html");
  }

  if (hasGameSignals(files)) {
    signals.push("canvas or browser game loop signals");
  }

  if (!packageJson) {
    signals.push("no package.json");
  }

  if (isDocsOnly({ files, markdownFiles, sourceFiles, htmlFiles })) {
    return withPolicy({
      id: "docs-only",
      label: "Documentation Repository",
      rationale: ["mostly Markdown content", "no application entry point detected"]
    });
  }

  if (indexHtml && hasGameSignals(files) && !hasBuildSystem(packageJson)) {
    return withPolicy({
      id: "static-game",
      label: "Static Game / GitHub Pages Demo",
      rationale: signals
    });
  }

  if (indexHtml && htmlFiles.length > 0 && !hasBuildSystem(packageJson)) {
    return withPolicy({
      id: "static-site",
      label: "Static Site",
      rationale: signals
    });
  }

  if (packageJson?.bin) {
    return withPolicy({
      id: "cli-tool",
      label: "CLI Tool",
      rationale: ["package.json bin entry"]
    });
  }

  if (hasBackendSignals(files, packageScripts, packageDependencies)) {
    return withPolicy({
      id: "backend-service",
      label: "Backend Service",
      rationale: ["server framework, API route, or server entry point detected"]
    });
  }

  if (hasWebAppSignals(packageScripts, packageDependencies)) {
    return withPolicy({
      id: "web-app",
      label: "Web App",
      rationale: ["frontend framework or build/dev script"]
    });
  }

  if (hasLibrarySignals(packageJson)) {
    return withPolicy({
      id: "library",
      label: "Reusable Library / Package",
      rationale: ["package export, main, module, or types entry detected"]
    });
  }

  if (pythonProjectFile || files.some((file) => file.extension === ".py")) {
    return withPolicy({
      id: "python-project",
      label: "Python Project",
      rationale: [pythonProjectFile ? pythonProjectFile.path : "Python source files"]
    });
  }

  if (packageJson) {
    return withPolicy({
      id: "node-project",
      label: "Node Project",
      rationale: ["package.json present"]
    });
  }

  return withPolicy({
    id: "generic",
    label: "Generic Repository",
    rationale: ["no stronger project type detected"]
  });
}

export function isStaticShowcaseProfile(profile) {
  return profile?.id === "static-game" || profile?.id === "static-site";
}

export function shouldSkipUnitTests(profile) {
  return ["static-game", "static-site", "docs-only"].includes(profile?.id);
}

export function missingTestsSeverity(profile) {
  if (["library", "backend-service", "cli-tool", "node-project"].includes(profile?.id)) {
    return "critical";
  }

  if (["web-app", "python-project"].includes(profile?.id)) {
    return "warning";
  }

  return "info";
}

export function missingCiPolicy(profile) {
  const id = profile?.id;

  if (id === "static-game" || id === "static-site") {
    return {
      id: "static-syntax-workflow-missing",
      title: "No lightweight syntax-check workflow found",
      severity: "warning",
      summary: "Static browser projects usually do not need a full CI pipeline, but a syntax check can prevent broken JavaScript from reaching GitHub Pages.",
      recommendation: "Add a small GitHub Actions workflow that checks JavaScript syntax or validates the static entry point."
    };
  }

  if (id === "docs-only") {
    return {
      id: "docs-workflow-missing",
      title: "No documentation check workflow found",
      severity: "info",
      summary: "Documentation repositories do not always need CI, but a link or Markdown check can catch broken references.",
      recommendation: "Consider adding a lightweight Markdown or link-check workflow if this repository is actively maintained."
    };
  }

  if (["library", "backend-service", "cli-tool"].includes(id)) {
    return {
      id: "ci-missing",
      title: "No GitHub Actions workflow found",
      severity: "critical",
      summary: "This project type benefits from automatic validation before code is merged or released.",
      recommendation: "Add a workflow that runs install, test, and build or lint commands on pull requests."
    };
  }

  return {
    id: "ci-missing",
    title: "No GitHub Actions workflow found",
    severity: "warning",
    summary: "Without CI, maintainers have to remember every validation step manually.",
    recommendation: "Add a workflow that runs the most important project checks on pull requests."
  };
}

export function shouldSkipContributing(profile) {
  return ["static-game", "static-site", "docs-only"].includes(profile?.id);
}

export function securityPolicy(profile) {
  if (["static-game", "static-site", "docs-only"].includes(profile?.id)) {
    return "skip";
  }

  if (profile?.id === "backend-service") {
    return "warning";
  }

  return "info";
}

function hasBuildSystem(packageJson) {
  if (!packageJson) {
    return false;
  }

  const scripts = packageJson.scripts ?? {};
  return Boolean(scripts.build || scripts.dev || scripts.start || scripts.test);
}

function hasWebAppSignals(scripts, dependencies) {
  const dependencyNames = Object.keys(dependencies ?? {});
  const frameworks = ["@vitejs/plugin-react", "vite", "react", "vue", "svelte", "next", "astro", "nuxt"];

  return Boolean(scripts.dev || scripts.build) ||
    dependencyNames.some((name) => frameworks.includes(name));
}

function hasBackendSignals(files, scripts, dependencies) {
  const dependencyNames = Object.keys(dependencies ?? {});
  const serverFrameworks = ["express", "fastify", "koa", "hapi", "@nestjs/core", "apollo-server", "graphql-yoga"];
  const hasFramework = dependencyNames.some((name) => serverFrameworks.includes(name));
  const hasServerScript = /server|api|listen/.test(Object.values(scripts ?? {}).join(" ").toLowerCase());
  const hasServerFile = files.some((file) => /(^|\/)(server|app|api|routes)\.[cm]?[jt]s$/i.test(file.path));

  return hasFramework || hasServerScript || hasServerFile;
}

function hasLibrarySignals(packageJson) {
  return Boolean(packageJson?.exports || packageJson?.main || packageJson?.module || packageJson?.types);
}

function isDocsOnly({ files, markdownFiles, sourceFiles, htmlFiles }) {
  if (files.length === 0) {
    return false;
  }

  const docsSignals = markdownFiles.length >= Math.max(2, files.length * 0.6);
  const hasAppEntry = htmlFiles.some((file) => file.path.toLowerCase() === "index.html") ||
    sourceFiles.length > 0;

  return docsSignals && !hasAppEntry;
}

function withPolicy(profile) {
  return {
    ...profile,
    policy: {
      tests: shouldSkipUnitTests(profile) ? "skip" : missingTestsSeverity(profile),
      ci: missingCiPolicy(profile).severity,
      contributing: shouldSkipContributing(profile) ? "skip" : "info",
      security: securityPolicy(profile)
    }
  };
}

function hasGameSignals(files) {
  const browserFiles = files.filter((file) => [".html", ".js", ".mjs"].includes(file.extension));
  const combined = browserFiles
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  const signals = [
    "<canvas",
    "getcontext(\"2d\")",
    "getcontext('2d')",
    "requestanimationframe",
    "keydown",
    "keyup",
    "score",
    "player",
    "enemy",
    "wave",
    "collision",
    "gameover"
  ];

  return signals.filter((signal) => combined.includes(signal)).length >= 3;
}
