import type { ReactNode } from "react";

export function FilterToolbar({ children, label = "Filters" }: { children: ReactNode; label?: string }) {
  return (
    <section className="uiFilterToolbar" aria-label={label}>
      {children}
    </section>
  );
}

export function BulkSelectionToolbar({
  selectedCount,
  totalCount,
  label = "items",
  children,
  sticky = false
}: {
  selectedCount: number;
  totalCount?: number;
  label?: string;
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <section className={`uiBulkToolbar${sticky ? " isSticky" : ""}`} aria-label="Bulk actions">
      <p className="bulkMeta" aria-live="polite">
        {selectedCount === 0
          ? `No ${label} selected`
          : `${selectedCount}${totalCount === undefined ? "" : ` of ${totalCount}`} ${label} selected`}
      </p>
      <div className="bulkActions">{children}</div>
    </section>
  );
}
