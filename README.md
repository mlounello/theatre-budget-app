# Theatre Budget App

Siena-branded production budgeting app replacing spreadsheet workflows.

## Stack
- Next.js (App Router, TypeScript)
- Supabase (Auth + Postgres)
- Vercel deployment target

## Local setup
1. Install dependencies:

```bash
npm install
```

2. Create local env:

```bash
cp .env.example .env.local
```

3. Fill env vars:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

4. Run dev server:

```bash
npm run dev
```

## Supabase setup
Run migrations in this order:
1. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101130_init_mvp.sql`
2. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101300_auth_rls.sql`
3. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101345_setup_functions.sql`
4. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101430_user_profile_repair.sql`
5. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101500_project_creation_repair.sql`
6. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101530_org_fiscal_hierarchy.sql`
7. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101600_account_codes.sql`
8. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101630_admin_masterdata_and_overview.sql`
9. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101800_budget_line_rls_repair.sql`
10. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101900_income_types.sql`
11. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101930_hierarchy_sort_orders.sql`
12. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602102000_org_scoped_income.sql`
13. `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602102030_purchase_allocations.sql`

## Google login setup (Supabase)
In Supabase Dashboard:
1. `Authentication -> Providers -> Google` and enable provider.
2. Add Google OAuth Client ID/Secret.
3. Set redirect URL in Google Console to:
   - `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
4. Set App URLs in Supabase Auth settings:
   - Local site URL: `http://localhost:3000`
   - Additional redirect URL: `http://localhost:3000/auth/callback`
   - Production site URL: `https://theatrebudgetapp.mlounello.com`
   - Additional redirect URL: `https://theatrebudgetapp.mlounello.com/auth/callback`

## Bootstrap in app (no SQL required)
After first Google sign-in:
1. Open `/settings`.
2. Use **Create Project** and keep **Apply selected template lines** checked for a fast start.
3. Optionally use **Add Budget Line** for custom rows.

This automatically assigns you as project `admin` for newly created projects.

## CSV import
- Go to `/settings`
- Download template from `Download CSV Template`
- Fill rows and upload in `CSV Import`
- Import upserts: fiscal years, organizations, projects, account codes, and project budget lines

## Current implemented slice
- Google OAuth login + callback + signout
- Auth-protected routes with middleware
- Real Supabase-backed dashboard (`v_portfolio_summary`, `v_project_totals`)
- Real project budget board (`v_budget_line_totals`)
- Real request queue (create request + status updates + event audit rows)
- Credit card pending totals view (`v_cc_pending_by_code`)
- RLS policies aligned to project membership roles

## Next slice
1. Add project management UI (create project/template and assign memberships).
2. Add buyer code-scope enforcement in app layer and RLS checks.
3. Build monthly CC statement reconciliation UI (`cc_statement_months`, `cc_statement_lines`).
4. Add one-time importer from source Excel workbooks.
