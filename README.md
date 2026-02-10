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
