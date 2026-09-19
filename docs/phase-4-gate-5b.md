# Phase 4 Gate 5B — Variance Center

**Status:** Approved and applied 2026-09-19

## Outcome

Gate 5B replaces the vertically repeated variance forms with four compact work queues: Draft, Submitted, Approved, and Posted. A user opens one variance at a time in the shared accessible drawer, so source-bucket controls are created only for the record being worked on.

## Implemented design

- Draft includes Draft, Ready for Review, and Denied records, with their actual status preserved in a status pill.
- Each queue card shows shortage, sourced, remaining, fiscal year, creation date, and possible-duplicate count.
- The drawer contains target shortages, existing sources, same-year source search, source suggestions, status controls, workbook controls, and deletion.
- Suggestions are ranked by same organization, sufficient projected balance, available balance, and label.
- Candidate filtering remains restricted to the target fiscal year in the client, action, and existing database guardrail.
- Source removal and draft deletion now use the shared confirmation dialog instead of browser confirmation prompts.

## Duplicate handling

Possible duplicates are open drafts with the same fiscal year and exact target-bucket set.

- **Dismiss duplicate** keeps the record, changes it to Denied, and writes an audit event referencing the retained variance.
- **Combine into this draft** moves source lines to the retained draft in a transactional database function, marks the duplicate Denied, preserves the duplicate record, and writes audit events to both records.
- Combining rejects different fiscal years, non-open statuses, different target sets, or records the current user cannot manage.
- No duplicate-resolution path deletes a variance request.

## Verification required before approval

- Apply the Gate 5B database function only after reviewing the migration.
- Run Gate 5B tests and all earlier Phase 4 suites.
- Run the production build.
- In an authenticated preview, verify all four queues, drawer focus/Escape behavior, same-year source search, status changes, workbook links, source removal confirmation, and duplicate controls.
- Confirm scoped and impersonated users see only permitted variances.
- Confirm an attempted cross-fiscal-year source still fails at the database boundary.
- Obtain explicit Gate 5B approval before merge or production deployment.

## Approval and production database application

Gate 5B was approved on 2026-09-19. The additive duplicate-resolution function was rehearsed in a rollback-only transaction, applied to production, and recorded as migration `20260919143000`.

The timestamped pre-migration baseline ran at `2026-09-19 07:51:47 UTC`; the post-migration baseline ran at `2026-09-19 07:52:44 UTC`. Every FY26/FY27 financial count, amount, and fixed-record-set hash matched. The migration changed no financial records, RLS policy, or existing variance status.
