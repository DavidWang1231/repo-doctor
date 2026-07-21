const SEVERITY_RANK = {
  critical: 0,
  warning: 1,
  info: 2
};

export function renderFixPrompt(report) {
  const findings = [...report.findings].sort((a, b) => {
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title);
  });

  const lines = [];

  lines.push(`# AI Fix Prompt: ${report.project.name}`);
  lines.push("");
  lines.push("Copy the prompt below into an AI coding assistant that has access to the target repository.");
  lines.push("");
  lines.push("```text");
  lines.push("You are helping repair a repository based on a Repo Doctor health report.");
  lines.push("Use only the findings, skipped checks, repository overview, and evidence listed below.");
  lines.push("Before editing, inspect the referenced files and confirm the report still matches the repository.");
  lines.push("Do not invent missing files, vulnerabilities, tests, workflows, or line numbers.");
  lines.push("Do not add generic boilerplate for checks Repo Doctor explicitly skipped for this project type.");
  lines.push("Make small, reviewable changes that directly address the highest-priority real findings first.");
  lines.push("");
  lines.push(`Project: ${report.project.name}`);
  if (report.project.source?.url) {
    lines.push(`Source: ${report.project.source.url}`);
  }
  if (report.project.profile) {
    const overrideNote = report.project.profile.override ? " (manual override)" : "";
    lines.push(`Project type: ${report.project.profile.label}${overrideNote}`);
    if (report.project.profile.rationale?.length > 0) {
      lines.push(`Project type rationale: ${report.project.profile.rationale.join(", ")}`);
    }
  }
  if (report.understanding) {
    lines.push(`Repository overview (${report.understanding.summary.basis}): ${report.understanding.summary.text}`);
    if (report.understanding.coreFiles.length > 0) {
      lines.push("Core files identified by Repo Doctor:");
      for (const item of report.understanding.coreFiles.slice(0, 8)) {
        lines.push(`- ${item.path}: ${item.role} (${item.basis})`);
      }
    }
  }
  lines.push(`Score: ${report.score}/100`);
  lines.push("");

  if (findings.length === 0) {
    lines.push("Findings:");
    lines.push("- No findings were detected. Do not make cosmetic changes just to create activity.");
    lines.push("");
  } else {
    lines.push("Findings, in priority order:");
    for (const finding of findings.slice(0, 12)) {
      lines.push(`- [${finding.severity}] ${finding.title}`);
      lines.push(`  Category: ${finding.category}`);
      lines.push(`  Why it matters: ${finding.summary}`);
      lines.push(`  First fix: ${finding.recommendation}`);
      for (const entry of finding.evidence.slice(0, 5)) {
        const detail = entry.detail ? ` - ${entry.detail}` : "";
        lines.push(`  Evidence: ${entry.file}:${entry.line}${detail}`);
      }
    }
    lines.push("");
  }

  if (report.skipped?.length > 0) {
    lines.push("Skipped checks:");
    for (const item of report.skipped) {
      lines.push(`- ${item.title}: ${item.reason}`);
    }
    lines.push("");
  }

  lines.push("Expected response:");
  lines.push("1. Briefly say which findings are real after inspecting the repository.");
  lines.push("2. Apply the smallest useful fixes.");
  lines.push("3. Run the relevant checks.");
  lines.push("4. Summarize changed files and any remaining risks.");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
