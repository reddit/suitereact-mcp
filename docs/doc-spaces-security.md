# Doc Spaces authorization setup

Doc Spaces uses both native NetSuite role permissions and per-space/document
grants. Native permissions limit which tables a role can access. Application
grants determine which scoped actions an employee may perform. The RESTlet runs
as its caller; it does not elevate a viewer into an administrative role.

## Install the shared controls first

Deploy the shared action handler, Doc Spaces actions/helpers, all five custom
record definitions, and `customscript_sr_ue_doc_spaces_access` together in a
reviewed SDF change. The record guard's five deployments must remain enabled,
`RELEASED`, and applicable to all internal roles, with no execution-context or
event filters. It intentionally ships active even though public entry points
remain disabled. It does not expose a callable API or elevate the caller's role.

`npm run deploy:app -- doc-spaces` uses an app-scoped manifest and does not install
these shared controls. Install them separately before enabling the application;
do not interpret a successful frontend deploy as proof that the guard is active.

The five record types use `USEPERMISSIONLIST`, ship no role grants, and disable
direct UI, mobile, and quick-search access. A new installation therefore requires
explicit role configuration. On an existing account, audit and remove obsolete
native grants: SDF does not remove permission entries merely because they are
absent from the source XML. See Oracle's [custom-record permission deployment
rules](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4731157695.html).

## Role boundaries

| Capability                                                                                                          | Required authorization                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Scoped Doc Spaces reads                                                                                             | RESTlet audience, required native read permissions, and the action's space/document grant |
| Mutations and group-definition listings                                                                             | RESTlet audience, native permissions, and the action's ownership/admin checks             |
| Dynamic-group membership previews (caller-supplied criteria or saved group IDs)                                     | SuiteAnalytics Workbook (View) plus native employee permissions                           |
| Generic SuiteQL, saved searches, source-string selects, record schemas, statements, email searches, or invoice PDFs | SuiteAnalytics Workbook (View) plus native data permissions                               |
| List or update an existing dynamic group                                                                            | Its employee owner or the NetSuite Administrator role (internal role ID 3)                |
| Add/revoke ACL grants                                                                                               | Admin access to the original target                                                       |

Grant SuiteAnalytics Workbook only to trusted data-access roles: it permits
querying everything available through their native permissions, including
protected Doc Spaces metadata. Ordinary viewer/editor roles must not receive
Workbook merely to use scoped Doc Spaces actions.

Group-definition listings include criteria only for groups the caller can
administer. Non-Administrator callers see their own groups, including in the
group editor and permission picker; Administrator callers can see all groups.

The generic schema and select-option actions can enumerate live record names,
so they use the same gate as SuiteQL rather than acting as alternate read paths.
Customer-statement, email-search, and invoice-PDF actions use that query gate too.
New exported actions must declare a policy in the handler's `ACTION_POLICIES`;
typechecking rejects missing classifications and runtime denies unknown names.
Use `read` only for scoped/self-service actions that enforce their own access
checks; use `query` for data retrieval and `mutation` for state changes.

Native table read permissions are broader than per-space grants. Review other
ways each role could access those tables, including SuiteAnalytics/saved searches,
REST/SOAP record or query APIs, other RESTlets, and File Cabinet access. Do not
give app-only roles those alternate data-access capabilities. This caller-role
application is not an isolation boundary against users already authorized to
read the same data through native NetSuite tools.

Only trusted platform administrators may change native role grants, scripts,
deployment audiences, or settings that bypass SuiteScript execution. Do not give
application roles CSV/SOAP options that suppress user-event triggers. User events
also cannot protect writes made by another user event; do not attach other
writers or workflows to these records. These platform constraints are described
in Oracle's [execution-context documentation](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157960811083.html).

## Backing-record writes

The guard rejects UI, REST/SOAP record API, CSV, and other non-RESTlet writes. A
RESTlet origin is necessary but not sufficient: every write also passes record
authorization. Inline/partial updates load persisted values, so omitted or forged
owner/target fields do not hide the original resource.

- ACL grants can be created or deleted by target admins. They cannot be edited
  or moved in place; revoke and create a new grant instead.
- Space settings require space admin access. Ownership, slug, and backing folder
  cannot be changed through record edits.
- Documents require edit access (admin for deletion); their parent, author, and
  slug cannot be reassigned. Landing-document changes also require space admin.
- Dynamic-group updates require the persisted owner or Administrator. Ownership
  cannot be transferred through an inline update.
- Preferences belong to the authenticated employee and cannot be reassigned.

Group membership fails closed for empty/invalid rules. An OR expression is
parenthesized before applying the current-employee condition, so an unrelated
matching employee cannot confer membership on the caller.

## Sandbox acceptance checks

Before enabling production access, verify all five guard deployments and test
with separate owner, viewer, editor, query, and Administrator roles:

1. Confirm UI/CSV/REST/SOAP attempts to write a backing record are rejected with
   server script triggers enabled. Confirm app roles cannot disable the triggers.
2. Confirm a viewer cannot add/revoke grants, change an owner, or alter a group.
3. Confirm owner/admin actions work through the RESTlet and document editors can
   update permitted documents without gaining access to another space.
4. Confirm partial updates cannot change a resource's owner or target.
5. Confirm Doc Spaces record permissions alone cannot execute generic SuiteQL, saved searches, or source-string selects;
   roles with SuiteAnalytics Workbook can still use those actions.
6. Confirm OR-based groups admit only employees who match their rules and that
   malformed/empty criteria never grant access.
7. Confirm native searches, integrations, and File Cabinet permissions do not
   provide app-only roles an alternate path to restricted data.

Local tests mock the NetSuite runtime; they are not evidence that a particular
account's role configuration, triggers, or File Cabinet permissions are correct.
