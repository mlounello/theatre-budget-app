"use client";

import { useState } from "react";

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
      <div className="contractBulkBar">
        <div>
          <strong>Bulk check requests</strong>
          <span>{selectedCount === 0 ? "No checks selected" : `${selectedCount} of ${items.length} selected`}</span>
        </div>
        <div className="bulkActions">
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
        </div>
      </div>

      {pickerOpen ? (
        <div className="bulkCheckPickerOverlay" role="dialog" aria-modal="true" aria-label="Choose check requests">
          <section className="bulkCheckPicker">
            <header className="bulkCheckPickerHeader">
              <div>
                <p className="eyebrow">Bulk Export</p>
                <h2>Choose check requests</h2>
                <p className="helperText">Select or deselect every line that should appear in the combined PDF.</p>
              </div>
              <button
                type="button"
                className="drawerCloseButton"
                onClick={() => setPickerOpen(false)}
                aria-label="Close check request selector"
              >
                ×
              </button>
            </header>

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

            <footer className="bulkCheckPickerFooter">
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
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

export const bulkCheckRequestFormId = FORM_ID;
