import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared drawers and dialogs expose accessible modal semantics", () => {
  const drawer = read("components/ui/side-drawer.tsx");
  const modal = read("components/ui/modal-dialog.tsx");
  for (const source of [drawer, modal]) {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-labelledby/);
    assert.match(source, /useDialogBehavior/);
  }
});

test("dialog behavior traps focus, closes on Escape, restores focus, and locks page scroll", () => {
  const behavior = read("components/ui/use-dialog-behavior.ts");
  assert.match(behavior, /event\.key === "Escape"/);
  assert.match(behavior, /event\.key !== "Tab"/);
  assert.match(behavior, /previouslyFocused\?\.isConnected/);
  assert.match(behavior, /document\.body\.style\.overflow = "hidden"/);
  assert.match(behavior, /dialogStack/);
});

test("shared interaction toolkit covers every Gate 5A pattern", () => {
  const accordion = read("components/ui/accordion-section.tsx");
  const notices = read("components/ui/action-notice.tsx");
  const pending = read("components/ui/pending-button.tsx");
  const toolbars = read("components/ui/toolbars.tsx");
  const pagination = read("components/ui/pagination-controls.tsx");
  const statuses = read("components/ui/status-controls.tsx");
  assert.match(accordion, /<details/);
  assert.match(notices, /aria-live/);
  assert.match(pending, /useFormStatus/);
  assert.match(toolbars, /FilterToolbar/);
  assert.match(toolbars, /BulkSelectionToolbar/);
  assert.match(pagination, /rel="prev"/);
  assert.match(pagination, /rel="next"/);
  assert.match(statuses, /StatusPill/);
  assert.match(statuses, /StatusSelector/);
});

test("Contracts adopts the shared drawer, accordion, dialog, notice, bulk, pending, and status patterns", () => {
  const rowActions = read("app/contracts/contract-row-actions.tsx");
  const bulkExport = read("app/contracts/bulk-check-request-export.tsx");
  const inlineActions = read("app/contracts/contract-inline-actions.tsx");
  const page = read("app/contracts/page.tsx");
  assert.match(rowActions, /<SideDrawer/);
  assert.match(rowActions, /<AccordionSection/);
  assert.match(rowActions, /<ConfirmationDialog/);
  assert.match(rowActions, /<ActionNotice/);
  assert.doesNotMatch(rowActions, /window\.confirm/);
  assert.match(bulkExport, /<BulkSelectionToolbar/);
  assert.match(bulkExport, /<SideDrawer/);
  assert.match(inlineActions, /<PendingButton/);
  assert.match(inlineActions, /<StatusSelector/);
  assert.match(page, /<StatusPill/);
});

test("Procurement adopts shared server pagination without changing its URL parameters", () => {
  const page = read("app/procurement/page.tsx");
  assert.match(page, /<PaginationControls/);
  assert.match(page, /<FilterToolbar/);
  assert.match(page, /params\.set\("pr_page", String\(nextPage\)\)/);
});

test("shared overlays support reduced motion and mobile layouts", () => {
  const css = read("app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.uiDrawer/);
  assert.match(css, /\.uiModal/);
  assert.match(css, /\.uiPagination/);
});
