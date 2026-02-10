# Theatre Budget App

Initial scaffold for the Siena-branded web app that replaces spreadsheet budgeting.

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

3. Add Supabase keys to `.env.local`.

4. Run dev server:

```bash
npm run dev
```

## Database
Initial schema migration:
- `/Users/mikelounello/theatre-budget-app/supabase/migrations/202602101130_init_mvp.sql`

Apply migration in Supabase SQL editor or via Supabase CLI.

## Current implemented slice
- Siena-themed shell and navigation
- Portfolio dashboard with `remaining_true` and `remaining_if_requested_approved`
- Project budget board with status columns
- Requests queue view with purchase statuses
- Admin settings placeholder with agreed role behavior
- Supabase schema + rollup views aligned to MVP blueprint

## Next slice
1. Wire Supabase auth and real session-aware routing.
2. Replace mock data with queries to rollup views.
3. Implement Buyer request create/edit form with status transitions and audit events.
4. Build CC statement monthly reconciliation flow.
