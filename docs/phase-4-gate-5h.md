# Phase 4 Gate 5H — Dashboard and Reports

Status: Approved on 2026-09-19.

## Delivered

### Attention-focused dashboard

- Refocused the administrator and project-manager Dashboard around work that requires follow-up.
- Added seven attention categories: open requisitions, missing receipts, statements awaiting reconciliation, upcoming contract checks, budget shortages, incomplete variances, and revenue targets behind schedule.
- Show up to three representative items in each category and link directly to the specialist workspace where the work is completed.
- Keep all attention calculations read-only and fiscal-year scoped.

### Attention definitions

- Missing receipts are pending credit-card purchases whose documented receipt total is below the pending card amount.
- Statements awaiting reconciliation include open statements and paid statements not yet posted to Banner.
- Upcoming contract checks include unpaid artist installments and union contributions due within 45 days, plus overdue checks.
- Budget shortages use negative official monthly availability.
- Incomplete variances include draft, ready-for-review, and submitted requests.
- Revenue behind schedule compares received revenue with the target amount expected by the selected fiscal year's elapsed time.

### Progressive disclosure

- Keep requisition follow-up available but collapsed until requested.
- Keep all project and organization budget cards available but collapsed until requested.
- Preserve the existing institutional warning detail and direct links to Monthly View and Variance Center.

### Reports

- Added a Reports Hub at `/reports`.
- Preserved Overview and Department Totals.
- Preserved direct access to every Project Budget Board.
- Preserved non-theatre Organization Budget views.
- Preserved Procurement Tracker as the dedicated landing page for the procurement-tracker role.
- Renamed the former Viewer Totals navigation label to Department Totals without changing its `/my-budget` route or behavior.

## Safety

- No database migration is required for Gate 5H.
- No procurement, credit-card, contract, variance, revenue, budget, access, or impersonation mutation logic was changed.
- Attention data is loaded through existing RLS-protected tables and views.
- Viewer and procurement-tracker role routing remains unchanged.

## Verification

- `npm run test:phase4-gate5h`
- `npm run test:phase4-gate5g`
- `npm run test:phase4-gate5a`
- `npm run test:phase4-gate4`
- `npm run build`

## Approval

Gate 5H was approved for merge and production deployment on 2026-09-19. No database migration is required.
