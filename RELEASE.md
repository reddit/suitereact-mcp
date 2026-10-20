# Release Process

## Release gates

A public release requires all of the following:

- clean-clone `npm ci` and `npm run check` on Node.js 22;
- zero high or critical production dependency advisories;
- clean full-history secret scan;
- reviewed package dry-run contents;
- passing packed-package CommonJS, ESM, NodeNext, and Bundler consumer checks;
- documented third-party and source provenance review;
- approved least-privilege NetSuite deployment configuration;
- sandbox verification of the active Doc Spaces record guard, native permission
  lists, group ownership, and query (SuiteAnalytics Workbook) and statement
  email role configuration;
- required Reddit legal, trademark, security, and open-source approvals.

## Procedure

1. Update package versions and changelogs using semantic versioning.
2. Run `npm ci`, `npm run check`, `npm run audit:dependencies`, and
   `npm run check:packages` from a clean checkout.
3. Review generated package manifests and dependency-license output.
4. Create an SSH-signed annotated version tag (for example, `v0.1.0`) from an
   approved commit: `git -c gpg.format=ssh tag -s v0.1.0 -m 'Release v0.1.0'`.
   Configure the signer's public/private key path with `user.signingKey` first.
5. Configure the `npm-publish` GitHub environment with required reviewers and
   an `NPM_TOKEN` environment secret. Limit deployments to selected `v*` tags,
   and enforce a tag ruleset restricting tag creation, updates, and deletion
   to release maintainers. Add `RELEASE_ALLOWED_SIGNERS` as an environment
   variable in Git's SSH allowed-signers format (`principal ssh-ed25519 PUBLIC_KEY`),
   using only approved release public keys. Do not derive this trust list from
   the dispatched checkout. Private signing keys are never installed in CI.
6. Run the **Release packages** workflow with `publish=false` and review the
   validated package previews.
7. Dispatch the workflow at that same tag with `publish=true` after required human
   approvals. Before installing dependencies or publishing, the workflow verifies
   a protected version-tag ref, an annotated SSH signature against the configured
   signers, and matching tag/dispatch/checkout commits. Branches, lightweight or
   unsigned tags, unprotected tags, and untrusted signers fail closed. Never
   publish from a workstation.
8. Verify the release artifacts and installation instructions independently.

Building never deploys to NetSuite. Deployment remains an explicit,
environment-specific operation with its own approval and validation evidence.
