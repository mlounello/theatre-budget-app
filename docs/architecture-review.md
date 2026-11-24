# Architecture Review

Scope: static review of the `main` tree at commit `c5c1124` (about 40K lines of TypeScript, 135 migrations). Nothing here was exercised against the live database. Behavior-preserving changes made on branch `refactor/architecture-pass` are listed at the end.

## 1. Architecture

**Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Postgres + Auth + RLS). No ORM. Data access is `supabase-js` against schema `app_theatre_budget` (plus `core` for cross-app memberships), using the signed-in user's cookie-bound anon client, so Postgres RLS is the real authorization boundary. The service-role client (`lib/supabase-admin.ts`) is confined to a few admin/cron/integration routes.

**Request flow**

```
Browser
  -> middleware.ts          session refresh, public-path allowlist, read-only "view as" gating
  -> layout: TopNav         getAccessContext() + getFiscalYearOptions()
  -> page.tsx (RSC)         getAccessContext() again, then lib/db.ts reads (or inline .from() in 5 pages)
  -> client components      forms via useActionState, drawers/toolbars in components/ui
  -> server actions         auth guard -> FormData parse -> multi-step writes / RPC -> revalidatePath
  -> Postgres               RLS policies, triggers (e.g. validate_variance_line_scope), RPCs, views
```

**Cross-cutting modules:** `lib/access.ts` (role = RPC `get_user_role` with core-membership fallback, project memberships, scoped grants, signed-cookie impersonation); `lib/fiscal-year-context.ts` (FY from query param, global picker); `lib/institutional-budget.ts` (commitment sync after purchase writes); `lib/banner-reconciliation-files.ts` (CSV/XLSX ingestion); cron and calendar routes under `app/api`.

**Money model:** a purchase moves through requested -> encumbered -> pending_cc -> posted; each state stores its own amount column, and `purchase_allocations` mirrors the amount to a budget line. Every status change must keep the amount columns, allocations, and institutional commitments consistent, and today that consistency is maintained in application code.

## 2. Critical problem areas (ranked)

1. **Multi-table writes are not atomic.** `bulkUpdateProcurementAction` runs `update purchases -> delete allocations -> insert allocation -> sync commitments` per row, over N rows, as separate round trips. A failure on row k leaves rows 1..k-1 committed, and an error between the allocation delete and insert leaves a purchase with no allocation. The same pattern (awaits inside loops) appears in `cc` (19), `settings` (18), `budget-planning` (14), `contracts` (12) actions. This is the highest-risk finding for a financial system.
2. **Redundant per-request round trips.** `getAccessContext()` has 66 call sites and no request-level memoization (no `cache()` anywhere). One page view costs middleware `getUser`, then TopNav and the page each rebuild the full access context, and `getFiscalYearOptions()` runs in both.
3. **Silent truncation.** `getIncomeRows` is capped at `.limit(500)` and the dashboard requisition lists at `.limit(100)`, with no indicator when the cap is hit. Totals computed from a truncated read are silently wrong once data grows.
4. **Aggregation in application code.** Dashboard, overview, my-budget, and income fetch row sets and sum them in JS (`lib/db.ts`). This will not scale and duplicates logic that views/RPCs should own.
5. **God files.** `lib/db.ts` is 4,319 lines (42 exported readers mixed with types). Six action files exceed 1,200 lines (`procurement` 2,252, `settings` 2,218, `cc` 1,966, `contracts` 1,860). `settings-page-client.tsx` (1,842) and `procurement-table.tsx` (1,744) are single client components.
6. **Weak typing at the data boundary.** About 1,147 `as string` casts despite a 3,344-line generated `database.types.ts`. Only `lib/validation/financial.ts` does runtime validation. Number coercion is inconsistent: six `asNumber` copies implement three different semantics (`Number("12abc")` is 0, `parseFloat("12abc")` is 12, and one passes `Infinity` through), so the same value can parse differently depending on the file.
7. **Tests pin source text, not behavior.** The 136 tests are mostly regexes over file contents. They catch deleted strings, not logic errors, and 2 already fail on stale UI-label assertions (`partial-po-invoice-transactions`, `phase4-gate5i`).
8. **Latent defect (not changed).** Bulk actions treat `purchases.project_id` as non-null (`row.project_id as string`) though projectless purchases now exist. For non-admins, bulk delete calls `requireProjectRole(null)` and fails with a misleading "Project not found"; bulk update rejects projectless rows with "Project is required when applying project."
9. **Raw database error text is returned to the UI** via `getErrorMessage`/`err(error.message)` in most actions.

## 3. Refactoring strategy

| Priority | Change | Why it was not done here |
|---|---|---|
| 1 | Move multi-row writes into one Postgres RPC per operation (`SECURITY INVOKER`, single transaction, row-level locking). **Bulk update is drafted (section 4); bulk delete, the single-row update, and commitment sync are not.** | Needs migrations; Phase 4 gates schema work behind review |
| 2 | Pass one request-scoped access context down instead of re-fetching, or add `cache()` with an explicit invalidation | Plain `cache()` is unsafe here: server actions re-render in the same request, and `budget-planning/actions.ts` reads fiscal years and can also create them, so a cached read would go stale |
| 3 | Replace JS aggregation and silent `.limit()` with SQL views/RPCs and paginate; surface "showing first N" when capped | Behavior/schema change |
| 4 | Split `lib/db.ts` by domain (`lib/data/procurement.ts`, `dashboard.ts`, ...) keeping a barrel re-export; split action files the same way | Large mechanical move best done after the Gate 3/4 data-model cutover to avoid merge pain |
| 5 | One authz module (`requireProjectAccess`, `requireOrgAccess`, `requireFiscalYearAccess`) replacing ~25 per-file `ensure*/require*` helpers | Touches every action; do alongside #4 |
| 6 | Choose one numeric coercion policy and migrate call sites deliberately | Changes edge-case behavior, needs an owner decision |
| 7 | Behavioral tests: extract pure planners (e.g. bulk-row planning, status -> amounts) and test them directly; keep source-regex tests only as guardrails | Needs a TS test runner decision |

## 4. Changes made on `refactor/architecture-pass` (behavior-preserving)

- **`lib/action-helpers.ts` (new):** single home for `ActionState`, `emptyState`, `ok`, `err`, `getErrorMessage`, `parseMoney`, `parseIdsJson`. Ten action files imported byte-identical local copies; removing them deletes ~290 lines. The three files that exported `ActionState` still re-export it.
- **`lib/access.ts`:** the four independent lookups (role RPC, core-membership fallback, project memberships, scopes) now run in one `Promise.all` instead of two serial steps, saving two round trips on every access-context call. Membership/scope parsing was duplicated for the impersonation path and is now one `buildAccessGrants`; role precedence is one `resolveEffectiveRole`. `getProjectScopedRole`/`requireProjectRole` accept an optional already-loaded `access`.
- **`app/procurement/actions.ts`:** `bulkUpdateProcurementAction` previously ran the same row derivation twice and called `ensure_project_category_line` plus a line lookup twice per row, and re-queried the project per row. It now plans once, memoizes line and project lookups per project/department pair, and loads the access context once (also used by `bulkDeleteProcurementAction`). Same 24 columns written, same error messages.

- **Atomic bulk update (draft, not applied):** `supabase/migrations/20261123120000_atomic_bulk_procurement_update.sql` adds `apply_procurement_bulk_update(jsonb)`, a `SECURITY INVOKER` function that updates every purchase and replaces its allocation in one transaction, so existing RLS and triggers still apply. `bulkUpdateProcurementAction` now builds the payload and makes one RPC call; commitment sync still runs afterward in the app. Rollback: `supabase/rollback/20261123120000_atomic_bulk_procurement_update.sql`. **Deploy order: apply the migration first, then the app code**, because the new action calls a function that doesn't exist until then. Executed against a throwaway local Postgres 17 (success, mid-batch failure rolls back earlier rows, missing keys, duplicates, empty batch); RLS was not exercised there.

**One deliberate ordering change:** an existing row with an invalid `procurement_status` now fails during validation, before any row is written. Previously, when a status was being applied, that error surfaced mid-loop after earlier rows were already saved.

**Verification:** `tsc --noEmit` clean; `next build` succeeds; tests 134 pass / 2 fail, identical to `main`; role-resolution rewrite checked against the old logic over 5,120 role/ordering combinations with no differences. **Not verified:** runtime behavior against Supabase (no database was touched), so exercise the bulk update, bulk delete, and an impersonation session before merging.
