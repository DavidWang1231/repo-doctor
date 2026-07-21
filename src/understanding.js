import path from "node:path";
import { SOURCE_FILE_EXTENSIONS } from "./constants.js";
import { evidence, findFile, findLine } from "./file-system.js";
import { isTestPath } from "./rule-utils.js";

const CAPABILITY_SECTION = /^(features?|capabilities|highlights|what (?:it|this) does|functionality|主要功能|功能|特性)$/i;
const RUN_SECTION = /(?:quick start|getting started|installation|install|usage|run locally|running|development|web mode|command mode|使用|安装|运行|开始)/i;
const COMMAND_PATTERN = /^(?:\$\s*)?(?:npm|npx|pnpm|yarn|bun|node|deno|python(?:3)?|pipx?|uv|poetry|go|cargo|docker|docker-compose|make|gradle|mvn|ruby|bundle|php|composer|repo-doctor|\.\/)[\s\w@./:=+,'"-]*$/i;

export function buildRepositoryUnderstanding({ files, projectName, profile, findings, stats }) {
  const readme = files.find((file) => /^readme\.(md|txt)$/i.test(file.path));
  const packageFile = findFile(files, ["package.json"]);
  const packageJson = parseJson(packageFile?.content);
  const summary = buildSummary({ files, readme, packageFile, packageJson, projectName, profile });

  return {
    summary,
    facts: buildFacts({ files, profile, stats }),
    capabilities: buildCapabilities({ files, readme, packageFile, packageJson, profile }),
    runInstructions: buildRunInstructions({ files, readme, packageFile, packageJson, profile }),
    coreFiles: buildCoreFiles({ files, packageFile, packageJson, profile }),
    likelyGaps: findings.slice(0, 5).map((item) => ({
      title: item.title,
      severity: item.severity,
      reason: item.summary,
      evidence: item.evidence.slice(0, 3)
    })),
    limits: "This overview describes repository evidence and cautious structural inferences. It does not verify runtime behavior, product quality, or business correctness."
  };
}

function buildSummary({ files, readme, packageFile, packageJson, projectName, profile }) {
  const readmeDescription = extractReadmeDescription(readme);
  if (readmeDescription) {
    return {
      text: readmeDescription.text,
      basis: "declared",
      evidence: [evidence(readme, readmeDescription.line, "Project description in README")]
    };
  }

  if (packageJson?.description) {
    return {
      text: cleanText(packageJson.description, 320),
      basis: "declared",
      evidence: [evidence(packageFile, findLine(packageFile, (line) => line.includes('"description"')), "package.json description")]
    };
  }

  const rationale = profile?.rationale?.length > 0
    ? ` Signals: ${profile.rationale.join(", ")}.`
    : "";

  return {
    text: `${projectName} appears to be a ${String(profile?.label || "software repository").toLowerCase()}.${rationale}`,
    basis: "inferred",
    evidence: profileEvidence(files, profile)
  };
}

function buildFacts({ files, profile, stats }) {
  const languageFiles = stats.languages
    .filter((item) => item.language !== "Other" && item.lines > 0)
    .slice(0, 3);
  const facts = [{
    label: "Project type",
    value: profile?.label || "Unknown",
    basis: profile?.override ? "declared" : "detected",
    evidence: profileEvidence(files, profile)
  }];

  if (languageFiles.length > 0) {
    const languageNames = languageFiles.map((item) => item.language);
    facts.push({
      label: "Primary languages",
      value: languageNames.join(", "),
      basis: "measured",
      evidence: files
        .filter((file) => languageNames.includes(file.language))
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 3)
        .map((file) => evidence(file, 1, `${file.lines} lines of ${file.language}`))
    });
  }

  facts.push({
    label: "Repository size",
    value: `${stats.files} files and ${stats.lines} lines scanned`,
    basis: "measured",
    evidence: []
  });

  return facts;
}

function buildCapabilities({ files, readme, packageFile, packageJson, profile }) {
  const capabilities = extractCapabilityBullets(readme);
  const seen = new Set(capabilities.map((item) => item.text.toLowerCase()));

  function add(text, file, detail) {
    if (!file || seen.has(text.toLowerCase()) || capabilities.length >= 6) {
      return;
    }
    seen.add(text.toLowerCase());
    capabilities.push({
      text,
      basis: "detected",
      evidence: [evidence(file, 1, detail)]
    });
  }

  const binNames = packageJson?.bin
    ? (typeof packageJson.bin === "string" ? [packageJson.name].filter(Boolean) : Object.keys(packageJson.bin))
    : [];
  if (binNames.length > 0) {
    add(`Provides command-line access through ${binNames.map((name) => `\`${name}\``).join(", ")}.`, packageFile, "package.json bin entry");
  }

  add("Includes a local browser interface.", findFile(files, ["src/web-ui.html", "web-ui.html"]), "Web UI entry");
  add("Can run as a GitHub Action.", findFile(files, ["action.yml", "action.yaml"]), "GitHub Action metadata");
  add("Provides a browser-based static experience.", findFile(files, ["index.html"]), `${profile?.label || "Static"} entry point`);
  add("Includes container-based execution support.", findFile(files, ["Dockerfile", "dockerfile"]), "Container definition");

  return capabilities.slice(0, 6);
}

function buildRunInstructions({ files, readme, packageFile, packageJson, profile }) {
  const instructions = extractReadmeCommands(readme);
  const seen = new Set(instructions.map((item) => item.command));

  function add(command, source, file, line = 1) {
    if (!command || seen.has(command) || instructions.length >= 6) {
      return;
    }
    seen.add(command);
    instructions.push({
      command,
      source,
      basis: source === "README" ? "declared" : "inferred",
      evidence: file ? [evidence(file, line, source)] : []
    });
  }

  const scripts = packageJson?.scripts ?? {};
  for (const scriptName of ["dev", "start", "web", "serve"]) {
    if (scripts[scriptName]) {
      add(`npm run ${scriptName}`, "package.json script", packageFile, findLine(packageFile, (line) => line.includes(`"${scriptName}"`)));
    }
  }

  const indexHtml = findFile(files, ["index.html"]);
  if (instructions.length === 0 && indexHtml && ["static-game", "static-site"].includes(profile?.id)) {
    add("Open index.html in a browser", "Static entry point", indexHtml);
  }

  return instructions.slice(0, 6);
}

function buildCoreFiles({ files, packageFile, packageJson, profile }) {
  const coreFiles = [];
  const seen = new Set();

  function add(fileOrPath, role, basis = "detected") {
    const file = typeof fileOrPath === "string"
      ? files.find((item) => item.path === normalizeDeclaredPath(fileOrPath))
      : fileOrPath;
    if (!file || seen.has(file.path) || coreFiles.length >= 8) {
      return;
    }
    seen.add(file.path);
    coreFiles.push({
      path: file.path,
      role,
      basis,
      evidence: [evidence(file, 1, role)]
    });
  }

  add(files.find((file) => /^readme\.(md|txt)$/i.test(file.path)), "Project documentation", "declared");
  add(packageFile, "Node.js package metadata and scripts", "declared");
  add(findFile(files, ["pyproject.toml", "setup.py"]), "Python project metadata", "declared");
  add(findFile(files, ["index.html"]), ["static-game", "static-site"].includes(profile?.id) ? "Browser entry point" : "Top-level web entry point");

  for (const declaredPath of declaredEntryPaths(packageJson)) {
    add(declaredPath, "Entry point declared by package.json", "declared");
  }

  const commonEntryPattern = /(^|\/)(?:main|index|server|app|cli)\.(?:[cm]?[jt]sx?|py|go|rs|rb|php|java)$/i;
  for (const file of files.filter((item) => commonEntryPattern.test(item.path) && !isTestPath(item.path))) {
    add(file, inferFileRole(file, profile));
  }

  add(findFile(files, ["Dockerfile", "dockerfile"]), "Container build definition", "declared");
  add(findFile(files, ["action.yml", "action.yaml"]), "GitHub Action entry point", "declared");

  const sourceCandidates = files
    .filter((file) => SOURCE_FILE_EXTENSIONS.has(file.extension) && !isTestPath(file.path))
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  for (const file of sourceCandidates) {
    add(file, inferFileRole(file, profile));
  }

  return coreFiles.slice(0, 8);
}

function extractReadmeDescription(readme) {
  if (!readme?.content) {
    return null;
  }

  const lines = readme.content.split(/\r?\n/);
  let paragraph = [];
  let startLine = 1;
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || isReadmeNoise(trimmed)) {
      if (paragraph.length > 0) {
        const text = cleanText(paragraph.join(" "), 320);
        if (text.length >= 20) {
          return { text, line: startLine };
        }
        paragraph = [];
      }
      continue;
    }
    if (!trimmed) {
      if (paragraph.length > 0) {
        const text = cleanText(paragraph.join(" "), 320);
        if (text.length >= 20) {
          return { text, line: startLine };
        }
        paragraph = [];
      }
      continue;
    }
    if (paragraph.length === 0) {
      startLine = index + 1;
    }
    paragraph.push(trimmed);
  }

  return paragraph.length > 0 ? { text: cleanText(paragraph.join(" "), 320), line: startLine } : null;
}

function extractCapabilityBullets(readme) {
  if (!readme?.content) {
    return [];
  }

  const lines = readme.content.split(/\r?\n/);
  const capabilities = [];
  let activeDepth = null;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading) {
      const depth = heading[1].length;
      const title = cleanHeading(heading[2]);
      if (CAPABILITY_SECTION.test(title)) {
        activeDepth = depth;
      } else if (activeDepth !== null && depth <= activeDepth) {
        activeDepth = null;
      }
      continue;
    }

    if (activeDepth === null) {
      continue;
    }
    const bullet = lines[index].match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (!bullet) {
      continue;
    }
    const text = cleanText(bullet[1], 180);
    if (text.length >= 8) {
      capabilities.push({
        text,
        basis: "declared",
        evidence: [evidence(readme, index + 1, "README capability")]
      });
    }
    if (capabilities.length >= 6) {
      break;
    }
  }

  return capabilities;
}

function extractReadmeCommands(readme) {
  if (!readme?.content) {
    return [];
  }

  const lines = readme.content.split(/\r?\n/);
  const commands = [];
  const seen = new Set();
  let runSectionDepth = null;
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{2,6})\s+(.+?)\s*$/);
    if (!inFence && heading) {
      const depth = heading[1].length;
      if (RUN_SECTION.test(cleanHeading(heading[2]))) {
        runSectionDepth = depth;
      } else if (runSectionDepth !== null && depth <= runSectionDepth) {
        runSectionDepth = null;
      }
      continue;
    }

    if (lines[index].trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence || runSectionDepth === null) {
      continue;
    }

    const command = lines[index].trim().replace(/^\$\s*/, "");
    if (!COMMAND_PATTERN.test(command) || seen.has(command)) {
      continue;
    }
    seen.add(command);
    commands.push({
      command,
      source: "README",
      basis: "declared",
      evidence: [evidence(readme, index + 1, "README run command")]
    });
    if (commands.length >= 6) {
      break;
    }
  }

  return commands;
}

function declaredEntryPaths(packageJson) {
  if (!packageJson) {
    return [];
  }

  const paths = [packageJson.main, packageJson.module, packageJson.types];
  if (typeof packageJson.bin === "string") {
    paths.push(packageJson.bin);
  } else if (packageJson.bin) {
    paths.push(...Object.values(packageJson.bin));
  }
  return paths.filter((item) => typeof item === "string");
}

function inferFileRole(file, profile) {
  const basename = path.basename(file.path).toLowerCase();
  if (/^cli\./.test(basename)) {
    return "Command-line entry point";
  }
  if (/^(server|app)\./.test(basename) && profile?.id === "backend-service") {
    return "Backend service entry point";
  }
  if (/^(main|index)\./.test(basename)) {
    return "Likely application or package entry point";
  }
  if (/report|render/.test(file.path)) {
    return "Report generation logic";
  }
  if (/understanding/.test(file.path)) {
    return "Repository understanding analysis";
  }
  if (/web-server/.test(file.path)) {
    return "Local web scanner server";
  }
  if (/project-hygiene/.test(file.path)) {
    return "Repository health and onboarding rules";
  }
  if (/route|controller/.test(file.path)) {
    return "Request routing or controller logic";
  }
  if (/model|schema/.test(file.path)) {
    return "Data model or schema logic";
  }
  return "Major implementation file inferred from repository structure";
}

function profileEvidence(files, profile) {
  const candidates = [];
  const paths = profile?.rationale ?? [];
  for (const rationale of paths) {
    const matched = files.find((file) => file.path.toLowerCase() === rationale.toLowerCase());
    if (matched) {
      candidates.push(evidence(matched, 1, rationale));
    }
  }

  if (candidates.length === 0) {
    const fallback = findFile(files, ["package.json", "index.html", "pyproject.toml", "README.md"]);
    if (fallback) {
      candidates.push(evidence(fallback, 1, profile?.rationale?.join(", ") || "Project type signal"));
    }
  }

  return candidates.slice(0, 3);
}

function isReadmeNoise(line) {
  return !line ||
    /^#{1,6}\s+/.test(line) ||
    /^[-*+]\s+/.test(line) ||
    /^\d+[.)]\s+/.test(line) ||
    /^\|/.test(line) ||
    /^!\[/.test(line) ||
    /^\[!\[/.test(line) ||
    /^<[^>]+>/.test(line) ||
    /^https?:\/\/\S+$/.test(line);
}

function cleanHeading(value) {
  return value.replace(/[`*_~]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
}

function cleanText(value, maxLength) {
  const text = String(value ?? "")
    .replace(/^>\s*/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeDeclaredPath(value) {
  return String(value).replace(/^\.\//, "").split(path.sep).join("/");
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
