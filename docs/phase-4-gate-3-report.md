# Phase 4 Gate 3 — Implementation and Verification Report

**Date:** 2026-09-19  
**Branch:** `codex/phase-4-gate-3`  
**Database:** production Postgres, `app_theatre_budget` schema  
**Status:** Approved, merged, and deployed to production 2026-09-19

## Outcome

Gate 3 completed fiscal-year ownership and cut the application over to the new transaction-level fiscal-year model.

- Every Purchase, Income, Credit Card statement, and Credit Card statement line has an explicit fiscal year.
- All 26 reviewed legacy conflicts were assigned to the owner-approved fiscal year and explicitly marked resolved.
- Transaction fiscal years are now required at the database boundary.
- Project, organization-membership, statement, receipt, and fiscal-year consistency is enforced by database triggers and constraints.
- Procurement reads, filtering, creation, quick batch creation, and pagination use explicit fiscal-year scope.
- Credit Card statements and reimbursements support both project and projectless organization budgets.
- Institutional commitment syncing uses the transaction fiscal year and supports projectless organization activity.
- Institutional revenue reporting now exposes Target, Received, Remaining to Target, and Over Target. Revenue remains non-spendable and does not create shortfall variances.
- Same-fiscal-year cross-organization variance remains allowed; cross-fiscal-year access and variance are rejected.
- No organization was consolidated, superseded, deactivated, repointed, or deleted. That work remains Gate 4.

## Production migrations applied

1. `20260919020000_phase4_gate3_resolve_fiscal_year_conflicts.sql`
   - Assigned the 13 reviewed Income rows and 13 reviewed Credit Card statement months to their approved fiscal years.
   - Propagated statement fiscal years to statement lines.
   - Marked every reviewed conflict explicitly resolved.
2. `20260919022000_phase4_gate3_institutional_revenue_performance.sql`
   - Added the institutional revenue performance view.
   - Reconciles revenue targets with posted Income actuals by fiscal year, organization code, and account code.
3. `20260919023000_phase4_gate3_transaction_consistency.sql`
   - Preserved referenced legacy organization identities as valid fiscal-year memberships pending Gate 4 consolidation.
   - Added projectless Credit Card statement-line scope.
   - Added transaction, statement-line, and receipt/statement fiscal-year validation.
   - Made transaction fiscal-year fields required after all unresolved records were cleared.
4. `20260919024000_phase4_gate3_projectless_commitment_backfill.sql`
   - Added the two eligible legacy projectless FY27 posted purchases to institutional monthly commitments.
   - Corrected institutional reporting by $658.08 without changing the source purchases.

All four migrations are recorded in `supabase_migrations.schema_migrations` after their live effects were verified.

## Application changes deployed

- Procurement now uses the selected transaction fiscal year, includes a fiscal-year selector, and paginates purchases on the server at 50 records per page.
- Dashboard organization budgets and open requisitions use fiscal-year memberships and transaction fiscal years rather than `organizations.fiscal_year_id`.
- Income reads use explicit transaction fiscal years; the date-derived fallback has been removed.
- Credit Card statement creation requires an explicit fiscal year and validates the statement date against it.
- Credit Card statement editing, bulk actions, receipt matching, and posting preserve and validate fiscal-year scope.
- Credit Card reimbursement and statement-line forms can target either a project budget or a projectless organization/account budget.
- Credit Card pending summaries and display labels include projectless organization activity.
- Institutional Budget includes a revenue Target/Received/Remaining/Over Target section.

The compatible application code was deployed before the restrictive database migration. Production deployment `dpl_9Ak6yQC1guVFjs256Xcsn5JFnF3D` reached Ready and serves the primary application domain.

## Verification completed

### Application verification

- `npm run test:phase4-gate3`: 5 passed.
- `npm run test:phase4-gate2`: 4 passed.
- `npm run test:auth-boundary`: 5 passed.
- `npm run build`: passed compilation, lint, type checking, static generation, and build tracing.
- Production Procurement, Credit Card, and Institutional Budget pages rendered successfully with the new controls and reporting.
- The existing projectless Credit Card record displayed under its FY27 organization and remained linked to its FY27 statement.

### Database and access verification

- Conflict-resolution postconditions: passed.
- Required-field and consistency pre/postconditions: passed.
- Projectless institutional commitment pre/postconditions: passed.
- Revenue reporting reconciliation: passed.
- Cross-FY purchase mutation: rejected.
- Cross-FY receipt/statement assignment: rejected.
- Cross-FY variance: rejected.
- Same-FY cross-organization variance: accepted in the rollback-only test.
- Administrator and exact scoped-viewer Purchase/Income access: passed.
- Scoped Credit Card mutation-policy assertions: passed.
- Production impersonation had already been verified entering the scoped view and returning to full administrator access; Gate 3 did not change those policies.

All write-oriented boundary tests ran inside transactions and rolled back.

## Financial baseline comparison

The closing fixed-record-set snapshot was captured at `2026-09-19 06:05:10 UTC`.

The project, purchase, budget-plan, contract, Income, variance, and Credit Card counts, values, and record-set hashes remained unchanged from the approved baseline. Representative hashes remained:

| Record set | FY26 | FY27 |
|---|---|---|
| Projects | `8185ce03af200434ab2cac583c6ca63c` | `6de12dcd2b56d9eb502e27c81e6e5220` |
| Purchases | `9f5f453517e3e82301ebe294542689fc` | `309414b43666be234ab1505b002b0be4` |
| Income | `3e94d88c95267af314027cc853c439b7` | `0c6a0a86956778358615018df5a31998` |
| Credit Card statements | `ae30c01df77f816d670e3b07191fc695` | `910380f81cef7d4a28a87c15b831f382` |

One intentional reporting correction occurred: FY27 submitted institutional commitments increased from 35 records / `$39,077.11` to 37 records / `$39,735.19`. The `$658.08` change consists of two existing posted projectless purchases (`Office Supplies`, `$246.07`; `Office TV`, `$412.01`) that had valid September FY27 budget buckets but predated automatic projectless commitment syncing. Their source purchase amounts and statuses were not changed.

## Current data-state notes

- There are currently no institutional revenue target plans, so the new revenue panel correctly reports that no targets have been entered. It will populate when revenue targets are uploaded or budgeted.
- The September institutional allocation for the two backfilled projectless purchases is `$0.00`; their `$658.08` spend therefore appears as a shortage needing variance. Gate 3 did not silently invent an allocation or automatically move budget.
- Organization identity consolidation has not begun. Referenced legacy organization identities have exact fiscal-year memberships so current history remains valid until Gate 4 performs logged supersession.

## Gate 3 approval checklist

- [x] Every reviewed fiscal-year conflict resolved explicitly.
- [x] Explicit fiscal year required in transaction forms and actions.
- [x] Database consistency and required-field rules applied after compatible production writers deployed.
- [x] Reads cut over from organization/date proxies to transaction fiscal years and memberships.
- [x] Procurement fiscal-year scope and server-side pagination completed.
- [x] Projectless Credit Card reimbursement, statement, posting, and reporting support completed.
- [x] Revenue targets connected to Income actuals with the four required metrics.
- [x] FY26/FY27 fixed-set totals and hashes verified.
- [x] RLS and financial boundaries verified.
- [x] Project and projectless workflows verified.
- [x] No Gate 4 organization consolidation performed.
- [x] Owner approved Gate 3 on 2026-09-19.
- [x] Fast-forward merged to `main` and production deployment initiated from the merged revision.
