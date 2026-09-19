# Phase 4 — Fiscal-Year Integrity and Application Cleanup

**Status:** Gates 1 through 4 and Gates 5A–5E approved; Gate 5F implemented and awaiting approval
**Scope:** All 23 items and all five gates described below  
**Delivery model:** Incremental, review-gated work in short-lived gate/stage branches that merge to main after approval  
**Database target:** Production Postgres, `app_theatre_budget` schema

## Purpose

Phase 4 will correct the fiscal-year and organization model, close the remaining financial-workflow gaps, and simplify the application without interrupting the active fiscal year. This is the complete professional cleanup of the current platform, not a minimal patch.

The application must remain usable from the deployed main branch while Phase 4 is developed. Database changes through Gate 3 must therefore be additive and backward-compatible.

## Decisions Already Made

1. A fiscal year is the highest financial boundary in the application.
2. An organization may participate in multiple fiscal years.
3. Budgets and transactions must never blend between fiscal years.
4. Organizations will have one canonical identity, with explicit fiscal-year memberships.
5. Financial transactions retain their own fiscal-year identity rather than relying permanently on organization joins or date inference.
6. Existing organization rows are superseded, never deleted.
7. Revenue accounts are non-spendable. Live database enforcement of this guardrail must be verified in Gate 1.
8. Posted revenue offsets an institutional revenue target. Revenue reporting shows Target, Received, Remaining to Target, and Over Target.
9. Revenue shortfalls do not automatically generate variances.
10. Variances may move expense budget across organizations, accounts, and months within the same fiscal year. They may never cross fiscal years. Live database enforcement of this rule must be verified in Gate 1.
11. Projectless organization purchasing and Credit Card workflows are supported.
12. Existing specialized views and roles remain, including Department Totals, Procurement Tracker, Project Budget Boards, Overview, scoped access, and impersonation.
13. The current Contracts card/drawer pattern is the preferred interaction model for other operational pages.
14. Every gate requires review and approval before the next gate begins.

## Approved Safety Model

- Code work occurs in short-lived gate or stage branches. Each reviewed gate or Gate 5 sub-gate merges and deploys to main before dependent work begins.
- Database work targets the production `app_theatre_budget` schema.
- No separate staging database, Supabase database branch, backup project, or restore-point work is required for this phase.
- Schema introduction remains additive through Gate 3. Restrictive constraints are deployed only after compatible writer code has merged to main and is running in production.
- Every database migration must remain compatible with the code running in production at the moment that migration is applied.
- Columns introduced during the transition remain nullable until their backfills and conflict reports are validated.
- Old read paths remain functional until a reviewed gate explicitly cuts reads over to the new model.
- Organization records are never deleted. Obsolete records receive a supersession relationship and are excluded from new-record selectors.
- FY26 and FY27 financial totals are captured before and after every migration and compared. Because FY27 is live, comparisons use a tight, timestamped window or sums over a fixed set of record IDs, and the method and timestamp are recorded with each comparison.
- RLS changes are verified immediately with administrator, scoped-user, and impersonated-user paths.
- Tests are written before the migration they protect.
- Tests are read-only whenever possible. Tests that require writes use clearly labeled records, retain their created IDs, and clean them up reliably. Transaction rollback is preferred where feasible. In the active fiscal year, write tests use a dedicated, clearly labeled test project or organization so test records never appear as real activity on user dashboards.
- RLS replacements are performed transactionally and must remain compatible with the deployed application.

## Deployment Model

Phase 4 does not use one long-lived implementation branch. Work is divided into short-lived gate branches and, for Gate 5, short-lived sub-gate branches.

The deployment order for a schema transition is:

1. Apply additive database structures that remain compatible with the currently deployed code.
2. Merge and deploy application code that writes both the old and new model where application-level writing is required.
3. Confirm database triggers are populating the new fields for old and new application paths.
4. Validate backfill, totals, RLS, and conflict reports.
5. Apply restrictive constraints only after all production write paths populate valid values.
6. Cut reads over only after the compatible code is deployed and verified.

`NOT NULL`, strict consistency checks, removal of old fallbacks, and new required-field behavior must never be applied before the corresponding production writer is active.

## Target Data Model

### Canonical organizations

One organization record represents the enduring identity of an organization, such as `2AC200 | Theatre`.

### Fiscal-year organization memberships

A `fiscal_year_organizations` record declares that a canonical organization participates in a fiscal year. The membership holds year-specific configuration, including at minimum:

- `fiscal_year_id`
- `organization_id`
- active status
- display order
- whether project tracking is required

This membership exists before the first budget plan or transaction so the organization can appear correctly in selectors, access scopes, planning, and new-record workflows.

### Transaction fiscal years

Financial transactions carry an explicit `fiscal_year_id`. This includes purchases, organization-level income, and new projectless Credit Card records. A transaction's fiscal year is not permanently inferred from the organization row or silently assigned by date.

### Historical organizations

Legacy or duplicate organization rows remain available for historical resolution. When consolidated, they are marked inactive and receive a `superseded_by_organization_id` pointer to the canonical record. Historical references remain traceable.

## Five Execution Gates

## Gate 1 — Read-Only Audit and Baseline

Gate 1 changes no application data, schema, RLS, or production behavior.

### Work

1. Baseline the in-flight working tree before branching. Inventory every modified and untracked file, decide whether each change will be landed, shelved, or excluded, and record the decision.
2. Treat the following untracked migrations as unapplied until the live database proves otherwise:
   - `202609180030_projectless_organization_purchases.sql`;
   - `202609182150_retire_external_procurement.sql`;
   - `202609182330_revenue_guardrails.sql`;
   - `202609182345_variance_flexibility.sql`.
3. Introspect the live `app_theatre_budget` schema as the source of truth.
4. Compare live tables, columns, foreign keys, indexes, constraints, views, functions, triggers, RLS policies, and applied migrations with the repository migration files.
5. Verify whether the revenue-spending guardrail and same-FY variance enforcement exist in the live database. Until verified, migration-file definitions are proposed behavior rather than deployed protection.
6. Build a dependency matrix for every table, view, function, policy, action, and query using `organization_id` or `fiscal_year_id`.
7. Identify where fiscal year is stored explicitly and where it is derived from a project, organization, date, or fallback.
8. Group existing organizations by normalized organization code and identify null-FY, FY-specific, and conflicting duplicates.
9. Count and classify every reference to each organization record, including projects, purchases, contracts, budget plans, income, FOAPALs, access scopes, variances, and Credit Card records.
10. Simulate purchase fiscal-year backfill classification:
    - confidently resolved from project;
    - confidently resolved from organization;
    - project/organization conflict;
    - unresolved.
11. Simulate the same classification for income records and upcoming projectless Credit Card records.
12. Identify organization settings that must move to fiscal-year membership.
13. Capture authoritative FY26 and FY27 baseline totals for later migration comparisons.
14. Write characterization tests for existing fiscal-year isolation, project and projectless purchasing, scoped access, revenue guardrails, and cross-FY variance rejection.
15. Design the reversible duplicate-organization dropdown mitigation.
16. Document the proposed migration order, validation queries, RLS checks, deployment order, cutover requirements, and forward-repair procedures.

### Live database requirement

Repository migrations are not assumed to be an accurate description of the deployed database. The audit must inspect the live database directly. Stale migration comments or historical migration drift must be documented rather than treated as current truth.

### Gate 1 exit criteria

- In-flight modified and untracked work classified as land, shelve, or exclude before Phase 4 branches are created.
- Live application status of the four untracked migrations documented.
- Live-schema dependency audit completed.
- Repository/live-database differences documented.
- Live enforcement status of the revenue and variance guardrails documented.
- Organization duplicates and references mapped.
- Purchase and income backfill/conflict simulations completed.
- Baseline FY26 and FY27 totals recorded.
- Pre-migration characterization tests prepared.
- Dropdown mitigation designed.
- Every proposed Gate 2 migration reviewed for backward compatibility with deployed main.
- Migration-specific total and RLS verification procedures documented.
- Gate 1 findings reviewed and Gate 2 explicitly approved.

## Gate 2 — Additive Schema and Dual-Write Foundation

Gate 2 introduces the new model without removing or invalidating the old model.

### Work

1. Create the `fiscal_year_organizations` membership table and its additive indexes and constraints.
2. Add nullable `fiscal_year_id` to `purchases`.
3. Add nullable `fiscal_year_id` to `income_lines`.
4. Add the fiscal-year and organization fields required by the planned projectless Credit Card model without cutting existing reads over.
5. Populate fiscal-year memberships from validated organization/FY relationships.
6. Backfill only unambiguous purchase and income records.
7. Generate explicit conflict and unresolved-record reports for everything else.
8. Add database-level dual-write. `BEFORE INSERT OR UPDATE` triggers populate the new fiscal-year fields from the project or organization, because code running in production does not write them. When the project and organization fiscal years disagree, the trigger leaves the field null and records the row in a conflict log instead of choosing one. Application code that writes the new fields merges as part of this gate (see Deployment Model).
9. Update RLS to support checks against the transaction's own fiscal year while preserving compatibility with deployed main.
10. Add indexes needed for fiscal-year-scoped transaction queries.
11. Implement the reviewed dropdown mitigation for new-record selectors:
    - prefer an exact FY-specific organization record;
    - fall back to a global record only when no exact match exists;
    - show one creation choice per organization code;
    - continue displaying an existing record's assigned legacy organization when editing.

### Gate 2 restrictions

- No new `NOT NULL` requirements on transitional fiscal-year columns.
- No organization consolidation.
- No organization deletion.
- No removal or renaming of old columns, functions, or read paths.
- No silent resolution of conflicting records.

### Gate 2 verification

- Run the tests written before each migration.
- Compare FY26 and FY27 totals before and after every migration.
- Verify administrator, scoped-user, and impersonated-user behavior immediately after every RLS change.
- Confirm deployed main continues to create, read, and update records successfully.
- Review conflict reports before approving Gate 3.

## Gate 3 — Conflict Resolution and Model Cutover

Gate 3 completes fiscal-year ownership. New structures remain additive. Restrictive constraints (`NOT NULL`, consistency checks) are applied only after compatible writer code is deployed and verified in production, in the order defined in the Deployment Model.

### Work

1. Resolve or explicitly classify every remaining purchase and income fiscal-year conflict.
2. Require an explicit fiscal year in all new transaction actions and forms.
3. Add database consistency rules ensuring that project, organization membership, and transaction fiscal year agree.
4. Make transaction fiscal-year fields required only after validation proves that no unresolved records remain.
5. Cut application reads over to transaction fiscal year and fiscal-year organization membership.
6. Replace fiscal-year filtering that currently depends on `organizations.fiscal_year_id`.
7. Complete Procurement fiscal-year scoping and server-side pagination.
8. Complete projectless organization support for Credit Card reimbursements, statements, posting, and reporting.
9. Connect institutional revenue targets to existing income actuals.
10. Display revenue Target, Received, Remaining to Target, and Over Target while keeping revenue non-spendable.

### Gate 3 verification

- Migration-specific tests pass before and after deployment.
- FY26 and FY27 totals match the approved expectations.
- Cross-FY access and variance attempts are rejected at the database boundary.
- Same-FY cross-organization variances continue working.
- Project and projectless Procurement and Credit Card workflows are verified.
- Revenue totals reconcile between income and institutional-budget reporting.
- Gate 3 results are reviewed before organization consolidation begins.

## Gate 4 — Canonical Organization Consolidation

Gate 4 consolidates identity only after downstream fiscal-year ownership no longer depends on FY-specific organization rows.

### Work

1. Select one canonical organization record for each organization identity/code.
2. Validate every old-to-canonical mapping.
3. Create a persistent mapping log before any row is repointed. For every repointed row it records the table, row ID, original `organization_id`, and new `organization_id`. This log is the rollback path for this gate.
4. Repoint references only where the approved migration plan requires it. This includes access scopes (`user_access_scopes.organization_id`), where each user's fiscal-year scope must be preserved.
5. Mark legacy organization rows inactive.
6. Set `superseded_by_organization_id` on every superseded row.
7. Exclude superseded rows from new-record selectors.
8. Preserve historical labels, IDs, and traceability.
9. Add final uniqueness and membership-consistency constraints.

### Gate 4 restrictions

- No organization row is deleted.
- No historical reference becomes unresolvable.
- No organization is consolidated solely because its display name is similar; mappings require verified identity/code evidence.

### Gate 4 verification

- FY26 and FY27 totals match pre-consolidation totals.
- Every repointed row appears in the mapping log, and a query confirms the log can reconstruct the original reference for each one.
- Project, purchase, contract, income, variance, and Credit Card history remains accessible.
- Administrator access works.
- Scoped-user access works.
- Impersonation enters and exits correctly and preserves the impersonated scope.
- New selectors show one correct organization choice per fiscal year.
- Gate 4 is reviewed before the interface redesign begins.

## Gate 5 — Full Application and Workflow Cleanup

Gate 5 completes all interface, performance, accessibility, documentation, and maintainability work. Existing URLs should be preserved unless a separately reviewed redirect is required.

Gate 5 is delivered as ten sub-gates, 5A through 5J, each with its own branch, verification, and approval. 5A (shared interaction foundation) precedes the workflow redesigns that use it. The accessibility, performance, and maintainability requirements in 5J also apply to every earlier sub-gate as it is built.

### 5A — Shared interaction foundation

Build and standardize:

- side drawers;
- accordion sections;
- confirmation dialogs;
- success and error notifications;
- pending and save states;
- filter toolbars;
- bulk-selection toolbars;
- pagination controls;
- status pills and selectors;
- accessible focus management, keyboard controls, and Escape behavior.

### 5B — Variance Center

- Replace the page of repeated source lists with compact Draft, Submitted, Approved, and Posted queues.
- Open one variance in a drawer.
- Search and rank source buckets inside that drawer.
- Suggest suitable same-FY sources.
- Allow duplicate drafts to be combined, dismissed, or otherwise resolved intentionally.
- Preserve database enforcement preventing cross-FY transfers.

### 5C — Budget Planning

- Replace per-account expand/save behavior with a spreadsheet-style June-through-May matrix.
- Freeze identifying columns and month headers.
- Support inline monthly editing, automatic annual totals, prior-year comparison, visible dirty state, and one Save Changes bar.
- Separate expense allocations from revenue targets.

### 5D — Institutional Budget and Revenue

- Preserve the existing institutional monthly matrix.
- Improve frozen columns, grouping, compact/detail modes, and Allocated/Committed/Available presentation.
- Retain the Needs Variance focus mode and direct variance creation.
- Rename the Income workspace to Revenue.
- Connect institutional revenue targets to actual income.
- Preserve historical starting-budget records while ending their use as the canonical new-entry model.

### 5E — Procurement

- Move Add Order and Batch Add into drawers.
- Add Needs Attention, Open, Paid, and All work queues.
- Add server-side filtering and pagination.
- Open record details and editing in a drawer.
- Reduce default columns and add a column chooser.
- Preserve bulk selection and bulk actions.
- Display friendly status labels rather than raw database values.

### 5F — Credit Cards

Split the page into:

- Current Statement;
- Exceptions;
- Statement History;
- Cards & Setup.

Only the selected/current statement opens by default. Projectless organization-budget activity must be fully supported.

### 5G — Settings

Split Settings into:

- Structure;
- Project Allocations;
- People & Access;
- Payment Setup;
- Imports & Maintenance.

The hierarchy manager becomes the primary Structure interface. Debug moves under Imports & Maintenance rather than remaining in primary navigation.

### 5H — Dashboard and Reports

Refocus the Dashboard on work requiring attention:

- open requisitions;
- missing receipts;
- statements awaiting reconciliation;
- upcoming contract checks;
- unresolved budget shortages;
- incomplete variances;
- revenue targets behind schedule.

Preserve detailed reporting under Reports, including Department Totals, Procurement Tracker for its dedicated role, Project Budget Boards, and Overview.

### 5I — Contracts

- Preserve the existing contract cards, status pills, inline status updates, and edit drawer.
- Move Add Contract and Bulk Add into drawers.
- Add search, status/session/production filters, Checks Due, and Needs Attention views.
- Preserve bulk check-request selection and export.

### 5J — Accessibility, performance, and maintainability

- Provide mobile-friendly alternatives for wide operational tables.
- Label selection controls.
- Ensure drawers and dialogs are keyboard-operable.
- Add reliable focus trapping and focus restoration.
- Support Escape-to-close and reduced motion.
- Standardize typography, spacing, and visual hierarchy.
- Use server-side pagination and filtering for growing datasets.
- Load Settings and other large workspaces by section.
- Generate database types.
- Add runtime validation at financial data boundaries.
- Break oversized action, data, and client files into domain-focused modules.
- Use transactional database functions for multi-table financial updates where partial completion would be unsafe.
- Update migration, architecture, support, and operational documentation.

## The 23 Phase 4 Items

1. Complete the live-database and repository dependency audit.
2. Establish canonical organizations and fiscal-year memberships.
3. Add explicit fiscal-year identity to financial transactions.
4. Update RLS, security functions, and financial calculations.
5. Populate and validate fiscal-year organization memberships.
6. Consolidate organization identities by superseding legacy rows.
7. Repair Procurement fiscal-year scoping and pagination.
8. Complete projectless Credit Card support.
9. Connect revenue targets to income actuals.
10. Build financial regression coverage before each protected migration and workflow change.
11. Build shared drawers, dialogs, notifications, filters, bulk actions, and status controls.
12. Redesign the Variance Center.
13. Build the monthly Budget Planning matrix.
14. Improve the Institutional Budget matrix.
15. Redesign Procurement workflows.
16. Redesign Credit Card workflows.
17. Complete the Revenue workspace.
18. Split and simplify Settings.
19. Refocus Dashboard and Reports while preserving specialized views.
20. Polish Contracts without regressing its current interaction model.
21. Complete accessibility and responsive-design work.
22. Complete performance, type-safety, validation, modularity, and documentation work.
23. Run staged verification after every implementation stage.

## Verification Required After Every Migration or Stage

1. Run all existing tests and the new migration/workflow-specific tests.
2. Run the production build and static checks.
3. Compare the approved FY26 and FY27 totals.
4. Verify relevant administrator workflows.
5. Verify a scoped user's permitted and denied workflows.
6. Verify the same scope through impersonation and confirm Exit Impersonation restores full access.
7. Verify deployed main remains compatible with additive database changes through Gate 3.
8. Record unexpected differences before proceeding.
9. Review and approve the stage before starting the next one.

## Approval Boundary

Approval of this document approves the Phase 4 destination and sequencing. It does not automatically waive the review between gates.

- Gate 1 is read-only and may begin after final confirmation of this document.
- Gate 2 requires review and explicit approval of the Gate 1 report.
- Gate 3 requires review and explicit approval of Gate 2 migrations and conflict reports.
- Gate 4 requires review and explicit approval of Gate 3 totals, security checks, and cutover results.
- Gate 5 requires review and explicit approval of Gate 4 consolidation results.
- Each Gate 5 sub-gate, 5A through 5J, requires its own review and explicit approval before the next begins.

No scope listed in the 23 items is being trimmed. Changes to the plan must be recorded in this document before implementation proceeds.
