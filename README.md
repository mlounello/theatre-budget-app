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

## Minimal bootstrap data
After first Google sign-in, run SQL in Supabase SQL editor to bootstrap one project and membership:

```sql
-- 1) Find your user id
select id, email from auth.users order by created_at desc;

-- 2) Create project
insert into public.projects (name, season)
values ('Rumors', 'Fall 2025')
returning id;

-- 3) Add yourself as admin for that project
insert into public.project_memberships (project_id, user_id, role)
values ('<project-id>', '<your-auth-user-id>', 'admin');

-- 4) Add budget lines
insert into public.project_budget_lines (project_id, budget_code, category, line_name, allocated_amount, sort_order)
values
  ('<project-id>', '11300', 'Scenic', 'Scenic', 2500, 1),
  ('<project-id>', '11305', 'Costumes', 'Costumes', 1500, 2),
  ('<project-id>', '11301', 'Lighting', 'Lighting', 1000, 3),
  ('<project-id>', '11302', 'Sound', 'Sound', 100, 4),
  ('<project-id>', '11304', 'Props', 'Props', 300, 5),
  ('<project-id>', '11308', 'Miscellaneous', 'Miscellaneous', 700, 6);
```

After this, dashboard, project board, and requests will load real database data.

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
