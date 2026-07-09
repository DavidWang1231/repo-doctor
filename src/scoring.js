import { CATEGORY_LABELS, CATEGORY_WEIGHTS, SEVERITY_DEDUCTIONS } from "./constants.js";

export function scoreCategories(findings) {
  const categories = {};

  for (const [id, label] of Object.entries(CATEGORY_LABELS)) {
    const categoryFindings = findings.filter((item) => item.category === id);
    const totalDeduction = categoryFindings.reduce((sum, item) => {
      return sum + SEVERITY_DEDUCTIONS[item.severity];
    }, 0);
    const weight = CATEGORY_WEIGHTS[id];
    const score = Math.max(0, Math.round(100 - (totalDeduction / Math.max(weight, 1)) * 100));

    categories[id] = {
      id,
      label,
      score,
      weight,
      findings: categoryFindings.length
    };
  }

  return categories;
}

export function calculateOverallScore(categories) {
  const weighted = Object.values(categories).reduce((sum, category) => {
    return sum + category.score * category.weight;
  }, 0);
  const totalWeight = Object.values(categories).reduce((sum, category) => {
    return sum + category.weight;
  }, 0);

  return Math.round(weighted / totalWeight);
}

export function sortFindings(findings) {
  const severityOrder = {
    critical: 0,
    warning: 1,
    info: 2
  };

  return findings.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }

    return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
  });
}
