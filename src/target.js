import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseGitHubTarget(input) {
  const trimmed = String(input ?? "").trim();
  const patterns = [
    /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/)?$/i,
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        cloneUrl: `https://github.com/${match[1]}/${match[2]}.git`,
        webUrl: `https://github.com/${match[1]}/${match[2]}`
      };
    }
  }

  return null;
}

export async function resolveScanTarget(input) {
  const githubTarget = parseGitHubTarget(input);

  if (!githubTarget) {
    return {
      rootDir: path.resolve(input || "."),
      source: {
        type: "local",
        input: input || "."
      },
      cleanup: async () => {}
    };
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "repo-doctor-remote-"));
  const cloneDir = path.join(tempRoot, githubTarget.repo);

  try {
    await execFileAsync("git", ["clone", "--depth", "1", githubTarget.cloneUrl, cloneDir], {
      maxBuffer: 1024 * 1024 * 8
    });
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    const stderr = error.stderr ? `\n${error.stderr}` : "";
    throw new Error(`Unable to clone ${githubTarget.webUrl}.${stderr}`);
  }

  return {
    rootDir: cloneDir,
    source: {
      type: "github",
      input,
      owner: githubTarget.owner,
      repo: githubTarget.repo,
      url: githubTarget.webUrl
    },
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    }
  };
}
