# Repo Doctor

Evidence-based repository health checks for real-world codebases.

Repo Doctor scans a local repository and produces a prioritized health report covering documentation, testing, CI, maintainability, security hygiene, and open-source readiness. It is designed to feel like a practical reviewer, not another dashboard full of raw metrics.

```bash
npx repo-doctor scan .
```

Current v0.1 runs without runtime dependencies. The scanner is deterministic first, AI-ready second: every finding is backed by structured evidence in `report.json`, so future AI summaries can explain and prioritize issues without inventing facts.

## Why This Exists

Existing tools are excellent at deep slices of repository quality:

- OpenSSF Scorecard evaluates open-source security posture.
- SonarQube performs deep static analysis and quality inspection.
- CHAOSS tools such as GrimoireLab and Augur/Aveloxis collect and analyze open-source community metrics.

Repo Doctor takes a smaller, sharper wedge: can a maintainer or contributor quickly understand, run, test, and safely modify this repository?

## Quick Start

Clone or install the package, then run:

```bash
node ./src/cli.js scan .
```

The default output directory is `repo-doctor-report/`:

```text
repo-doctor-report/
  report.html
  report.json
  report.md
```

Use a custom output directory:

```bash
node ./src/cli.js scan ../my-project --out doctor-report
```

Fail CI when the score is below a threshold:

```bash
node ./src/cli.js scan . --fail-under 75
```

## What It Checks

- README presence, onboarding sections, and package script mismatches
- test files and standard test commands
- GitHub Actions workflows and pull request validation
- license, contribution guide, security policy, and `.gitignore`
- committed `.env` files and missing `.env.example`
- possible hard-coded secrets and dynamic execution patterns
- large source files and TODO/FIXME debt
- Docker local workflow hints
- TypeScript configuration basics

## Example Output

```text
Repo Doctor scanned repo-doctor
Health score: 86/100
Findings: 0 critical, 2 warnings, 5 total
Outputs:
- repo-doctor-report/report.json
- repo-doctor-report/report.md
- repo-doctor-report/report.html
```

Each finding includes evidence:

```text
[warning] README references package scripts that do not exist
Evidence:
- README.md:42
- package.json:8
```

## GitHub Action

After this repository is published, use it in another repository:

```yaml
name: Repo Doctor

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  repo-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-github-name/repo-doctor@v0.1.0
        with:
          path: "."
          output: "repo-doctor-report"
          fail-under: "75"
```

## Configuration

v0.1 intentionally has no configuration file. The rule set is fixed while the project proves the core workflow.

Planned configuration support:

```json
{
  "failUnder": 75,
  "ignore": ["docs/generated/**"],
  "rules": {
    "large-source-files": "warning",
    "security-policy-missing": "off"
  }
}
```

## Development

Run syntax checks:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

Scan this repository:

```bash
npm run doctor
```

## Design Principles

- Evidence before opinion.
- Deterministic checks before AI interpretation.
- Reports should be useful in a terminal, a pull request, and a browser.
- Findings should point to a next action, not just a score.
- The tool should stay easy to run in a fresh repository.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT
