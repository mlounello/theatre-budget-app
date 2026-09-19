# Phase 4 Gate 5F — Credit Cards

Status: Implemented and awaiting approval.

## Delivered

### Focused workspaces

- Split the Credit Card page into Current Statement, Exceptions, Statement History, and Cards & Setup workspaces.
- Added clear workspace counts and status context without changing the `/cc` URL.
- Made Current Statement the default workspace.

### Current Statement

- Selects the requested statement, otherwise the newest open statement, then the newest statement awaiting Banner posting.
- Shows only the selected statement's receipt and statement-line detail.
- Preserves receipt assignment and removal, statement-paid submission, Banner posting, reopening, and unposting.
- Narrows assignable receipts to the selected card while still allowing receipts whose card has not yet been assigned.
- Moves Add Reimbursement and Open Statement Month into accessible side drawers.

### Exceptions

- Separates missing receipts, unassigned cards, and other records that cannot enter the normal statement-assignment flow.
- Preserves pending totals by project or organization, account, and card.
- Keeps projectless organization-budget transactions visible and labeled distinctly.

### Statement History

- Keeps card, state, and text filters.
- Presents statement-month administration without expanding every statement's transaction detail.
- Preserves bulk editing, bulk deletion, individual editing, reopening, and deletion rules.

### Cards & Setup

- Separates card maintenance from statement processing.
- Moves Add Credit Card and Open Statement Month into drawers.
- Preserves card activation, masked-number editing, bulk actions, and deletion.

## Financial and database safety

- No database migration is required for Gate 5F.
- No posting, reversal, receipt-assignment, fiscal-year, RLS, or financial calculation logic was changed.
- Projectless organization-budget reimbursements still write an explicit fiscal year and organization.
- Existing server actions remain the only mutation paths.

## Verification

- `npm run test:phase4-gate5f`
- `npm run test:phase4-gate5a`
- `npm run test:phase4-gate3`
- `npm run build`

## Approval

Gate 5F must be reviewed and explicitly approved before merge, production deployment, or Gate 5G work begins.

