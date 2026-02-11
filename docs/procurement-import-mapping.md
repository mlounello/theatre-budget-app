# Procurement Import Mapping (Excel -> Theatre Budget App)

Use this with `/Users/mikelounello/theatre-budget-app/source-sheets/procurement-purchases-import-template.csv` (your working file) or `/Users/mikelounello/theatre-budget-app/source-sheets/procurement-purchases-import-template-blank.csv` (fresh blank template).

## 1. Workflow
1. Open your current workbook(s) in Excel.
2. Create a new tab named `procurement_import`.
3. Copy the template header row exactly.
4. Fill one row per purchase/order.
5. Export that tab as CSV.
6. Import the CSV to staging in Supabase, then run `/Users/mikelounello/theatre-budget-app/supabase/manual/procurement_import.sql`.

## 2. Required vs optional fields
- Required: `season`, `budget_tracked`
- Strongly recommended: `project_name` or `org`, `title` (if blank, importer falls back to vendor/reference), `procurement_status`, `budget_status`
- Required if `budget_tracked=true`: `budget_code` and/or `line_name` (recommended both)
- Optional: `vendor_name`, `reference_number`, `requisition_number`, `po_number`, `invoice_number`, `encumbered_amount`, `pending_cc_amount`, `posted_amount`, `ordered_on`, `received_on`, `paid_on`, `notes`, `org`

## 3. Allowed values
- `budget_tracked`: `true` or `false`
- `procurement_status`: `requested`, `ordered`, `partial_received`, `fully_received`, `invoice_sent`, `invoice_received`, `paid`, `cancelled`
- `budget_status`: `requested`, `encumbered`, `pending_cc`, `posted`, `cancelled`
- Dates: `YYYY-MM-DD`
- Importer also accepts friendly variants like `invoice received`, `invoice sent`, `paid`, `ordered` and maps them automatically.

## 4. Suggested mapping from your sheets
- `project_name`: Show title/project column (ex: `Rumors`)
- `season`: Season column (ex: `Fall 2025`)
- `title`: Description/Memo/Item text
- `vendor_name`: Vendor/Store
- `reference_number`: EC/EP/internal reference
- `requisition_number`: Req number if available
- `po_number`: PO number if available
- `invoice_number`: Invoice number if available
- `budget_tracked`: `true` for theatre budget purchases, `false` for external/other-department tracking
- `budget_code`: Account code (ex: `11300`)
- `line_name`: Budget line label (ex: `Scenic`, `Costumes`)
- `procurement_status`: Operational state of order
- `budget_status`: Financial state used by budget board
- `estimated_amount`: Estimate
- `requested_amount`: Requested/committed order value
- `encumbered_amount`: Amount in ENC bucket
- `pending_cc_amount`: Amount in pending CC bucket
- `posted_amount`: Amount posted to YTD
- `ordered_on`: Order date
- `received_on`: Receipt date
- `paid_on`: Payment date/post date
- `notes`: Extra notes
- `org`: org code or org name (used to find project when `project_name` is blank)

## 5. Practical tips
- Keep each row as one order/purchase.
- For card purchases not posted yet: `budget_status=pending_cc`, `pending_cc_amount>0`.
- For fully posted purchases: `budget_status=posted`, `posted_amount>0`.
- For off-budget tracking rows: set `budget_tracked=false` and leave `budget_code`/`line_name` blank.
- If `budget_tracked=true` but no matching budget line is found, importer safely downgrades that row to off-budget so the import can continue.
