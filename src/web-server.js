#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderFixPrompt } from "./ai-prompt.js";
import { VERSION } from "./constants.js";
import { listProjectProfiles } from "./profile.js";
import { renderHtml } from "./reporters/html.js";
import { renderMarkdown } from "./reporters/markdown.js";
import { scanRepository } from "./scanner.js";
import { renderPrioritySummary } from "./summarizer.js";
import { resolveScanTarget } from "./target.js";

const execFileAsync = promisify(execFile);
const DEFAULT_PORT = 5177;
const DEFAULT_HOST = "127.0.0.1";
const WEB_UI_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "web-ui.html");

export function createWebServer() {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/") {
        sendHtml(response, await renderWebApp());
        return;
      }

      if (request.method === "GET" && request.url === "/api/profiles") {
        sendJson(response, { profiles: listProjectProfiles() });
        return;
      }

      if (request.method === "GET" && request.url === "/healthz") {
        sendJson(response, { ok: true, version: VERSION });
        return;
      }

      if (request.method === "POST" && request.url === "/api/scan") {
        const body = await readJsonBody(request);
        const result = await scanForWeb(body);
        sendJson(response, result);
        return;
      }

      sendJson(response, { error: "Not found" }, 404);
    } catch (error) {
      sendJson(response, { error: error.message || "Repo Doctor could not finish the scan." }, 500);
    }
  });
}

export async function scanForWeb({ target = ".", profile = null } = {}) {
  const cleanTarget = String(target || ".").trim() || ".";
  const cleanProfile = profile ? String(profile).trim() : null;
  const scanTarget = await resolveScanTarget(cleanTarget);

  try {
    const report = await scanRepository(scanTarget.rootDir, scanTarget.source, { profile: cleanProfile });
    return {
      report,
      downloads: {
        json: `${JSON.stringify(report, null, 2)}\n`,
        markdown: renderMarkdown(report),
        html: renderHtml(report),
        summary: renderPrioritySummary(report),
        fixPrompt: renderFixPrompt(report)
      }
    };
  } finally {
    await scanTarget.cleanup();
  }
}

export async function startWebServer({ host = DEFAULT_HOST, port = DEFAULT_PORT, open = true } = {}) {
  const server = createWebServer();
  const actualPort = await listenWithFallback(server, { host, port });
  const url = `http://${formatHostForUrl(host)}:${actualPort}/`;

  console.log(`Repo Doctor Web is running at ${url}`);
  console.log("Paste a local project path or GitHub URL into the page.");
  console.log("Press Ctrl+C to stop.");

  if (open) {
    await openBrowser(url);
  }

  return { server, url };
}

export function parseWebArgs(args) {
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    open: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--host") {
      options.host = requireValue(args, ++index, arg);
      continue;
    }

    if (arg === "--port" || arg === "-p") {
      const raw = requireValue(args, ++index, arg);
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("--port must be an integer between 0 and 65535.");
      }
      options.port = port;
      continue;
    }

    if (arg === "--no-open") {
      options.open = false;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return options;
}

async function listenWithFallback(server, { host, port }) {
  const attempts = port === 0 ? [0] : Array.from({ length: 20 }, (_, index) => port + index);

  for (const candidate of attempts) {
    try {
      await listen(server, { host, port: candidate });
      const address = server.address();
      return typeof address === "object" && address ? address.port : candidate;
    } catch (error) {
      if (error.code !== "EADDRINUSE" || candidate === attempts.at(-1)) {
        throw error;
      }
    }
  }

  throw new Error("No available port found.");
}

function listen(server, { host, port }) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function readJsonBody(request) {
  let raw = "";

  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1024 * 64) {
      throw new Error("Request body is too large.");
    }
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function sendHtml(response, html, statusCode = 200) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function openBrowser(url) {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
      return;
    }

    if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url]);
      return;
    }

    await execFileAsync("xdg-open", [url]);
  } catch {
    // Printing the URL is enough when the browser cannot be opened automatically.
  }
}

function formatHostForUrl(host) {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }

  return host.includes(":") ? `[${host}]` : host;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

async function renderWebApp() {
  const profileOptions = listProjectProfiles()
    .map((profile) => "<option value=\"" + escapeHtml(profile.id) + "\">" + escapeHtml(profile.label) + "</option>")
    .join("");
  const template = await readFile(WEB_UI_PATH, "utf8");

  return template
    .replaceAll("__VERSION__", escapeHtml(VERSION))
    .replace("__PROFILE_OPTIONS__", profileOptions);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function main() {
  const options = parseWebArgs(process.argv.slice(2));
  await startWebServer(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Repo Doctor Web could not start: ${error.message}`);
    process.exitCode = 1;
  });
}
