# Theatre Budget App - MVP Blueprint (Day 1)

## 1. Product Goal
Replace current spreadsheet budgeting with a web app that preserves existing budget behavior, cross-category rollups, and status tracking, while removing fragile cell links/formulas.

Primary users:
- Solo Admin initially
- Rapid transition to team usage with scoped access

Deployment/stack direction:
- Web app
- Frontend + API on Vercel
- Database/Auth on Supabase
- Domain target: theatrebudgetapp.mlounello.com

## 2. Core Concepts from Current Sheets
Current spreadsheets track budget lines by category and status buckets:
- `Pending CC` (credit card activity requested/awaiting monthly posting)
- `ENC` (encumbered/committed)
- `YTD` (posted/actual)

Rollups:
- Line totals by category (Scenic, Costumes, Lighting, Sound, Rights, Props, Miscellaneous)
- Project totals
- Multi-project summary (e.g., Rumors + Dolly West's Kitchen)
- Income and budget summary at portfolio level

Important behavior to preserve:
- Encumbered and pending credit card amounts count against remaining budget
- Visibility by status and by budget code/account
- Monthly credit card posting process where charges can arrive as grouped monthly totals by account

## 3. Purchase Lifecycle (MVP)
Each purchase record will move through a simple, explicit lifecycle:

1. `Requested`
- Created by Buyer/PM/Admin
- Contains estimated and requested values
- Does not yet impact ENC/Pending/YTD unless marked committed

2. `Encumbered`
- Commitment exists (PO/request entered in college system)
- Amount contributes to `ENC`
- Counts against available budget

3. `Pending_CC`
- Used for credit card purchases that are initiated but not yet posted
- Amount contributes to `Pending CC`
- Counts against available budget

4. `Posted`
- Final actual posted amount
- Contributes to `YTD`
- No longer in ENC/Pending buckets

Status accounting formula by budget line:
- `spent_to_date = ytd_total`
- `committed_total = enc_total + pending_cc_total`
- `total_obligated = ytd_total + enc_total + pending_cc_total`
- `remaining = allocated_budget - total_obligated`

Note:
- Requested amount is tracked separately for planning and decision support.
- Requested amount does not automatically affect obligated totals until moved into Encumbered or Pending CC.
- Dashboard will show both:
  - `remaining_true = allocated_budget - (ytd_total + enc_total + pending_cc_total)`
  - `remaining_if_requested_approved = remaining_true - requested_total_open`

## 4. Roles and Permissions (MVP)

### Admin
- Full access across all projects
- Manage users, roles, budget templates, projects
- Create/edit/post purchases
- Run imports and corrections

### Project Manager (Project-scoped)
- Access only assigned projects
- Create/edit budget lines and purchases in assigned projects
- Transition purchases through statuses
- View and export project reports

### Buyer (Project + budget-code scoped)
- Access only assigned projects and assigned budget codes
- Create purchase requests with:
  - description
  - vendor (optional)
  - estimated amount
  - requested amount
  - preferred budget code (within assigned scope)
- Cannot post final actuals
- Cannot change project budgets

### Viewer
- Read-only visibility of assigned projects
- Can view status and totals as running read-only lists
- No edit permissions
- No CSV export in MVP

## 5. Credit Card Model (MVP)
You have two theatre cards that may be used on any account.

Entities:
- `credit_cards` (Card A, Card B)
- `cc_statement_months` (e.g., 2026-01)
- `cc_statement_lines` (posted monthly charges per budget code/account)

Workflow:
1. Buyer/PM enters purchase as `Pending_CC` and optionally tags known card.
2. At month-end, PM/Admin records statement posting lines by card and account.
3. System auto-matches statement lines to pending items by budget code/account and amount, then converts matches to `Posted`.
4. Admin/PM can override/edit matches later for corrections, with audit trail.
5. Dashboard shows:
- pending by account
- pending by card
- posted this month by account

Because statements can arrive as lump sums, reconciliation must support:
- one statement line mapping to many pending requests
- partial matches
- manual adjustment notes/audit trail

## 6. Data Model (Supabase/Postgres)

### Core tables
- `organizations` (optional now, future-proof)
- `users` (profile metadata; auth handled by Supabase Auth)
- `projects`
- `project_memberships`
- `roles` (enum or lookup)
- `budget_templates`
- `budget_template_lines`
- `project_budget_lines`
- `vendors`
- `purchases`
- `purchase_events` (status transitions/audit)
- `credit_cards`
- `cc_statement_months`
- `cc_statement_lines`
- `income_lines` (for project/portfolio income)

### Key columns (high value)
`projects`
- id, name, season, status, start_date, end_date

`project_budget_lines`
- id, project_id, budget_code, category, name
- allocated_amount
- sort_order, active

`purchases`
- id, project_id, budget_line_id, vendor_id
- entered_by_user_id
- title, reference_number, notes
- estimated_amount (buyer planning)
- requested_amount
- encumbered_amount
- pending_cc_amount
- posted_amount
- status (`requested|encumbered|pending_cc|posted|cancelled`)
- purchase_date, posted_date
- credit_card_id (nullable)

`purchase_events`
- id, purchase_id, from_status, to_status
- amount_snapshot fields
- changed_by_user_id, changed_at, note

`project_memberships`
- id, project_id, user_id, role
- code_scope JSON/array for Buyer budget-code restrictions

## 7. Derived Views/Queries
Create SQL views for spreadsheet-equivalent rollups:
- `v_budget_line_totals`
- `v_project_totals`
- `v_project_category_totals`
- `v_cc_pending_by_code`
- `v_cc_posted_by_month`
- `v_portfolio_summary` (expenses + income)

These views replace fragile cross-sheet formulas and become source of truth for UI/reporting.

## 8. Day 1 Screens

1. Login
- Email/password or magic link (Supabase)

2. Project Switcher + Dashboard
- Project cards
- Totals: Allocated, YTD, ENC, Pending CC, Remaining
- Planning overlay: Requested (open) and `Remaining if Requested Approved`
- Alerts: negative remaining or large pending balances

3. Project Budget Board
- Table grouped by category/budget code
- Columns: Allocated, Pending CC, ENC, YTD, Obligated, Remaining
- Expand row to see purchase detail history

4. Purchase Requests Queue
- Buyer creates request with estimated/requested amounts
- PM/Admin reviews and updates status

5. Credit Card Reconciliation
- Pending CC by card/account
- Monthly statement entry
- Match statement lines to pending purchases

6. Income + Budget Summary
- Income entries and net position view
- Equivalent to spreadsheet Budget Summary intent

7. Admin Settings
- Users, project access, buyer code scopes
- Optional template-on-project-creation toggle

## 9. Project Creation Rules
When creating a project, Admin/PM chooses one:
- `Blank project`
- `Use template` (Play/Musical default lines)

Template usage is optional every time (never forced).

## 10. Migration Strategy (One-time)
- Import existing xlsx data into staging tables
- Normalize categories, codes, vendors, references
- Load into final tables with mapping report
- No ongoing sheet sync

Migration output should include:
- row counts per source tab
- unmapped/ambiguous rows
- totals check against workbook totals

## 11. Siena Branding (MVP)
Colors:
- Primary Green: `#006b54`
- Primary Yellow: `#fcc917`
- Primary White: `#FFFFFF`
- Gradient: `#006b54 -> #1b4932`
- Secondary: `#1b4932`, `#cfc9c4`, `#0db02b`, `#b01c2e`, `#008ab1`

Typography:
- Headlines: `Oswald` (default), `Sullivan` (special display use, all caps)
- Secondary headings/callouts: `Gudea`
- Body: `Merriweather`

MVP UX target:
- Data-dense, spreadsheet-efficient layouts
- Clear status chips/colors for Requested/ENC/Pending CC/Posted
- Tablet optimization deferred but not blocked by architecture

## 12. Build Order (Recommended)
1. Auth + role model + project scoping
2. Budget line model and rollup views
3. Purchase CRUD + status transitions + audit events
4. Buyer request flow with estimated/requested fields
5. Credit card monthly reconciliation workflow
6. Income + summary reports
7. One-time xlsx migration tool
8. UI polish and Siena branding pass

## 13. Decisions Locked
1. `Requested` is shown as a planning-only metric and does not affect true remaining budget.
2. CC reconciliation auto-matches by budget code/account and amount, with manual correction support.
3. Viewers do not get CSV export in MVP.
