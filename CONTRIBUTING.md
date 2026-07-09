# Contributing

Thanks for helping improve Repo Doctor.

## Local Setup

```bash
npm test
node ./src/cli.js scan .
```

The project intentionally has no runtime dependencies in v0.1. That keeps the CLI easy to audit and simple to run in GitHub Actions.

## Pull Requests

- Add tests for new checks or reporter behavior.
- Keep findings evidence-based: every finding should point to a file and line when possible.
- Prefer deterministic checks before AI-generated interpretation.
- Update the README when user-facing behavior changes.
