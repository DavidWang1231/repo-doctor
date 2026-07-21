import { promises as fs } from "node:fs";

const SEVERITY_RANK = {
  critical: 0,
  warning: 1,
  info: 2
};

export async function loadReport(reportPath) {
  const raw = await fs.readFile(reportPath, "utf8");
  return JSON.parse(raw);
}

export function renderPrioritySummary(report) {
  const findings = [...report.findings].sort((a, b) => {
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title);
  });
  const critical = findings.filter((finding) => finding.severity === "critical");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const lines = [];

  lines.push(`# Repo Doctor Priority Summary: ${report.project.name}`);
  lines.push("");
  lines.push(`Health score: **${report.score}/100**`);
  if (report.project.profile) {
    lines.push(`Project type: **${report.project.profile.label}**`);
  }
  lines.push(`Findings: **${critical.length} critical**, **${warnings.length} warnings**, **${findings.length} total**`);
  lines.push("");

  if (report.project.source?.url) {
    lines.push(`Source: ${report.project.source.url}`);
    lines.push("");
  }

  if (report.understanding) {
    lines.push("## Repository Overview");
    lines.push("");
    lines.push(`${report.understanding.summary.text} _(${report.understanding.summary.basis})_`);
    lines.push("");
    if (report.understanding.coreFiles.length > 0) {
      lines.push(`Core files: ${report.understanding.coreFiles.slice(0, 5).map((item) => `\`${item.path}\``).join(", ")}`);
      lines.push("");
    }
  }

  lines.push("## Executive Read");
  lines.push("");
  lines.push(renderExecutiveRead(report, critical, warnings));
  lines.push("");

  lines.push("## Priority Repair Plan");
  lines.push("");

  if (findings.length === 0) {
    lines.push("No findings were detected. Keep the current quality gates in CI and rerun Repo Doctor when project structure changes.");
  } else {
    findings.slice(0, 8).forEach((finding, index) => {
      lines.push(`### ${index + 1}. ${finding.title}`);
      lines.push("");
      lines.push(`Severity: **${finding.severity}**  `);
      lines.push(`Category: **${finding.category}**`);
      lines.push("");
      lines.push(`Why it matters: ${finding.summary}`);
      lines.push("");
      lines.push(`First fix: ${finding.recommendation}`);
      lines.push("");

      if (finding.evidence.length > 0) {
        lines.push("Evidence:");
        for (const entry of finding.evidence.slice(0, 5)) {
          const detail = entry.detail ? ` - ${entry.detail}` : "";
          lines.push(`- \`${entry.file}:${entry.line}\`${detail}`);
        }
        lines.push("");
      }
    });
  }

  if (report.skipped?.length > 0) {
    lines.push("## Skipped Checks");
    lines.push("");
    for (const item of report.skipped) {
      lines.push(`- **${item.title}:** ${item.reason}`);
    }
    lines.push("");
  }

  lines.push("## AI Handoff Prompt");
  lines.push("");
  lines.push("Use this prompt with an LLM if you want a narrative repair plan:");
  lines.push("");
  lines.push("```text");
  lines.push("You are reviewing a repository health report. Use only the findings and evidence below.");
  lines.push("Do not invent missing files, vulnerabilities, tests, workflows, or line numbers.");
  lines.push("Return a prioritized repair plan with concrete pull request-sized tasks.");
  lines.push("");
  lines.push(`Project: ${report.project.name}`);
  if (report.project.profile) {
    lines.push(`Project type: ${report.project.profile.label}`);
  }
  if (report.understanding) {
    lines.push(`Repository overview: ${report.understanding.summary.text}`);
  }
  lines.push(`Score: ${report.score}/100`);
  lines.push("Top findings:");
  for (const finding of findings.slice(0, 8)) {
    lines.push(`- [${finding.severity}] ${finding.title}: ${finding.summary}`);
    for (const entry of finding.evidence.slice(0, 3)) {
      lines.push(`  Evidence: ${entry.file}:${entry.line}`);
    }
  }
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function renderExecutiveRead(report, critical, warnings) {
  if (report.project.profile?.id === "static-game") {
    if (critical.length === 0 && warnings.length === 0) {
      return "This looks like a static game/demo, and the current profile did not find blocking project-health issues. Keep lightweight syntax checks and README play/run instructions current.";
    }

    return "This looks like a static game/demo, so the report avoids forcing library-style requirements such as unit tests, SECURITY.md, or CONTRIBUTING.md. Focus on findings that affect players or GitHub Pages delivery.";
  }

  if (critical.length === 0 && warnings.length === 0) {
    return "The repository is in strong shape according to the current ruleset. The next best improvements are deeper language-specific checks, dependency risk analysis, and real-world PR validation.";
  }

  if (critical.length > 0) {
    return `Start with the ${critical.length} critical finding(s). These are likely to block reliable onboarding, CI confidence, or safe reuse. After that, work through warnings that affect contributor setup and repeatable quality gates.`;
  }

  return `No critical findings were detected. The best next move is to resolve the ${warnings.length} warning(s), then keep the generated report in CI so regressions are visible in pull requests.`;
}
