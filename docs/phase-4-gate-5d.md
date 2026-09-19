# Phase 4 Gate 5D — Institutional Budget and Revenue

Status: Implemented on `codex/phase-4-gate-5d`; awaiting approval.

## Delivered

### Institutional Budget

- Preserved the June-through-May institutional matrix and existing financial calculations.
- Added an at-a-glance Allocated, Committed, Available, and Needs Variance summary.
- Grouped matrix rows by fiscal year, organization, and account category.
- Added Compact and Detail modes without changing the underlying records.
- Kept identifying columns and month headers frozen while scrolling.
- Made Allocated, Committed, Available, and Projected values explicit in Detail mode.
- Preserved the Needs Variance filter, single-bucket variance creation, bulk variance creation, and Variance Center link.
- Improved revenue-target reporting with aggregate totals and per-account progress.

### Revenue workspace

- Renamed the visible Income workspace to Revenue while retaining the `/income` URL for compatibility.
- Added a target-performance view showing Target, Received, Remaining, and Over Target.
- Reused the live institutional revenue-performance view so the Institutional Budget and Revenue pages reconcile to the same source.
- Limited new revenue entry account choices to targets for the selected fiscal year and organization.
- Added server-side validation requiring a real revenue account and matching institutional target before a new receipt can be posted.
- Removed Starting Budget from new-entry and bulk-type choices.
- Preserved historical starting-budget records in a clearly labeled legacy section and allowed an existing legacy record to retain its type during editing.
- Added an alert when received revenue in the selected scope is not linked to a current institutional target.

## Financial and database safety

- No database migration is required for Gate 5D.
- No formulas, RLS policies, or stored financial records were changed.
- Revenue remains non-spendable.
- Revenue actuals continue to exclude historical `starting_budget` records.
- New starting allocations remain the responsibility of Budget Planning.

## Verification

- `npm run test:phase4-gate5d`
- `npm run test:phase4-gate5c`
- `npm run test:phase4-gate3`
- `npm run build`

Gate 5D must not merge to `main` or deploy until explicitly approved.
