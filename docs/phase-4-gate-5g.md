# Phase 4 Gate 5G — Settings

Status: Built and awaiting approval.

## Delivered

### Focused settings workspaces

- Split Settings into Structure, Project Allocations, People & Access, Payment Setup, and Imports & Maintenance.
- Show one workspace at a time while keeping the existing `/settings` route and server actions.
- Preserve the selected workspace in the URL so views can be refreshed and shared.
- Keep Payment Setup and Imports & Maintenance limited to administrators.

### Structure

- Make Hierarchy Manager the first and primary Structure interface.
- Preserve fiscal-year, organization, project, and budget-line editing and reorder controls.
- Keep entity creation, organization memberships, production categories, and account codes in the same focused workspace.

### Project Allocations and Payment Setup

- Preserve the existing Project Allocation editor in its own workspace.
- Preserve funds, programs, organizations, and FOAPAL setup in Payment Setup.

### People & Access

- Keep production-team assignments, budget scopes, magic-link access, impersonation, and user archival together.
- Preserve administrator-only user profile controls.

### Imports & Maintenance

- Move CSV import and template download into a dedicated maintenance workspace.
- Move Debug & Diagnostics out of primary navigation and link it from Imports & Maintenance.
- Keep `/debug` available to authorized administrators without changing its route or behavior.

## Safety

- No database migration is required for Gate 5G.
- No financial calculation, access-scope mutation, hierarchy mutation, impersonation, or server-action logic was changed.
- Existing edit dialogs remain outside the workspace content so their current URLs and close behavior continue to work.

## Verification

- `npm run test:phase4-gate5g`
- `npm run test:phase4-gate5a`
- `npm run test:phase4-gate4`
- `npm run build`

## Approval

Gate 5G must be reviewed and approved before Gate 5H begins.
