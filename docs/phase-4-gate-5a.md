# Phase 4 Gate 5A — Shared Interaction Foundation

**Date:** 2026-09-19  
**Branch:** `codex/phase-4-gate-5a`  
**Status:** Approved 2026-09-19

## Purpose

Gate 5A supplies one reusable interaction language for the workflow redesigns in Gates 5B–5I. It standardizes behavior and accessibility without changing financial calculations, database structures, or existing URLs.

## Shared components

| Component | Intended use |
|---|---|
| `SideDrawer` | Add, edit, and detail workflows that should preserve page context |
| `AccordionSection` | One-at-a-time or independently controlled form/detail sections |
| `ModalDialog` | Short blocking tasks that must remain in context |
| `ConfirmationDialog` | Explicit confirmation of destructive or consequential actions |
| `ActionNotice` | Consistent success, error, information, and warning feedback |
| `PendingButton` | Prevent repeat form submission and expose progress text |
| `FilterToolbar` | Search, filter, saved-view, and column controls |
| `BulkSelectionToolbar` | Selection count and bulk actions |
| `PaginationControls` | Accessible Previous/Next server pagination |
| `StatusPill` | Readable status display |
| `StatusSelector` | Labeled inline status editing |

## Behavior contract

Drawers and dialogs:

- use native dialog accessibility semantics;
- move focus inside when opened;
- trap Tab and Shift+Tab within the active layer;
- close on Escape;
- restore focus to the triggering control;
- prevent background scrolling;
- support stacked confirmation dialogs without closing the underlying drawer;
- close when the backdrop is selected;
- remove entrance animation for users who prefer reduced motion.

Notices use assertive announcements for errors and polite announcements for other outcomes. Pending buttons disable during submission and expose `aria-busy`. Pagination keeps the current page URL model and includes previous/next relationships.

## Initial adoption

Contracts is the reference implementation because its card, status, accordion, and drawer behavior is the approved interaction model. Gate 5A moves its edit drawer, bulk check selector, destructive confirmation, notices, pending status saves, and status pills to the shared components. Procurement adopts the shared pagination component without changing its `pr_page` query parameter.

Subsequent Gate 5 stages must use these components instead of creating new page-specific overlays or toolbar patterns. Existing legacy implementations are migrated when their owning stage is redesigned.

## Verification

- Auth-boundary regression tests: 5/5 passed.
- Gate 2 regression tests: 4/4 passed.
- Gate 3 regression tests: 5/5 passed.
- Gate 4 regression tests: 6/6 passed.
- Gate 5A interaction-foundation tests: 6/6 passed.
- Full production build: passed locally and in Vercel.
- Preview deployment: `theatre-budget-411r790zo-michael-lounellos-projects.vercel.app`.
- Production was not changed before review.

The preview correctly enforces authentication and therefore cannot reuse the production-domain session cookie. Authenticated live-browser verification will run immediately after the approved 5A branch merges and deploys, before any 5B work begins. If that verification finds a regression, it remains a 5A correction and 5B stays blocked.

## Approval boundary

Gate 5A was explicitly approved on 2026-09-19. It may merge and deploy; Gate 5B begins after authenticated keyboard/live-browser verification passes.
