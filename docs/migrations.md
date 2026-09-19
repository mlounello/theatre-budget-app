# Migration Procedure

1. Write the regression or characterization test before the migration it protects.
2. Record a timestamp and the FY26/FY27 baseline using `scripts/phase4-fy-baseline.sql`.
3. Keep shared-production migrations additive until compatible application code is deployed.
4. Apply the migration with stop-on-error enabled and record it in migration history.
5. Regenerate `lib/database.types.ts` when tables change.
6. Run migration-specific tests, the relevant application suites, and the production build.
7. Run the same baseline query again. Pre/post totals must match unless the migration explicitly and reviewably changes financial data.
8. Verify RLS immediately as an administrator, scoped user, and impersonated scoped user.
9. Document unexpected differences before proceeding.

## Pre/post totals

On the live FY27 database, use a tight timestamped window or a fixed list of record IDs so ordinary user activity is not mistaken for migration drift. Any write-test record must be clearly labelled, isolated from real dashboards where possible, and removed after verification.

## Roll-forward and recovery

Organizations are superseded, never deleted. Canonicalization keeps the original-to-canonical mapping. Prefer corrective additive migrations over editing an already-applied migration. Transaction functions must run as `security invoker` unless a separately reviewed security requirement justifies another model.
