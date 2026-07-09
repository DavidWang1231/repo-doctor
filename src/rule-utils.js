export function finding({
  id,
  title,
  severity,
  category,
  summary,
  recommendation,
  evidence: evidenceItems = [],
  fixable = false
}) {
  return {
    id,
    title,
    severity,
    category,
    summary,
    recommendation,
    evidence: evidenceItems,
    fixable
  };
}

export function strength({ id, title, category, summary, evidence: evidenceItems = [] }) {
  return {
    id,
    title,
    category,
    summary,
    evidence: evidenceItems
  };
}

export function skipped({ id, title, category, reason, evidence: evidenceItems = [] }) {
  return {
    id,
    title,
    category,
    reason,
    evidence: evidenceItems
  };
}

export function isTestPath(filePath) {
  return /(^|\/)(__tests__|tests?|spec)\//i.test(filePath) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(filePath) ||
    /_test\.go$/i.test(filePath) ||
    /test_.*\.py$/i.test(filePath);
}
