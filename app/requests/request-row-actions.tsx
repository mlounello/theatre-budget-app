"use client";

import { useMemo, useState } from "react";
import { deleteRequestAction, updateRequestInline } from "@/app/requests/actions";
import type { AccountCodeOption, ProcurementProjectOption, ProductionCategoryOption, ProjectBudgetLineOption, PurchaseRow } from "@/lib/db";

export function RequestRowActions({
  purchase,
  budgetLineOptions,
  projectOptions,
  accountCodeOptions,
  productionCategoryOptions
}: {
  purchase: PurchaseRow;
  budgetLineOptions: ProjectBudgetLineOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState(purchase.projectId);
  const [editBudgetLineId, setEditBudgetLineId] = useState(purchase.budgetLineId ?? "");
  const [editProductionCategoryId, setEditProductionCategoryId] = useState(purchase.productionCategoryId ?? "");
  const [editBannerAccountCodeId, setEditBannerAccountCodeId] = useState(purchase.bannerAccountCodeId ?? "");
  const projectBudgetLines = useMemo(() => budgetLineOptions.filter((line) => line.projectId === editProjectId), [budgetLineOptions, editProjectId]);

  return (
    <>
      <div className="actionCell">
        <button
          type="button"
          className="tinyButton"
          onClick={() => {
            setEditProjectId(purchase.projectId);
            setEditBudgetLineId(purchase.budgetLineId ?? "");
            setEditProductionCategoryId(purchase.productionCategoryId ?? "");
            setEditBannerAccountCodeId(purchase.bannerAccountCodeId ?? "");
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
                Production Category
                <select
                  name="productionCategoryId"
                  value={editProductionCategoryId}
                  onChange={(event) => setEditProductionCategoryId(event.target.value)}
                  required
                >
                  <option value="">Select category</option>
                  {productionCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Banner Account Code
                <select
                  name="bannerAccountCodeId"
                  value={editBannerAccountCodeId}
                  onChange={(event) => setEditBannerAccountCodeId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {accountCodeOptions.map((accountCode) => (
                    <option key={accountCode.id} value={accountCode.id}>
                      {accountCode.label}
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
                <select name="budgetLineId" value={editBudgetLineId} onChange={(event) => setEditBudgetLineId(event.target.value)}>
                  <option value="">Auto from category</option>
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
