# Phase 4 Gate 5C — Budget Planning Matrix

**Status:** Approved 2026-09-19

## Outcome

Gate 5C replaces the per-account annual form and nested monthly-detail table with a spreadsheet-style June-through-May planning matrix. All visible accounts can be edited inline and saved together.

## Interaction model

- Account, prior-year actual, and annual-total columns remain frozen while monthly columns scroll horizontally.
- Month headers remain visible while the matrix scrolls vertically.
- Editing a month immediately recalculates the row's annual total.
- Changed rows receive a visible Unsaved indicator and highlighted background.
- One sticky Save Changes bar reports the dirty-row count and saves every edited row together.
- Discard Changes restores all visible rows to their last loaded values.
- Accounts without an existing plan are created when their first monthly edits are saved.

## Financial presentation

- Expense allocations and revenue targets render in separate sections.
- Revenue targets are explicitly described as expected receipts that are not spendable funds.
- Comparison values come from the immediately preceding fiscal year, aligned June through May by fiscal-month index.
- Each monthly input shows the corresponding prior-year actual beneath it.
- Annual totals show the difference from the prior-year actual total.
- Existing CSV export follows the same filtered rows and separates expense allocations from revenue targets.

## Data safety

- The save action accepts only complete 12-month rows belonging to the selected fiscal year.
- Negative monthly amounts are rejected.
- Existing access checks and database RLS remain in force.
- Monthly percentages and annual amounts are recomputed after every changed account.
- Existing per-plan actions remain available in code during this stage but are no longer rendered by the primary page.
- Institutional allocation import now resolves a canonical organization and upserts its fiscal-year membership instead of recreating FY-specific organization rows.

## Verification required before approval

- Run Gate 5C and all earlier Phase 4 tests.
- Run the production build.
- Verify FY27 Theatre and Theatre Productions matrices in an authenticated preview.
- Verify June-through-May ordering, frozen headers/columns, keyboard editing, dirty-state display, discard, and one-save behavior.
- Verify expense and revenue sections separately.
- Verify a scoped project manager can edit only permitted planning data and the same scope through impersonation.
- Confirm no production schema migration is required for Gate 5C.
- Obtain explicit Gate 5C approval before merge or production deployment.

## Approval

Gate 5C was approved on 2026-09-19. It requires no database migration; the deployment changes only application interaction and presentation while retaining the existing budget-plan tables, RLS, and calculations.
