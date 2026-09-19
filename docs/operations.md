# Operations Guide

## Release verification

For each financial migration, run the gate-specific application test, the full relevant regression suite, and a production build. Compare FY26 and FY27 totals before and after the migration using the same fixed record set or a tight timestamped window. Verify an administrator, a scoped user, and an impersonated scoped user before approving deployment.

## Expense Claim recovery

An Expense Claim save is atomic at the database layer: an EC header cannot remain without all requested EX lines, allocations, and receipt rows. If the transaction fails, staged receipt files are removed automatically and the user may safely correct the form and submit again.

Institutional commitments are derived after the claim transaction. If the UI reports that the claim was saved but budget sync needs administrator review, do not submit the claim again. Locate its EC number, identify its EX purchases, and rerun the existing institutional-commitment sync for those purchase IDs. Review server logs for `Expense Claim commitment sync failed` to find the affected IDs.

## Type refresh

After applying table-changing migrations, set `DATABASE_URL` to an authorized Postgres connection and run:

```sh
node scripts/generate-database-types.mjs
```

Review the generated diff, run the build, and commit the type update with the migration.

## Performance checks

Growing operational lists must be filtered and paginated in the database. Avoid loading an unbounded fiscal year and trimming it in the browser. Test narrow layouts at 860px and below and confirm all table values retain visible labels.

