# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
vulnerability reporting flow from the repository **Security** tab and include:

- the affected component and version or commit;
- reproduction steps and expected impact;
- whether NetSuite data, credentials, or external-provider spend is involved;
- any suggested mitigation.

Maintainers will acknowledge a complete report within five business days and
coordinate disclosure after a fix is available. Never include production
credentials, customer data, or account identifiers in a report.

## Supported versions

Until the first stable release, only the latest release on the default branch is
supported. Security fixes are not backported to older pre-1.0 releases.

## Security defaults

- The local proxy binds to loopback and requires a shared development token.
- RESTlets and application Suitelets ship disabled with no audience configured.
- The Doc Spaces record guard ships enabled for all internal roles so backing
  records cannot be changed without its authorization checks.
- Doc Spaces records require explicit native permission lists and disable direct
  UI, mobile, and quick-search access. No native role grants ship by default.
- The action-handler RESTlet's deployment audience decides which roles can call
  any action. **Run As Role** stays unset, so every action runs under the
  caller's native permissions.
- Generic SuiteQL, saved searches, source-string select-option queries, record
  schemas with live select values, customer statements, email searches, and
  invoice PDF reads require the native SuiteAnalytics Workbook permission
  (`REPO_ANALYTICS`) at View or above. So do Doc Spaces dynamic-group
  membership previews, which run caller-supplied employee criteria.
- Writes rely on native record permissions plus each action's own checks
  (transaction approval controls, Doc Spaces grants and group ownership). There
  is no separate write role list; record permissions alone do not grant
  generic query access.
- Customer statement email sends as the configured sender employee, which no
  native permission governs, so it requires a role in
  `custscript_sr_statement_email_role_ids`. The LLM proxy requires a role in
  `custscript_sr_llm_role_ids`. Empty lists deny every role.
- Every exported action requires an explicit policy in `ACTION_POLICIES`.
  Typechecking rejects missing classifications; runtime rejects unknown names.
- Existing dynamic groups can be updated only by their owner or NetSuite's
  Administrator role. Empty or invalid group criteria match no employees.
- Production credentials belong in ignored local files or NetSuite API secrets.

See [Doc Spaces authorization setup](docs/doc-spaces-security.md) before enabling
the application or assigning native record permissions.
