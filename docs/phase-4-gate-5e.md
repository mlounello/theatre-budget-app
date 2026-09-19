# Phase 4 Gate 5E — Procurement

Status: Implemented and awaiting approval.

## Delivered

- Replaced the always-open Add Order and Quick Batch Add forms with focused side drawers.
- Added Needs Attention, Open, Paid, and All work queues with fiscal-year-scoped counts.
- Added server-side fiscal year, queue, project/budget, status, type, and text filtering.
- Added server-side pagination at 25 orders per page while preserving the active filters and sort choice in navigation.
- Limited receipt and receiving-document loading to the orders on the current page.
- Replaced record-edit and bulk-edit modals with the shared accessible side drawer.
- Reduced the default table to the core order workflow and added a column chooser for Department, Account, Receiving Docs, Budget Status, and Receipt Total.
- Preserved row selection, page-level select/deselect, bulk edit, and bulk delete.
- Kept status pills and changed database-style values into readable labels.

## Queue definitions

- **Needs Attention:** requested records without a requisition number, ordered records without a PO number, received records without an invoice number, or invoice-received records without a paid date.
- **Open:** anything not Paid, Posted to Account, or Cancelled. A card statement that is paid but not yet posted remains open.
- **Paid:** records whose procurement status is Paid, plus completed card records that are Posted to Account.
- **All:** every record in the selected fiscal year that the signed-in user may access.

Queue counts intentionally describe the whole selected fiscal year; the filters below the queues refine the current result list.

## Financial and database safety

- No database migration is required for Gate 5E.
- No stored purchase, receipt, receiving-document, budget, or fiscal-year values are changed by the redesign.
- Existing server actions, authorization rules, RLS behavior, and bulk operations are preserved.
- All list queries remain subject to the signed-in user's existing database access policy.

## Verification

- `npm run test:phase4-gate5e`
- `npm run test:phase4-gate5a`
- `npm run test:phase4-gate3`
- `npm run build`

## Approval

Gate 5E must be reviewed and explicitly approved before merge, production deployment, or Gate 5F work begins.
