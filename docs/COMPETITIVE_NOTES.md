# Competitive Notes

Repo Doctor overlaps with several mature project-health tools, but aims at a different first-mile developer experience.

## Existing Tools

- OpenSSF Scorecard focuses on automated security health metrics for open-source projects. It is mature and widely used, but intentionally opinionated around security practices.
- CHAOSS GrimoireLab is a software development analytics platform. It collects data from development systems, enriches it with metrics, and supports dashboards.
- Augur/Aveloxis focuses on reliable OSS metrics collection from GitHub and GitLab at scale.
- SonarQube focuses on static analysis, security, reliability, maintainability, duplicated code, coverage, and technical debt across many languages.

## Repo Doctor Differentiation

Repo Doctor should win by being:

- one-command and local-first
- evidence-first, with file and line references
- friendly to maintainers who want a prioritized repair list rather than a giant metrics dashboard
- AI-ready without requiring AI for the core scan
- useful as CLI output, PR comment material, and a shareable HTML report

## Roadmap Thesis

The project should avoid competing head-on with security scanners or enterprise analytics suites. The better wedge is repository onboarding quality: can a competent contributor understand, run, test, and safely modify this repo within minutes?
