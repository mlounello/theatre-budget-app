"use client";

import { useEffect, useState } from "react";

const FORM_ID = "bulk-check-request-export";
const CHECKBOX_SELECTOR = `input[type="checkbox"][form="${FORM_ID}"][name="items"]`;

function checkboxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(CHECKBOX_SELECTOR));
}

export function BulkCheckRequestExport() {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const updateCount = () => setSelectedCount(checkboxes().filter((checkbox) => checkbox.checked).length);
    document.addEventListener("change", updateCount);
    updateCount();
    return () => document.removeEventListener("change", updateCount);
  }, []);

  function setAll(checked: boolean) {
    for (const checkbox of checkboxes()) {
      checkbox.checked = checked;
    }
    setSelectedCount(checked ? checkboxes().length : 0);
  }

  return (
    <div className="contractBulkBar">
      <div>
        <strong>Bulk check requests</strong>
        <span>{selectedCount === 0 ? "Select check requests below" : `${selectedCount} selected`}</span>
      </div>
      <div className="bulkActions">
        <button type="button" className="tinyButton" onClick={() => setAll(true)}>
          Select all
        </button>
        <button type="button" className="tinyButton" onClick={() => setAll(false)} disabled={selectedCount === 0}>
          Clear
        </button>
        <form id={FORM_ID} method="post" action="/contracts/check-requests/bulk">
          <button type="submit" className="tinyButton primaryButton" disabled={selectedCount === 0}>
            Export combined PDF
          </button>
        </form>
      </div>
    </div>
  );
}

export const bulkCheckRequestFormId = FORM_ID;

