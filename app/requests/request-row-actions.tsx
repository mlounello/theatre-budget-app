"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteRequestAction, updateRequestInline, type ActionState } from "@/app/requests/actions";
import type { AccountCodeOption, ProcurementProjectOption, ProductionCategoryOption, PurchaseRow } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function RequestRowActions({
  purchase,
  projectOptions,
  accountCodeOptions,
  productionCategoryOptions
}: {
  purchase: PurchaseRow;
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [updateState, updateAction] = useActionState(updateRequestInline, initialState);
  const [deleteState, deleteAction] = useActionState(deleteRequestAction, initialState);

  const open = useMemo(() => searchParams.get("rq_edit") === purchase.id, [searchParams, purchase.id]);
  const [editRequestType, setEditRequestType] = useState(purchase.requestType);
  const [editProjectId, setEditProjectId] = useState(purchase.projectId);
  const [editProductionCategoryId, setEditProductionCategoryId] = useState(purchase.productionCategoryId ?? "");
  const [editBannerAccountCodeId, setEditBannerAccountCodeId] = useState(purchase.bannerAccountCodeId ?? "");

  const openEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("rq_edit", purchase.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, purchase.id, router, searchParams]);

  const closeEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("rq_edit");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!open) return;
    setEditProjectId(purchase.projectId);
    setEditRequestType(purchase.requestType);
    setEditProductionCategoryId(purchase.productionCategoryId ?? "");
    setEditBannerAccountCodeId(purchase.bannerAccountCodeId ?? "");
  }, [open, purchase]);

  useEffect(() => {
    if (!deleteState.ok || !deleteState.message) return;
    if (open) {
      closeEdit();
    }
  }, [deleteState, open, closeEdit]);

  return (
    <>
      <div className="actionCell">
        <button
          type="button"
          className="tinyButton"
          onClick={() => {
            setEditProjectId(purchase.projectId);
            setEditRequestType(purchase.requestType);
            setEditProductionCategoryId(purchase.productionCategoryId ?? "");
            setEditBannerAccountCodeId(purchase.bannerAccountCodeId ?? "");
            openEdit();
          }}
        >
          Edit
        </button>
        <form
          action={deleteAction}
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
            {updateState.message ? (
              <p className={updateState.ok ? "successNote" : "errorNote"} key={updateState.timestamp}>
                {updateState.message}
              </p>
            ) : null}
            {deleteState.message ? (
              <p className={deleteState.ok ? "successNote" : "errorNote"} key={deleteState.timestamp}>
                {deleteState.message}
              </p>
            ) : null}
            <form action={updateAction} className="requestForm">
              <input type="hidden" name="purchaseId" value={purchase.id} />
              <label>
                Project
                <select
                  name="projectId"
                  value={editProjectId}
                  onChange={(event) => {
                    setEditProjectId(event.target.value);
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
              {editRequestType === "requisition" ? (
                <label>
                  Requisition #
                  <input name="requisitionNumber" defaultValue={purchase.requisitionNumber ?? ""} />
                </label>
              ) : null}
              {editRequestType !== "requisition" && editRequestType !== "budget_transfer" ? (
                <label>
                  Reference #
                  <input name="referenceNumber" defaultValue={purchase.referenceNumber ?? ""} />
                </label>
              ) : null}
              <input type="hidden" name="budgetLineId" value="" />
              <label>
                Type
                <select
                  name="requestType"
                  value={editRequestType}
                  onChange={(event) => {
                    const value = event.target.value as typeof editRequestType;
                    setEditRequestType(value);
                  }}
                >
                  <option value="requisition">Requisition</option>
                  <option value="expense">Expense</option>
                  <option value="contract">Contract</option>
                  <option value="request">Request (Budget Hold)</option>
                  <option value="budget_transfer">Budget Transfer</option>
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
                <button type="button" className="tinyButton" onClick={closeEdit}>
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
