# Phase 4 Gate 2 — Implementation and Verification Report

**Date:** 2026-09-19  
**Branch:** `codex/phase-4-gate-2`  
**Database:** production Postgres, `app_theatre_budget` schema  
**Status:** Approved, merged, and deployed to production 2026-09-19

## Outcome

Gate 2 introduced the additive fiscal-year model without deleting organizations, consolidating organization identities, requiring transitional columns, or removing legacy read paths.

- All 206 purchases now have an explicit fiscal year.
- Seven active fiscal-year organization memberships exist: three in FY26 and four in FY27.
- Thirteen legacy income rows and thirteen Credit Card statement months remain deliberately unresolved and are recorded in the conflict log.
- New and legacy write paths are protected by database assignment triggers.
- Transaction RLS now evaluates the transaction's own fiscal year and was verified for an administrator and a scoped viewer.
- The live impersonation flow was verified by entering David Robertson's scoped view, confirming only his assigned FY27 Rent/Scenic and Rent/Props data was shown, and exiting back to the full administrator Settings page.
- FY26 and FY27 counts, values, and fixed-record-set hashes stayed unchanged after every migration.

## Production migrations applied

1. `20260919010000_phase4_fiscal_year_foundation.sql`
   - Added organization lifecycle fields.
   - Added `fiscal_year_organizations`.
   - Added `fiscal_year_assignment_conflicts`.
   - Created validated FY26/FY27 memberships.
2. `20260919011000_phase4_purchase_fiscal_year.sql`
   - Added nullable `purchases.fiscal_year_id`, its index, assignment trigger, and unambiguous backfill.
3. `20260919011500_fix_revenue_guardrail_trigger.sql`
   - Repaired the live generic revenue guardrail trigger after the rollback-only writer test found it referenced table-specific `OLD` fields.
4. `20260919012000_phase4_income_fiscal_year.sql`
   - Added nullable `income_lines.fiscal_year_id`, its index, assignment trigger, and explicit conflict logging.
5. `20260919013000_phase4_credit_card_fiscal_year.sql`
   - Added nullable fiscal-year/organization fields needed by the future projectless Credit Card model and compatibility triggers.
6. `20260919014000_phase4_transaction_fiscal_year_rls.sql`
   - Added the shared transaction-scope access boundary and updated Purchase, Income, and Credit Card read policies.
7. `20260919014500_phase4_credit_card_manage_rls.sql`
   - Replaced broad Credit Card mutation policies with the same scoped financial boundary.

The four previously untracked but live migrations were also reconciled into migration history only after their live effects were verified. Their SQL was not rerun.

## Application code ready to deploy after approval

- Procurement create, quick-batch, and update writers now validate and persist an explicit fiscal year.
- Income create and update writers now validate an active fiscal-year organization membership and persist an explicit fiscal year.
- Editing an unresolved legacy income row requires an explicit fiscal-year selection; its date-derived display value is never silently saved.
- Procurement, Contracts, Budget Planning, Income, and Institutional Budget selectors now use the shared fiscal-year membership resolver.
- Organization creation selectors show membership-backed choices rather than independently querying and mixing global/FY-specific organization rows.
- Legacy display fallback remains available while transitional fields are nullable.

## Verification completed

### Automated application verification

- `npm run test:phase4-gate2`: 4 passed.
- `npm run test:auth-boundary`: 5 passed.
- `npm run test:active-production-team-settings`: 1 passed.
- `npm run test:phase5a-integrations`: 5 passed.
- `npm run build`: passed compilation, lint, type checking, and static generation.

### Database verification

Every migration was first run in a rollback-only transaction, then applied, then followed immediately by its assertion script and a fixed-record-set FY26/FY27 baseline comparison.

- Membership assertions: passed.
- Purchase backfill and rollback-only writer assertions: passed.
- Revenue guardrail rollback-only writer assertions: passed after the repair migration.
- Income conflict and rollback-only writer assertions: passed.
- Credit Card compatibility and rollback-only writer assertions: passed.
- Administrator and scoped-viewer RLS assertions: passed.
- Credit Card management-policy assertions: passed.
- Impersonation enter, scoped display, and exit: passed in the production application.

### Financial baseline

The final comparison was captured after the last RLS migration. Counts, sums, and record-ID hashes were unchanged from the pre-Gate-2 baseline. Representative fixed-set hashes remained:

| Record set | FY26 | FY27 |
|---|---|---|
| Projects | `8185ce…` | `6de12d…` |
| Purchases | `9f5f45…` | `309414…` |
| Income | `3e94d8…` | `0c6a0a…` |
| Credit Card | `ae30c0…` | `910380…` |

## Conflict report requiring owner confirmation before Gate 3

No conflict below has been resolved or written into the source record. The proposed year is based on the existing date or the record's clearly labeled budget context.

### Income

| Short ID | Received | Organization | Description | Amount | Proposed FY |
|---|---:|---|---|---:|---|
| `eeba33cd` | 2025-08-01 | 2AC230 | Donation | $8.64 | FY26 |
| `3fc76391` | 2025-10-01 | 2AC200 | Starting Budget | $29,458.61 | FY26 |
| `8f2d84d8` | 2025-11-11 | 2AC230 | Donation | $60.71 | FY26 |
| `dacc1c0e` | 2025-12-10 | 2AC230 | Ticket Sales | $5,988.10 | FY26 |
| `213d400d` | 2025-12-19 | 2AC230 | Donation | $637.33 | FY26 |
| `b4a1f832` | 2026-03-13 | 2AC230 | Donation proceeds | $18.30 | FY26 |
| `3270e292` | 2026-04-13 | 2AC230 | Donation | $99.31 | FY26 |
| `ceba732e` | 2026-04-27 | 2AC230 | Dolly West's Kitchen Sales | $4,561.15 | FY26 |
| `1cd43195` | 2026-05-05 | 2AC230 | SNL | $160.00 | FY26 |
| `d8891cd0` | 2026-05-20 | 2AC230 | LUDUS Proceeds | $420.37 | FY26 |
| `503d4616` | No received date | 2AC230 | Starting Budget | $17,616.47 | FY26 |
| `52cfae41` | No received date | 2AC200 | Starting Budget | $42,184.00 | FY27 |
| `c40fe608` | No received date | 2AC230 | Starting Budget | $36,091.00 | FY27 |

### Credit Card statement months

| Proposed FY | Statement months |
|---|---|
| FY26 | October 2025 (2), November 2025 (2), December 2025 (1), February 2026 (2), March 2026 (2), April 2026 (2) |
| FY27 | August 2026 (1), September 2026 (1) |

## Restrictions confirmed

- Transitional fiscal-year fields remain nullable.
- No organization was consolidated, deleted, deactivated, repointed, or superseded.
- No old column, function, or read fallback was removed.
- No unresolved record was silently assigned.
- Credit Card projectless posting behavior is still deferred to Gate 3.
- Canonical organization consolidation remains deferred to Gate 4.

## Gate 2 approval checklist

- [x] Additive database foundation applied and verified.
- [x] Compatible application writer and selector code complete.
- [x] Tests and production build pass.
- [x] FY26/FY27 financial baselines unchanged.
- [x] Administrator, scoped-user, and impersonation paths verified.
- [x] Conflict report prepared for owner review.
- [x] Owner confirmed the proposed fiscal years for the 26 unresolved legacy records on 2026-09-19.
- [x] Gate 2 approved for merge and production deployment on 2026-09-19.
- [x] Merged to `main`, deployed, and reverified in production on 2026-09-19.

## Post-deployment verification

- Production deployment `dpl_GbUHYSbKhFjLscbUivYLoAF4CxpD` reached Ready and received the primary application alias.
- The full read-only schema, backfill, RLS, Credit Card policy, and fixed-record-set financial baseline suite passed in production.
- Procurement Add Order and Quick Batch Add both inherited the selected FY27 page scope and displayed exactly the four FY27 memberships without FY26/global duplicates.
- Impersonation was entered and exited again after deployment; the scoped dashboard and restored administrator Settings page both rendered correctly.
