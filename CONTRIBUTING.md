# Contributing

## Before you start

Open an issue for substantial behavioral or architectural changes. Security
issues must follow [SECURITY.md](SECURITY.md), not the public issue tracker.

By contributing, you confirm that you have the right to submit the work under
the repository's BSD-3-Clause license.

## Development setup

Use Node.js 22 or newer and npm 10 or newer.

```bash
npm ci
npm run setup
npm run doctor
npm run check
```

Live NetSuite tests are optional and require a least-privilege test account.
Use `npm run doctor -- --live` before starting them. Follow
[`docs/setup.md`](docs/setup.md) to bootstrap the required RESTlets in a sandbox;
never commit credentials or account data.

## Pull requests

- Keep changes focused and explain user-visible behavior and risk.
- Add or update tests for changed behavior.
- Update app changelogs and documentation when behavior or setup changes.
- Do not commit generated app bundles, vector embeddings, test artifacts, or
  workflow state.
- Never deploy as part of a build or pull-request validation.

All required CI checks must pass before review. Maintainers may request a
security or NetSuite deployment review for privileged changes.
