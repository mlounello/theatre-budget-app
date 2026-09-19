# Phase 4 Gate 1 — Live Audit and Baseline

**Audit date:** September 19, 2026  
**Branch:** `codex/phase-4-gate-1-audit`  
**Production schema:** `app_theatre_budget`  
**Gate status:** Approved September 19, 2026; Gate 2 authorized but not started  
**Production changes made by this audit:** None

## Executive conclusion

The target model and the five-gate sequence remain correct. Gate 2 can be designed from the findings below, but it must not start until this report is reviewed and the current uncommitted production work is committed and deployed from a traceable revision.

The audit found four material facts:

1. The four untracked September 18 migrations are not recorded in `supabase_migrations.schema_migrations`, but their schema, data, trigger, function, and policy effects are present in production. Production and repository migration history have drifted.
2. Every current purchase can receive a fiscal year without conflict: 186 from its project and 20 from its FY-specific organization. Income is different: all 13 rows require an explicit reviewed assignment because their organization rows are global and the application currently falls back to transaction dates.
3. Revenue-spending and same-FY variance protections are live at the database boundary. The plan's statements about those protections are now verified rather than inferred from migration files.
4. Current RLS contains overlapping broad member-read policies on financially sensitive tables. Adding transaction fiscal years without first characterizing and deliberately replacing those policies could leave scoped access broader than intended.

No data, schema, policy, deployment, or user session was changed during Gate 1. Every database statement ran inside `BEGIN READ ONLY` and ended with `ROLLBACK`.

## 1. In-flight work baseline

Gate 1 began from `main` at `4f67bc6`, matching `origin/main`, with an already-dirty working tree. The work was preserved and a short-lived branch was created without resetting or overwriting it.

### Classification

| Work | Classification | Reason |
| --- | --- | --- |
| 24 modified application files | **Land before Gate 2** | They contain the active navigation, projectless Procurement, revenue, variance, dashboard, planning, and Settings work that the live database already supports. Gate 2 must not build against an uncommitted production baseline. |
| `components/grouped-nav-menus.tsx` | **Land before Gate 2** | Part of the navigation cleanup already represented by the modified application files. |
| Four September 18 migrations | **Land/reconcile before Gate 2** | Their effects are live but their versions are absent from migration history. Preserve the files, reconcile their recorded deployment state, and do not rerun them blindly. |
| `docs/phase-4-plan.md`, this audit, and Gate 1 scripts | **Land as Gate 1 artifacts** | These are the reviewed plan, evidence, and repeatable read-only checks. |
| `supabase/.temp/cli-latest` | **Exclude** | Local Supabase CLI state; not product source or migration history. |
| Shelved work | **None identified** | The audit found no isolated change that should be discarded or shelved before Gate 2. |

### Deployment traceability

The active Vercel production deployment was Ready and dated September 18, 2026, but its inspected metadata and production environment did not expose a source commit SHA. Because the live database contains the unrecorded migration effects and the working tree contains related uncommitted application code, Gate 2's first prerequisite is to stabilize this baseline into a traceable main-branch deployment. This is not a request for a staging database or backup; it is source/deployment bookkeeping required by the approved short-lived-branch model.

## 2. Live database is the source of truth

At audit time the live schema contained:

| Object type | Count |
| --- | ---: |
| Base tables | 44 |
| Views | 15 |
| Functions | 35 |
| RLS policies | 154 |
| Indexes | 157 |
| Entries in shared Supabase migration history | 102 |

The migration directory is useful design history, but it is not a reliable record of what has run. A separate example reinforces this: the budget-planning migration still says `DO NOT APPLY YET`, while its tables and feature are live.

### Four previously “unknown” migrations

| Migration | Migration-history row | Live result | Conclusion |
| --- | --- | --- | --- |
| `202609180030_projectless_organization_purchases.sql` | Missing | `organizations.project_tracking_required`, nullable `purchases.project_id`, project-or-organization checks, organization-purchase access function, and policies exist | Applied outside recorded history |
| `202609182150_retire_external_procurement.sql` | Missing | FY26/FY27 organization rows exist; retained External Procurement project has zero purchases | Applied outside recorded history |
| `202609182330_revenue_guardrails.sql` | Missing | Three spending triggers and the zero-availability revenue behavior exist | Applied outside recorded history |
| `202609182345_variance_flexibility.sql` | Missing | Same-FY/revenue-source validation trigger and cross-org metadata exist | Applied outside recorded history |

Gate 2 must not execute these files as ordinary pending migrations. Their live definitions should first be reconciled with the files and migration history in a separately reviewed, idempotent operation.

## 3. Current fiscal-year ownership

| Subsystem | Current FY source | Current risk | Gate 2/3 direction |
| --- | --- | --- | --- |
| Projects | `projects.fiscal_year_id` | Sound explicit boundary | Retain |
| Project purchases | `purchases.project_id → projects.fiscal_year_id` | Purchase has no independent FY | Add nullable transaction FY, populate by trigger, then cut reads over |
| Projectless purchases | `purchases.organization_id → organizations.fiscal_year_id` | Organization identity is incorrectly acting as transaction FY | Add nullable transaction FY and membership-aware validation |
| Income | Project FY, otherwise `received_on`/`created_at` date range | Late or corrected receipts can silently land in the wrong FY | Add explicit FY; review the 13 existing assignments |
| Credit Card statement months | Statement date only; no FY or organization | Cannot represent projectless organization accounting safely | Add FY/organization fields before projectless CC implementation |
| Credit Card statement lines | Required project budget line | Project-only ownership | Add reviewed projectless organization/account path in Gate 3 |
| Contracts | Explicit `fiscal_year_id` and `organization_id` | Already follows target ownership, but project remains required | Preserve and add membership consistency checks later |
| Budget plans | Explicit FY + organization | Uses duplicated FY-specific organization IDs | Move year-specific org configuration to membership and later repoint canonical identity |
| Institutional commitments | Explicit FY + organization | Can disagree with future canonical mapping unless validated | Preserve, validate, and log repoints |
| Variance requests | Explicit FY | Line source/target derive FY through budget plans | Preserve; trigger already blocks cross-FY |
| Access scopes | Optional FY + organization + project | Organization rows duplicate FY identity; broad read policies may bypass scopes | Preserve user FY while moving organization identity to canonical rows |

### Direct database dependencies

Direct organization foreign keys exist on:

- `budget_plans`, `contracts`, `foapals`, `income_lines`, `institutional_budget_commitments`, `projects`, `purchases`, and `user_access_scopes`;
- `variance_request_targets`;
- both `from_organization_id` and `to_organization_id` on `variance_request_lines`.

Direct fiscal-year foreign keys exist on:

- `budget_plans` (including its source FY), `contracts`, `institutional_budget_commitments`, `organizations`, `projects`, `user_access_scopes`, and `variance_requests`.

Eight views and eleven functions reference organizations. Those indirect dependencies must be retested during Gates 2–4 even when their SQL is not changed directly.

### Application query dependencies

| Area | Current implementation | Finding |
| --- | --- | --- |
| Shared organization options | `lib/db.ts` `getOrganizationOptions()` | Reads all organization rows; no selected-FY resolver |
| Procurement | `lib/db.ts` `getProcurementData()` | Has an independent inline organizations query and mixes project/organization FY derivation |
| Institutional Budget | `app/institutional-budget/page.tsx` and `lib/institutional-budget.ts` | Uses its own exact-FY/global fallback logic |
| Dashboard | `lib/db.ts` dashboard organization budgets/open requisitions | Projectless activity filters through `organizations.fiscal_year_id` |
| Income | `lib/db.ts` `getIncomeRows()` | Falls back to `received_on`/`created_at` ranges |
| Credit Cards | `app/cc/page.tsx` and CC actions | Still project/project-budget-line centered |
| Contracts | contract actions and data queries | Writes and reads explicit FY; useful reference pattern |
| Variance | variance actions/page | Uses explicit variance FY and budget-plan FY; live trigger is authoritative |

Acceptance criteria for the eventual shared resolver: creation flows use one FY-aware organization resolver, and a repository search finds no independent organization-option query in Procurement or Institutional Budget. Record-detail lookups and reporting joins may still query organizations directly where appropriate.

## 4. Organization duplicates and references

Four normalized organization codes currently occupy nine rows.

| Code | Row / FY | Project-tracked | Projects | Purchases | Income | Contracts | Plans | FOAPALs | Scopes | Commitments | Variance targets | Variance lines |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2AC200 | Theatre / global | Yes | 2 | 37 | 2 | 24 | 0 | 1 | 0 | 0 | 0 | 0 |
| 2AC200 | Theatre / FY27 | Yes | 1 | 14 | 0 | 5 | 2 | 0 | 0 | 29 | 4 | 4 |
| 2AC230 | Theatre Department / global | Yes | 4 | 0 | 11 | 0 | 2 | 1 | 0 | 1 | 1 | 0 |
| 2AC230 | Theatre Productions / FY27 | Yes | 3 | 0 | 0 | 0 | 11 | 0 | 0 | 7 | 0 | 0 |
| 3PE000 | Events / global | No | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| 3PE000 | Events / FY27 | No | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 |
| SJ5000 | University Events / global | No | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| SJ5000 | University Events / FY26 | No | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| SJ5000 | University Events / FY27 | No | 0 | 12 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |

The difference between “Theatre Department” and “Theatre Productions” on code `2AC230` must be explicitly approved when Gate 4 selects a canonical display identity. Matching codes are strong identity evidence, but the plan correctly forbids consolidation based only on similar names.

### Settings that belong on FY membership

- active/inactive participation in the year;
- display order within the year;
- `project_tracking_required`;
- future year-specific workflow toggles or defaults.

The canonical organization retains the enduring code and name. Transactional, budget, or access relationships keep their own fiscal year.

## 5. Backfill simulation

### Purchases

| Classification | Rows |
| --- | ---: |
| Confidently resolved from project | 186 |
| Confidently resolved from FY-specific organization | 20 |
| Project/organization conflict | 0 |
| Unresolved | 0 |

The current purchase population is safe for an additive backfill, but the Gate 2 trigger must still log future disagreements rather than choosing silently.

### Income

| Classification | Rows |
| --- | ---: |
| Explicit/project resolution | 0 |
| FY-specific organization resolution | 0 |
| Date-only proposed resolution requiring review | 13 |
| Conflict/unresolved outside known date ranges | 0 |

The date simulation proposes 11 rows for FY26 and 2 for FY27. Gate 2 must not treat those dates as permanent truth without reviewing the record list.

### Credit Cards

There are 13 statement months and zero statement lines. Every statement month maps to a known FY by its date (11 FY26, 2 FY27), but all 13 lack project/FY/organization ownership at the statement level. The additive Gate 2 columns should therefore precede projectless Credit Card work.

## 6. Financial guardrails and security

### Revenue guardrail — verified live

The live `reject_new_revenue_spending` function is attached before insert/update to:

- `purchases.banner_account_code_id`;
- `purchase_allocations.account_code_id`;
- `contracts.banner_account_code_id`.

No current purchase, allocation, or contract points to a revenue account. The live institutional availability view reports zero available dollars for revenue accounts, and the source-candidate function excludes them.

### Variance boundary — verified live

The live `variance_lines_validate_scope` trigger:

- rejects source and target months from different fiscal years;
- rejects revenue accounts as sources;
- derives source and target organizations from the selected budget months;
- records whether the line crosses organizations.

All four current variance lines satisfy those rules. There are 36 current draft requests: one FY26 draft for $67.99 and 35 FY27 drafts totaling $172,851.94.

### RLS findings

The schema has 154 policies. The focused review found:

- `purchases` has FY/organization-aware projectless policies **and** two broad member-read policies (`core_member_read_purchases`, `member_read_purchases`) based only on app membership. PostgreSQL combines permissive policies with OR, so the broad policy can bypass the narrower selector policy.
- `projects`, `organizations`, and `income_lines` also have overlapping broad member-read and scoped policies.
- Credit Card statement read policies are app/member or project-membership based and have no FY/organization boundary.
- Legacy External Procurement read policies remain even though the placeholder project has no purchases.
- All 14 active access scopes are viewer scopes. There are zero existing rows where an explicit scope FY conflicts with its organization's explicit FY.

Gate 2 must inventory the intended role matrix and replace—not merely add beside—any permissive policy that would defeat transaction-FY scoping. Tests must cover admin, an allowed scoped user, a denied FY, and the same scope under impersonation immediately after each RLS change.

## 7. Authoritative FY26/FY27 baseline

**Snapshot:** `2026-09-19 04:32:54.333674 UTC`  
**Method:** one read-only transaction; aggregates paired with count and MD5 hash of sorted record IDs. Later comparisons either reuse the recorded ID set/hash or run immediately before and after a migration in a tight timestamped window.

### Project totals

| FY | Projects | Allocated | Requested open | Encumbered | Pending CC | Posted/YTD | Obligated | Remaining | Remaining if requested approved | ID-set hash |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| FY26 | 6 | $51,447.33 | $0.00 | $465.08 | $4,546.74 | $54,156.48 | $59,168.30 | -$7,720.97 | -$7,720.97 | `8185ce03af200434ab2cac583c6ca63c` |
| FY27 | 4 | $78,275.00 | $33,840.68 | $2,236.43 | $995.00 | $2,805.00 | $6,036.43 | $72,238.57 | $38,397.89 | `6de12dcd2b56d9eb502e27c81e6e5220` |

### Institutional plans and activity

| Metric | FY26 | FY27 |
| --- | ---: | ---: |
| Expense budget plans | 2 / $6,336.00 | 29 / $691,168.52 |
| Revenue budget plans | 0 / $0.00 | 0 / $0.00 |
| Purchases | 157 | 49 |
| Purchase estimated | $83,191.56 | $52,643.33 |
| Purchase requested | $0.00 | $34,859.26 |
| Purchase encumbered | $692.43 | $6,948.68 |
| Purchase pending CC | $4,546.74 | $1,494.00 |
| Purchase posted | $74,690.95 | $9,215.94 |
| Submitted commitments | 1 / $67.99 | 35 / $39,077.11 |
| Cancelled commitments | 0 / $0.00 | 1 / $125.45 |
| Income | 11 / $59,028.99 | 2 / $78,275.00 |
| Variance drafts | 1 / $67.99 | 35 / $172,851.94 |
| CC statement months | 11 | 2 |

The absence of revenue budget-plan rows confirms that Gate 3's target-versus-actual revenue connection is new work, not a completed live capability.

### Contract baseline

| FY / status | Rows | Contract value |
| --- | ---: | ---: |
| FY26 / Siena signed | 16 | $27,113.18 |
| FY27 / Contract sent | 2 | $4,459.02 |
| FY27 / Contract signed returned | 3 | $9,500.00 |
| FY27 / Siena signed | 6 | $18,459.02 |
| FY27 / W-9 requested | 2 | $1,300.00 |

The repeatable query, including ID-set hashes for every category, is in `scripts/phase4-fy-baseline.sql`.

## 8. Characterization coverage

`scripts/phase4-gate1-characterization.sql` is a read-only, fail-fast database test. It records and protects the current transition boundary by asserting:

- purchase and income FY columns are not yet present;
- every purchase has one unambiguous current FY source;
- every income row has a reviewable FY source/date and no conflicting project/organization FY;
- all three revenue-spending triggers are installed and no existing spend uses revenue;
- variance validation is installed and all current lines obey it;
- explicit FY/organization access scopes do not conflict;
- the broad purchase-member read policy remains present as known security debt;
- External Procurement retains no purchases;
- all current CC statement months are date-mappable.

The test intentionally characterizes the broad policy instead of blessing it as correct. Gate 2 tests must be written first for the desired replacement behavior, then the known-debt assertion is removed with the reviewed policy change.

## 9. Reversible dropdown mitigation design

The mitigation is application/query-only and does not consolidate data:

1. Accept selected `fiscalYearId` in one shared organization-option resolver.
2. Group active candidate rows by normalized `org_code`.
3. Prefer the exact FY row.
4. Use the global row only when no exact FY row exists.
5. Return one creation option per code.
6. When editing an existing record, retain its assigned legacy organization as a visible selected option even if it is not the preferred creation row.
7. Apply the resolver to shared forms, Procurement, and Institutional Budget; remove the two independent option-building queries.

This mitigation is reversible, introduces no schema assumption, and prevents duplicate choices while Gate 2 builds the durable membership model.

## 10. Gate 2 proposed order

Each numbered database change is a separate reviewed migration with baseline and RLS checks immediately around it.

1. Reconcile the four live-but-unrecorded migration versions without rerunning destructive/data-moving statements.
2. Add the conflict-log structure.
3. Add canonical organization support fields and the nullable `fiscal_year_organizations` membership table plus indexes; populate only validated memberships.
4. Add nullable `purchases.fiscal_year_id`.
5. Install `BEFORE INSERT OR UPDATE` purchase trigger: derive from project or FY membership; log and leave null on disagreement; never choose silently.
6. Run and review the purchase backfill; compare the fixed record set and FY totals.
7. Add nullable `income_lines.fiscal_year_id` and its trigger; date-only assignments remain in the review report until approved.
8. Add nullable CC FY/organization fields required by the accepted projectless model; do not cut reads over.
9. Add supporting indexes.
10. Write desired RLS tests, then transactionally replace policies so transaction FY is authoritative without broad-policy bypass.
11. Deploy compatible application writers and the shared dropdown mitigation.
12. Verify old and new writers, triggers, totals, scoped access, impersonation, and conflict reports. Do not add `NOT NULL` or consolidate organizations in Gate 2.

### Forward-repair rules

- A failed migration is fixed by a new additive migration; an already-run migration file is not edited in place.
- Conflict rows remain visible until an explicit resolution records who resolved them and why.
- Old read/write paths stay available through Gate 2.
- Any unexpected financial-total or RLS result stops the gate. No later migration proceeds until explained and reviewed.
- Gate 4 repoints are always logged with original and canonical organization IDs, including access scopes and their fiscal years.

## 11. Gate 1 exit criteria

- [x] In-flight work classified.
- [x] Live status of the four untracked migrations documented.
- [x] Live schema and repository drift documented.
- [x] Organization/FY dependencies mapped.
- [x] Duplicate organizations and references counted.
- [x] Purchase, income, and CC backfill classifications simulated.
- [x] Revenue and variance database protections verified live.
- [x] RLS overlap and scope risks documented.
- [x] FY26/FY27 totals and fixed record-set hashes captured.
- [x] Read-only characterization and baseline scripts prepared and executed.
- [x] Dropdown mitigation designed.
- [x] Gate 2 migration/deployment/verification/forward-repair order documented.
- [x] Gate 1 findings reviewed by the user and Gate 2 explicitly approved on September 19, 2026.

Gate 1 is complete and approved. Gate 2 remains subject to its documented migration-by-migration safeguards and review requirements.

## 12. Verification run

Completed on September 19, 2026:

- Gate 1 live characterization: passed all 12 read-only assertions and rolled back;
- repeatable FY baseline: reproduced the recorded counts, amounts, and record-set hashes and rolled back;
- authentication boundary tests: 5 passed;
- active Production Team settings test: 1 passed;
- Phase 5A integration-boundary tests: 5 passed;
- optimized production build, lint, and TypeScript validation: passed.
