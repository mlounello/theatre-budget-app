"use client";

import { useMemo, useState } from "react";
import { deleteRequestAction, updateRequestInline } from "@/app/requests/actions";
import type { ProjectBudgetLineOption, PurchaseRow } from "@/lib/db";

export function RequestRowActions({
  purchase,
  budgetLineOptions
}: {
  purchase: PurchaseRow;
  budgetLineOptions: ProjectBudgetLineOption[];
}) {
  const [open, setOpen] = useState(false);
  const projectBudgetLines = useMemo(
    () => budgetLineOptions.filter((line) => line.projectId === purchase.projectId),
    [budgetLineOptions, purchase.projectId]
  );

  return (
    <>
      <div className="actionCell">
        <button type="button" className="tinyButton" onClick={() => setOpen(true)}>
          Edit
        </button>
        <form
          action={deleteRequestAction}
          onSubmit={(event) => {
            if (!window.confirm("Delete this request? This cannot be undone.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="purchaseId" value={purchase.id} />
          <button type="submit" className="tinyButton dangerButton">
            Trash
          </button>
        </form>
      </div>

      {open ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit request">
          <div className="modalPanel">
            <h2>Edit Request</h2>
            <p className="heroSubtitle">
              {purchase.projectName} | {purchase.title}
            </p>
            <form action={updateRequestInline} className="requestForm">
              <input type="hidden" name="purchaseId" value={purchase.id} />
              <label>
                Title
                <input name="title" defaultValue={purchase.title} required />
              </label>
              <label>
                Reference
                <input name="referenceNumber" defaultValue={purchase.referenceNumber ?? ""} />
              </label>
              <label>
                Budget Line
                <select name="budgetLineId" defaultValue={purchase.budgetLineId ?? ""} required>
                  {projectBudgetLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select name="requestType" defaultValue={purchase.requestType}>
                  <option value="requisition">Requisition</option>
                  <option value="expense">Expense</option>
                  <option value="contract">Contract</option>
                </select>
              </label>
              <label className="checkboxLabel">
                <input name="isCreditCard" type="checkbox" defaultChecked={purchase.isCreditCard} />
                Credit Card (expense only)
              </label>
              <label>
                Estimated
                <input name="estimatedAmount" type="number" step="0.01" min="0" defaultValue={purchase.estimatedAmount} />
              </label>
              <label>
                Requested
                <input name="requestedAmount" type="number" step="0.01" min="0" defaultValue={purchase.requestedAmount} />
              </label>

              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={() => setOpen(false)}>
                  Close
                </button>
                <button type="submit" className="tinyButton">
                  Save Edit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
