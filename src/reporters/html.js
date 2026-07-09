import { CATEGORY_LABELS } from "../constants.js";

export function renderHtml(report) {
  const critical = report.findings.filter((finding) => finding.severity === "critical").length;
  const warnings = report.findings.filter((finding) => finding.severity === "warning").length;
  const fixable = report.findings.filter((finding) => finding.fixable).length;
  const topLanguages = report.stats.languages.slice(0, 8);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Repo Doctor Report - ${escapeHtml(report.project.name)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17202a;
      --muted: #5d6778;
      --line: #d9dee8;
      --paper: #f6f8fb;
      --panel: #ffffff;
      --good: #16794c;
      --warn: #9a5b00;
      --bad: #b42318;
      --blue: #2458c7;
      --violet: #673ab7;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--paper);
      line-height: 1.5;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 56px;
    }

    header {
      padding: 28px 0 18px;
      border-bottom: 1px solid var(--line);
    }

    h1, h2, h3, p {
      margin-top: 0;
    }

    h1 {
      font-size: clamp(2rem, 5vw, 4rem);
      line-height: 1.02;
      margin-bottom: 12px;
      letter-spacing: 0;
    }

    h2 {
      margin: 36px 0 14px;
      font-size: 1.35rem;
    }

    h3 {
      margin-bottom: 8px;
      font-size: 1rem;
    }

    .muted {
      color: var(--muted);
    }

    .summary {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) repeat(3, minmax(140px, .6fr));
      gap: 12px;
      margin: 24px 0;
    }

    .metric,
    .finding,
    .strength,
    .profile,
    .language-row {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    .metric {
      padding: 18px;
      min-height: 110px;
    }

    .metric strong {
      display: block;
      font-size: 2.15rem;
      line-height: 1;
      margin-bottom: 8px;
    }

    .score {
      color: ${scoreColor(report.score)};
    }

    .categories {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .category {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }

    .bar {
      height: 10px;
      background: #e9edf5;
      border-radius: 999px;
      overflow: hidden;
      margin-top: 12px;
    }

    .bar span {
      display: block;
      width: var(--value);
      height: 100%;
      background: var(--bar-color);
    }

    .finding {
      padding: 16px;
      margin-bottom: 12px;
    }

    .finding-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 78px;
      height: 28px;
      border-radius: 999px;
      padding: 0 10px;
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      border: 1px solid transparent;
    }

    .badge.critical {
      color: var(--bad);
      border-color: #f4b5ae;
      background: #fff0ee;
    }

    .badge.warning {
      color: var(--warn);
      border-color: #ffd28a;
      background: #fff8e8;
    }

    .badge.info {
      color: var(--blue);
      border-color: #b8ccff;
      background: #eef4ff;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: .92em;
      background: #eef1f7;
      padding: 2px 5px;
      border-radius: 5px;
    }

    ul {
      padding-left: 20px;
    }

    .strengths {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .strength {
      padding: 14px;
      border-left: 4px solid var(--good);
    }

    .profile {
      padding: 16px;
      margin: 18px 0 0;
      border-left: 4px solid var(--blue);
    }

    .languages {
      display: grid;
      gap: 8px;
    }

    .language-row {
      display: grid;
      grid-template-columns: 1fr 90px 90px;
      gap: 12px;
      align-items: center;
      padding: 10px 12px;
    }

    @media (max-width: 780px) {
      main {
        width: min(100% - 20px, 1120px);
        padding-top: 16px;
      }

      .summary,
      .categories,
      .strengths {
        grid-template-columns: 1fr;
      }

      .finding-head {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="muted">Repo Doctor Report</p>
      <h1>${escapeHtml(report.project.name)}</h1>
      <p class="muted">Scanned ${escapeHtml(report.project.scannedAt)}. Evidence-first checks for documentation, CI, testing, maintainability, security, and open-source readiness.</p>
      ${report.project.profile ? `
        <div class="profile">
          <h3>Project Type: ${escapeHtml(report.project.profile.label)}</h3>
          <p class="muted">${escapeHtml((report.project.profile.rationale ?? []).join(", "))}</p>
        </div>
      ` : ""}
    </header>

    <section class="summary" aria-label="Summary">
      <div class="metric">
        <strong class="score">${report.score}/100</strong>
        <span class="muted">Health score</span>
      </div>
      <div class="metric">
        <strong>${critical}</strong>
        <span class="muted">Critical findings</span>
      </div>
      <div class="metric">
        <strong>${warnings}</strong>
        <span class="muted">Warnings</span>
      </div>
      <div class="metric">
        <strong>${fixable}</strong>
        <span class="muted">Fixable suggestions</span>
      </div>
    </section>

    <section>
      <h2>Category Scores</h2>
      <div class="categories">
        ${Object.values(report.categories).map((category) => renderCategory(category)).join("")}
      </div>
    </section>

    <section>
      <h2>Top Findings</h2>
      ${report.findings.length === 0 ? "<p>No issues found.</p>" : report.findings.slice(0, 20).map(renderFinding).join("")}
    </section>

    <section>
      <h2>Strengths</h2>
      <div class="strengths">
        ${report.strengths.length === 0 ? "<p>No strengths were detected by the current ruleset.</p>" : report.strengths.slice(0, 12).map(renderStrength).join("")}
      </div>
    </section>

    ${report.skipped?.length > 0 ? `
      <section>
        <h2>Skipped Checks</h2>
        <div class="strengths">
          ${report.skipped.map(renderSkipped).join("")}
        </div>
      </section>
    ` : ""}

    <section>
      <h2>Repository Stats</h2>
      <p>${report.stats.files} files, ${report.stats.lines} lines, ${formatBytes(report.stats.bytes)} scanned.</p>
      <div class="languages">
        ${topLanguages.map((language) => `
          <div class="language-row">
            <strong>${escapeHtml(language.language)}</strong>
            <span>${language.files} files</span>
            <span>${language.lines} lines</span>
          </div>
        `).join("")}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function renderCategory(category) {
  const color = scoreColor(category.score);
  return `
    <article class="category">
      <h3>${escapeHtml(category.label)}</h3>
      <strong>${category.score}/100</strong>
      <p class="muted">${category.findings} finding(s)</p>
      <div class="bar" style="--value: ${category.score}%; --bar-color: ${color};"><span></span></div>
    </article>
  `;
}

function renderFinding(finding) {
  return `
    <article class="finding">
      <div class="finding-head">
        <div>
          <h3>${escapeHtml(finding.title)}</h3>
          <p class="muted">${escapeHtml(CATEGORY_LABELS[finding.category] ?? finding.category)}</p>
        </div>
        <span class="badge ${finding.severity}">${escapeHtml(finding.severity)}</span>
      </div>
      <p>${escapeHtml(finding.summary)}</p>
      <p><strong>Recommendation:</strong> ${escapeHtml(finding.recommendation)}</p>
      ${finding.evidence.length === 0 ? "" : `
        <ul>
          ${finding.evidence.map((entry) => `<li><code>${escapeHtml(entry.file)}:${entry.line}</code>${entry.detail ? ` ${escapeHtml(entry.detail)}` : ""}</li>`).join("")}
        </ul>
      `}
    </article>
  `;
}

function renderStrength(strength) {
  return `
    <article class="strength">
      <h3>${escapeHtml(strength.title)}</h3>
      <p>${escapeHtml(strength.summary)}</p>
    </article>
  `;
}

function renderSkipped(skipped) {
  return `
    <article class="strength">
      <h3>${escapeHtml(skipped.title)}</h3>
      <p>${escapeHtml(skipped.reason)}</p>
    </article>
  `;
}

function scoreColor(score) {
  if (score >= 80) {
    return "#16794c";
  }
  if (score >= 60) {
    return "#9a5b00";
  }
  return "#b42318";
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
