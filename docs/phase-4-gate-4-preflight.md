# Phase 4 Gate 4 — Canonical Organization Preflight

**Date:** 2026-09-19  
**Branch:** `codex/phase-4-gate-4`  
**Status:** Consolidation applied and verified; see `phase-4-gate-4-report.md`

## Live findings

Nine active organization rows represent four normalized organization codes. The proposed canonical rows are the current FY27 identities because they hold the current-year plans and names and avoid moving the single colliding budget plan.

| Code | Proposed canonical identity | Legacy identities to supersede |
|---|---|---|
| `2AC200` | `Theatre` (`3a3c0ae6…`) | global `Theatre` (`6054084f…`) |
| `2AC230` | `Theatre Productions` (`52b71d8a…`) | global `Theatre Department` (`d9d3d185…`) |
| `3PE000` | `Events` (`210e3c74…`) | global `Events` (`9a6802af…`) |
| `SJ5000` | `University Events` (`3370dae1…`) | global (`07abbbb4…`) and FY26 (`0b102505…`) identities |

The consolidation will repoint and log 96 current references. The five legacy organization rows will remain in place, be marked inactive, and point to their canonical identity. No organization is deleted.

## Budget-plan collision

FY27 `SJ5000 / 11080` has two plans with the same `$5,964.51` annual amount:

- current FY27 identity: `$1,988.17` in July, August, and September, `$0.00` elsewhere;
- older global identity: approximately `$497.04`–`$497.05` in every month.

The prepared migration keeps the current FY27 plan on the canonical organization and retains the older plan on the inactive, superseded historical identity. It does not add the plans together, delete either plan, or alter either monthly distribution. This preserves the database baseline while the active membership-driven UI uses the current plan.

## Safety work completed

- Captured the Gate 4 pre-migration financial baseline at `2026-09-19 06:26:21 UTC`.
- Added durable `organization_consolidation_map` and `organization_reference_repoint_log` tables in production.
- Confirmed the additive migration left every FY26/FY27 financial count, amount, and record-set hash unchanged.
- Updated application writers, selectors, Settings, access checks, and institutional resolution for canonical organizations and fiscal-year memberships.
- Passed five Gate 4 application tests and a full production build.
- Deployed the compatible application before any reference migration (`dpl_6FGFBB9Ffnp8m4Y5dP39mCAU8VkA`).
- Ran the full proposed consolidation in a production rollback-only transaction. It produced four active canonical identities, seven active FY memberships, and 96 reversible reference-log rows, then rolled back successfully.

## Confirmed decisions

The owner confirmed:

1. canonical display name `Theatre Productions` for `2AC230`;
2. current July–September `SJ5000 / 11080` plan remains current, while the older evenly distributed plan remains historical on the superseded organization;
3. fiscal years run from June 1 through May 31.

The persistent consolidation was subsequently applied and passed every Gate 4 postcondition.
