# Phase 4 Gate 4 — Completion Report

**Date:** 2026-09-19  
**Branch:** `codex/phase-4-gate-4`  
**Status:** Complete and awaiting approval

## Outcome

Gate 4 established one enduring organization identity per organization code and retained explicit fiscal-year memberships underneath it. No organization was deleted. Five legacy rows were deactivated and linked to their canonical organization with `superseded_by_organization_id`.

The resulting active model contains:

- four active canonical organizations;
- seven active fiscal-year memberships across FY26 and FY27;
- five applied legacy-to-canonical mappings;
- 96 durable reference-repoint log rows.

The canonical names are:

| Organization code | Canonical name |
|---|---|
| `2AC200` | Theatre |
| `2AC230` | Theatre Productions |
| `3PE000` | Events |
| `SJ5000` | University Events |

## Fiscal-year rule

The owner confirmed that all fiscal years run from June 1 through May 31. Live validation confirmed:

- FY26: 2025-06-01 through 2026-05-31;
- FY27: 2026-06-01 through 2027-05-31.

## Database changes

Two migrations were applied and recorded in Supabase migration history:

1. `20260919030000_phase4_gate4_consolidation_log_foundation.sql`
2. `20260919031000_phase4_gate4_canonicalize_organizations.sql`

The first created the permanent mapping and row-level repoint logs. The second validated the approved mappings, established canonical memberships, logged and repointed references, superseded legacy rows, and added canonical-identity and membership-consistency enforcement.

The consolidation retained the older FY27 `SJ5000 / 11080` evenly distributed budget plan on its inactive historical organization. The current July–September plan remains attached to the active canonical organization. Neither plan was deleted, combined, or altered.

## Application compatibility

Compatible application code was deployed before the reference consolidation. It now:

- resolves organization choices through fiscal-year memberships;
- creates one canonical organization plus selected fiscal-year memberships;
- edits membership participation without cloning organization identities;
- archives organizations instead of deleting them;
- uses the transaction's own fiscal year for organization-scoped authorization;
- resolves institutional-budget organizations through active memberships;
- keeps Settings project counts isolated by both canonical organization and fiscal year.

## Financial comparison

The final fixed-record-set snapshot ran at `2026-09-19 07:07:39 UTC`. FY26 and FY27 counts, amounts, and record-set hashes match the approved pre-consolidation baseline.

Key unchanged results include:

| Area | FY26 | FY27 |
|---|---:|---:|
| Project allocation | $51,447.33 | $78,275.00 |
| Institutional budget plans | $6,336.00 | $691,168.52 |
| Purchases | 157 records | 49 records |
| Income | $59,028.99 | $78,275.00 |
| Credit-card statement months | 11 | 2 |

The baseline script was corrected during verification to read transaction-owned fiscal-year columns. Its earlier organization-join fallback was obsolete after canonicalization and incorrectly classified projectless rows; the underlying transaction data was not affected.

## Security and workflow verification

- Administrator access passed.
- Database RLS regression tests passed for full-admin, allowed scoped-user, and denied out-of-scope cases.
- Credit Card RLS regression tests passed.
- Cross-fiscal-year variance creation remained rejected.
- Same-fiscal-year cross-organization variance creation remained allowed.
- Live impersonation entered David Robertson's read-only scope, showed only FY27 Rent/Props and Rent/Scenic, and exited cleanly back to the administrator profile.
- Procurement, Institutional Budget, Credit Cards, and Contracts all loaded live without application errors.
- Active selectors show one organization choice per fiscal year and organization code.

## Verification results

- Gate 4 application characterization tests: 6/6 passed.
- Full production build: passed.
- Consolidation pretest and rollback-only rehearsal: passed.
- Consolidation posttest: passed.
- Final FY26/FY27 financial comparison: passed.
- Migration-history reconciliation: passed.

## Approval boundary

Gate 4 is complete. Gate 5 must not begin until this report and the live result are reviewed and Gate 4 is explicitly approved.
