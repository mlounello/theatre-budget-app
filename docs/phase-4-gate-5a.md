# Phase 4 Gate 5A — Shared Interaction Foundation

**Date:** 2026-09-19  
**Branch:** `codex/phase-4-gate-5a`  
**Status:** In progress

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

## Approval boundary

Gate 5B must not begin until Gate 5A passes build, automated checks, keyboard/live-browser verification, and explicit owner approval.
