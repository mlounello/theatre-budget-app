"use client";

import { useState } from "react";
import { SideDrawer } from "@/components/ui/side-drawer";
import { BulkSelectionToolbar } from "@/components/ui/toolbars";

const FORM_ID = "bulk-check-request-export";

export type BulkCheckRequestItem = {
  value: string;
  contractorName: string;
  role: string;
  title: string;
  details: string;
  kind: "artist" | "union";
};

export function BulkCheckRequestExport({ items }: { items: BulkCheckRequestItem[] }) {
  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedCount = selectedValues.size;

  function setAll(checked: boolean) {
    setSelectedValues(checked ? new Set(items.map((item) => item.value)) : new Set());
  }

  function setItem(value: string, checked: boolean) {
    setSelectedValues((current) => {
      const next = new Set(current);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
}

  return (
    <>
      <BulkSelectionToolbar selectedCount={selectedCount} totalCount={items.length} label="checks" sticky>
          <button type="button" className="tinyButton" onClick={() => setPickerOpen(true)}>
            Choose checks
          </button>
          <button type="button" className="tinyButton" onClick={() => setAll(true)}>
            Select all
          </button>
          <button type="button" className="tinyButton" onClick={() => setAll(false)} disabled={selectedCount === 0}>
            Clear
          </button>
          <form id={FORM_ID} method="post" action="/contracts/check-requests/bulk">
            {Array.from(selectedValues).map((value) => (
              <input key={value} type="hidden" name="items" value={value} />
            ))}
            <button type="submit" className="tinyButton primaryButton" disabled={selectedCount === 0}>
              Export combined PDF
            </button>
          </form>
      </BulkSelectionToolbar>

      <SideDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        eyebrow="Bulk Export"
        title="Choose check requests"
        description="Select or deselect every line that should appear in the combined PDF."
        closeLabel="Close check request selector"
        footer={
          <>
            <span>{selectedCount === 0 ? "Choose at least one check request." : `${selectedCount} checks ready to export.`}</span>
            <div>
              <button type="button" className="tinyButton" onClick={() => setPickerOpen(false)}>
                Done
              </button>
              <button
                type="submit"
                className="tinyButton primaryButton"
                form={FORM_ID}
                disabled={selectedCount === 0}
              >
                Export selected
              </button>
            </div>
          </>
        }
      >
            <div className="bulkCheckPickerControls">
              <strong>{selectedCount} selected</strong>
              <div>
                <button type="button" className="tinyButton" onClick={() => setAll(true)}>
                  Select all
                </button>
                <button type="button" className="tinyButton" onClick={() => setAll(false)} disabled={selectedCount === 0}>
                  Deselect all
                </button>
              </div>
            </div>

            <div className="bulkCheckPickerList">
              {items.map((item) => (
                <label
                  className={`bulkCheckPickerLine${selectedValues.has(item.value) ? " isSelected" : ""}`}
                  key={item.value}
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.has(item.value)}
                    onChange={(event) => setItem(item.value, event.target.checked)}
                  />
                  <span className="bulkCheckPickerIdentity">
                    <strong>{item.contractorName}</strong>
                    <small>{item.role}</small>
                  </span>
                  <span className="bulkCheckPickerDescription">
                    <strong>{item.title}</strong>
                    <small>{item.details}</small>
                  </span>
                  <span className={`bulkCheckTypeBadge ${item.kind === "union" ? "isUnion" : ""}`}>
                    {item.kind === "union" ? "Separate union check" : "Artist check"}
                  </span>
                </label>
              ))}
            </div>
      </SideDrawer>
    </>
  );
}

export const bulkCheckRequestFormId = FORM_ID;
