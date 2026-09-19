# Theatre Budget App Architecture

## Application boundaries

The application is a Next.js App Router application backed by the `app_theatre_budget` Postgres schema in Supabase. Server components load read models. Server actions authenticate the current user, validate input, enforce role and fiscal-year scope, then write through row-level security. Client components are reserved for interaction state such as drawers, filters, selection, and optimistic form feedback.

Organizations are canonical identities. `fiscal_year_organizations` records which organizations participate in each fiscal year and stores year-specific configuration. Financial transactions carry their own `fiscal_year_id`; they must not infer fiscal year from an organization row or transaction date.

## Financial boundaries

Every externally supplied financial payload is parsed with a runtime schema before authorization or database work. Money is normalized to cents, identifiers are UUIDs, and EC/EX identifiers are checked at both the application and database layers.

Multi-row financial workflows use transaction functions when a partial save would be unsafe. `create_expense_claim_transaction` commits the EC header, all EX purchases, allocations, receipts, and authorization-hold adjustment together under the caller's RLS context. Receipt files are staged first and removed if the database transaction fails. Institutional commitments are a derived projection and are synchronized immediately after the core transaction; failures are logged and surfaced without inviting a duplicate claim submission.

## Type and module ownership

`lib/database.types.ts` is generated from live schema metadata by `scripts/generate-database-types.mjs`. Refresh it after applying a migration that changes tables. Runtime validation lives in `lib/validation`. Shared interaction primitives live in `components/ui`. Large workspaces keep data loading on the server and split focused interaction panels into domain components.

## Accessibility and responsive behavior

Shared dialogs and drawers trap focus, restore the triggering focus, close with Escape, expose labelled dialog semantics, and honor reduced-motion preferences. `ResponsiveDataTable` converts dense operational rows into labelled mobile cards without duplicating business data. Selection inputs require a row-specific accessible name.

