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
  const [editProjectId, setEditProjectId] = useState(purchase.projectId);
  const [editBudgetLineId, setEditBudgetLineId] = useState(purchase.budgetLineId ?? "");
  const projectBudgetLines = useMemo(() => budgetLineOptions.filter((line) => line.projectId === editProjectId), [budgetLineOptions, editProjectId]);
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of budgetLineOptions) {
      if (!map.has(line.projectId)) {
        map.set(line.projectId, `${line.projectName}${line.season ? ` (${line.season})` : ""}`);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [budgetLineOptions]);

  return (
    <>
      <div className="actionCell">
        <button
          type="button"
          className="tinyButton"
          onClick={() => {
            setEditProjectId(purchase.projectId);
            setEditBudgetLineId(purchase.budgetLineId ?? "");
            setOpen(true);
          }}
        >
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
                Project
                <select
                  name="projectId"
                  value={editProjectId}
                  onChange={(event) => {
                    setEditProjectId(event.target.value);
                    setEditBudgetLineId("");
                  }}
                  required
                >
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input name="title" defaultValue={purchase.title} required />
              </label>
              <label>
                {purchase.requestType === "requisition" ? "Requisition #" : "Reference #"}
                {purchase.requestType === "requisition" ? (
                  <input name="requisitionNumber" defaultValue={purchase.requisitionNumber ?? ""} />
                ) : (
                  <input name="referenceNumber" defaultValue={purchase.referenceNumber ?? ""} />
                )}
              </label>
              <label>
                Budget Line
                <select name="budgetLineId" value={editBudgetLineId} onChange={(event) => setEditBudgetLineId(event.target.value)} required>
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
                <input name="estimatedAmount" type="number" step="0.01" defaultValue={purchase.estimatedAmount} />
              </label>
              <label>
                Requested
                <input name="requestedAmount" type="number" step="0.01" defaultValue={purchase.requestedAmount} />
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
