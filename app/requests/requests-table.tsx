"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { bulkDeleteRequestsAction, bulkUpdateRequestsAction } from "@/app/requests/actions";
import { CcReconcileModal } from "@/app/requests/cc-reconcile-modal";
import { RequestRowActions } from "@/app/requests/request-row-actions";
import { formatCurrency } from "@/lib/format";
import type {
  AccountCodeOption,
  ProcurementProjectOption,
  ProductionCategoryOption,
  PurchaseRow,
  RequestReceiptRow
} from "@/lib/db";

type SortKey =
  | "createdAt"
  | "projectName"
  | "productionCategoryName"
  | "bannerAccountCode"
  | "requestNumber"
  | "title"
  | "requestType"
  | "status"
  | "ccWorkflowStatus"
  | "estimatedAmount"
  | "requestedAmount"
  | "encumberedAmount"
  | "pendingCcAmount"
  | "postedAmount"
  | "receiptTotal";

type SortDirection = "asc" | "desc";
const SORT_KEYS: SortKey[] = [
  "createdAt",
  "projectName",
  "productionCategoryName",
  "bannerAccountCode",
  "requestNumber",
  "title",
  "requestType",
  "status",
  "ccWorkflowStatus",
  "estimatedAmount",
  "requestedAmount",
  "encumberedAmount",
  "pendingCcAmount",
  "postedAmount",
  "receiptTotal"
];

function asString(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function requestTypeLabel(value: PurchaseRow["requestType"]): string {
  if (value === "request") return "Budget Hold";
  if (value === "budget_transfer") return "Budget Transfer";
  if (value === "contract_payment") return "Contract Payment";
  if (value === "requisition") return "Requisition";
  if (value === "expense") return "Expense";
  return "Contract";
}

function sortRows(rows: PurchaseRow[], key: SortKey, direction: SortDirection): PurchaseRow[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aRequestNumber = a.requestType === "requisition" ? a.requisitionNumber : a.referenceNumber;
    const bRequestNumber = b.requestType === "requisition" ? b.requisitionNumber : b.referenceNumber;
    const cmp =
      key === "estimatedAmount" ||
      key === "requestedAmount" ||
      key === "encumberedAmount" ||
      key === "pendingCcAmount" ||
      key === "postedAmount" ||
      key === "receiptTotal"
        ? (a[key] as number) - (b[key] as number)
        : key === "createdAt"
          ? asString(a.createdAt).localeCompare(asString(b.createdAt))
        : key === "requestNumber"
          ? asString(aRequestNumber).localeCompare(asString(bRequestNumber))
          : asString(a[key] as string | null).localeCompare(asString(b[key] as string | null));
    return cmp * dir;
  });
}

function SortTh({
  label,
  sortKey,
  activeKey,
  direction,
  onToggle
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <th>
      <button type="button" className="sortHeaderButton" onClick={() => onToggle(sortKey)}>
        {label} {active ? (direction === "asc" ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}

export function RequestsTable({
  purchases,
  receipts,
  projectOptions,
  accountCodeOptions,
  productionCategoryOptions,
  canManageRows
}: {
  purchases: PurchaseRow[];
  receipts: RequestReceiptRow[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
  canManageRows: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortFromUrl = searchParams.get("rq_sort");
  const dirFromUrl = searchParams.get("rq_dir");
  const initialSortKey: SortKey = sortFromUrl && SORT_KEYS.includes(sortFromUrl as SortKey) ? (sortFromUrl as SortKey) : "createdAt";
  const initialDirection: SortDirection = dirFromUrl === "asc" || dirFromUrl === "desc" ? dirFromUrl : "desc";
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);
  const [projectFilter, setProjectFilter] = useState(searchParams.get("rq_f_project") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("rq_f_status") ?? "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("rq_f_type") ?? "");
  const [ccFilter, setCcFilter] = useState(searchParams.get("rq_f_cc") ?? "");
  const [queryFilter, setQueryFilter] = useState(searchParams.get("rq_f_q") ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const filteredPurchases = useMemo(() => {
    const q = queryFilter.trim().toLowerCase();
    return purchases.filter((purchase) => {
      if (projectFilter && purchase.projectId !== projectFilter) return false;
      if (statusFilter && purchase.status !== statusFilter) return false;
      if (typeFilter && purchase.requestType !== typeFilter) return false;
      if (ccFilter === "cc_only" && !purchase.isCreditCard) return false;
      if (ccFilter === "non_cc_only" && purchase.isCreditCard) return false;
      if (!q) return true;
      const requestNumber = purchase.requestType === "requisition" ? purchase.requisitionNumber : purchase.referenceNumber;
      const haystack =
        `${purchase.projectName} ${purchase.productionCategoryName ?? ""} ${purchase.bannerAccountCode ?? ""} ${requestNumber ?? ""} ${purchase.title} ${purchase.status} ${purchase.requestType}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [ccFilter, projectFilter, purchases, queryFilter, statusFilter, typeFilter]);

  const sortedPurchases = useMemo(() => sortRows(filteredPurchases, sortKey, direction), [filteredPurchases, sortKey, direction]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVisibleCount = useMemo(
    () => sortedPurchases.filter((purchase) => selectedSet.has(purchase.id)).length,
    [selectedSet, sortedPurchases]
  );
  const allVisibleSelected = sortedPurchases.length > 0 && selectedVisibleCount === sortedPurchases.length;
  const selectedIdsJson = JSON.stringify(selectedIds);

  function onToggle(key: SortKey): void {
    const nextDirection: SortDirection = key === sortKey ? (direction === "asc" ? "desc" : "asc") : "asc";
    const params = new URLSearchParams(searchParams.toString());
    params.set("rq_sort", key);
    params.set("rq_dir", nextDirection);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    if (key === sortKey) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  function toggleRowSelection(purchaseId: string): void {
    setSelectedIds((prev) => (prev.includes(purchaseId) ? prev.filter((id) => id !== purchaseId) : [...prev, purchaseId]));
  }

  function toggleSelectAllVisible(): void {
    setSelectedIds((prev) => {
      const visibleIds = sortedPurchases.map((purchase) => purchase.id);
      if (visibleIds.length === 0) return prev;
      const prevSet = new Set(prev);
      const allVisible = visibleIds.every((id) => prevSet.has(id));
      if (allVisible) return prev.filter((id) => !visibleIds.includes(id));
      const merged = new Set(prev);
      for (const id of visibleIds) merged.add(id);
      return [...merged];
    });
  }

  return (
    <>
      {canManageRows ? (
        <div className="bulkToolbar">
          <p className="bulkMeta">
            Selected: {selectedIds.length} total ({selectedVisibleCount} visible)
          </p>
          <div className="bulkActions">
            <button type="button" className="tinyButton" disabled={selectedIds.length === 0} onClick={() => setBulkEditOpen(true)}>
              Bulk Edit
            </button>
            <form
              action={bulkDeleteRequestsAction}
              onSubmit={(event) => {
                if (!window.confirm(`Delete ${selectedIds.length} selected request(s)? This cannot be undone.`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="selectedIdsJson" value={selectedIdsJson} />
              <button type="submit" className="tinyButton dangerButton" disabled={selectedIds.length === 0}>
                Bulk Delete
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <div className="inlineFilters" style={{ marginBottom: "0.5rem" }}>
        <label>
          Project
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="">All</option>
            {Array.from(new Map(purchases.map((p) => [p.projectId, p.projectName])).entries()).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All</option>
            <option value="requested">Requested</option>
            <option value="encumbered">Encumbered</option>
            <option value="pending_cc">Pending CC</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All</option>
            <option value="requisition">Requisition</option>
            <option value="expense">Expense</option>
            <option value="contract">Contract</option>
            <option value="request">Budget Hold</option>
            <option value="budget_transfer">Budget Transfer</option>
          </select>
        </label>
        <label>
          CC
          <select value={ccFilter} onChange={(event) => setCcFilter(event.target.value)}>
            <option value="">All</option>
            <option value="cc_only">CC only</option>
            <option value="non_cc_only">Non-CC only</option>
          </select>
        </label>
        <label>
          Search
          <input value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} placeholder="Title, req/ref, dept..." />
        </label>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th className="rowSelectHeader">
                {canManageRows ? (
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all visible rows" />
                ) : null}
              </th>
              <SortTh label="Project" sortKey="projectName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh
                label="Department"
                sortKey="productionCategoryName"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              <SortTh
                label="Banner Code"
                sortKey="bannerAccountCode"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              <SortTh label="Req/Ref #" sortKey="requestNumber" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Title" sortKey="title" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Type" sortKey="requestType" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Status" sortKey="status" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh
                label="CC Workflow"
                sortKey="ccWorkflowStatus"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              <SortTh label="Estimated" sortKey="estimatedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Requested" sortKey="requestedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="ENC" sortKey="encumberedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Pending CC" sortKey="pendingCcAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Posted" sortKey="postedAmount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Receipts" sortKey="receiptTotal" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <th>CC Reconcile</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPurchases.length === 0 ? (
              <tr>
                <td colSpan={17}>No purchases yet. Create your first request above.</td>
              </tr>
            ) : null}
            {sortedPurchases.map((purchase) => (
              <tr key={purchase.id}>
                <td className="rowSelectCell">
                  {canManageRows ? (
                    <input
                      type="checkbox"
                      checked={selectedSet.has(purchase.id)}
                      onChange={() => toggleRowSelection(purchase.id)}
                      aria-label={`Select request ${purchase.title}`}
                    />
                  ) : null}
                </td>
                <td>{purchase.projectName}</td>
                <td>{purchase.productionCategoryName ?? purchase.category ?? "-"}</td>
                <td>{purchase.bannerAccountCode ?? purchase.budgetCode}</td>
                <td>{purchase.requestType === "requisition" ? (purchase.requisitionNumber ?? "-") : (purchase.referenceNumber ?? "-")}</td>
                <td>{purchase.title}</td>
                <td>
                  {requestTypeLabel(purchase.requestType)}
                  {purchase.requestType === "expense" ? (purchase.isCreditCard ? " (cc)" : " (reimb)") : ""}
                </td>
                <td>
                  <span className={`statusChip status-${purchase.status}`}>{purchase.status}</span>
                </td>
                <td>{purchase.isCreditCard ? (purchase.ccWorkflowStatus ?? "requested") : "-"}</td>
                <td>{formatCurrency(purchase.estimatedAmount)}</td>
                <td>{formatCurrency(purchase.requestedAmount)}</td>
                <td>{formatCurrency(purchase.encumberedAmount)}</td>
                <td>{formatCurrency(purchase.pendingCcAmount)}</td>
                <td>{formatCurrency(purchase.postedAmount)}</td>
                <td>
                  {purchase.requestType === "expense" ? (
                    <>
                      <strong>{formatCurrency(purchase.receiptTotal)}</strong>
                      <div>{purchase.receiptCount} receipts</div>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {canManageRows ? <CcReconcileModal purchase={purchase} receipts={receipts} /> : "-"}
                </td>
                <td>
                  {canManageRows ? (
                    <RequestRowActions
                      purchase={purchase}
                      projectOptions={projectOptions}
                      accountCodeOptions={accountCodeOptions}
                      productionCategoryOptions={productionCategoryOptions}
                    />
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManageRows && bulkEditOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Bulk edit requests">
          <div className="modalPanel">
            <h2>Bulk Edit Requests</h2>
            <p className="heroSubtitle">
              Select fields to apply, then set the new value. Only checked fields are updated for all selected rows.
            </p>
            <form action={bulkUpdateRequestsAction} className="requestForm">
              <input type="hidden" name="selectedIdsJson" value={selectedIdsJson} />

              <label className="checkboxLabel">
                <input name="applyProject" type="checkbox" />
                Apply Project
              </label>
              <label>
                Project
                <select name="projectId">
                  <option value="">Select project</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyProductionCategory" type="checkbox" />
                Apply Department
              </label>
              <label>
                Department
                <select name="productionCategoryId">
                  <option value="">Select department</option>
                  {productionCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyBannerAccountCode" type="checkbox" />
                Apply Banner Code
              </label>
              <label>
                Banner Code
                <select name="bannerAccountCodeId">
                  <option value="">Unassigned</option>
                  {accountCodeOptions.map((accountCode) => (
                    <option key={accountCode.id} value={accountCode.id}>
                      {accountCode.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyTitle" type="checkbox" />
                Apply Title
              </label>
              <label>
                Title
                <input name="title" />
              </label>

              <label className="checkboxLabel">
                <input name="applyRequestType" type="checkbox" />
                Apply Type
              </label>
              <label>
                Type
                <select name="requestType" defaultValue="requisition">
                  <option value="requisition">Requisition</option>
                  <option value="expense">Expense</option>
                  <option value="contract">Contract</option>
                  <option value="request">Budget Hold</option>
                  <option value="budget_transfer">Budget Transfer</option>
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyIsCreditCard" type="checkbox" />
                Apply Credit Card Flag
              </label>
              <label>
                Credit Card
                <select name="isCreditCard" defaultValue="false">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyEstimatedAmount" type="checkbox" />
                Apply Estimated
              </label>
              <label>
                Estimated
                <input name="estimatedAmount" type="number" step="0.01" />
              </label>

              <label className="checkboxLabel">
                <input name="applyRequestedAmount" type="checkbox" />
                Apply Requested
              </label>
              <label>
                Requested
                <input name="requestedAmount" type="number" step="0.01" />
              </label>

              <label className="checkboxLabel">
                <input name="applyRequisitionNumber" type="checkbox" />
                Apply Requisition #
              </label>
              <label>
                Requisition #
                <input name="requisitionNumber" />
              </label>

              <label className="checkboxLabel">
                <input name="applyReferenceNumber" type="checkbox" />
                Apply Reference #
              </label>
              <label>
                Reference #
                <input name="referenceNumber" />
              </label>

              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={() => setBulkEditOpen(false)}>
                  Close
                </button>
                <button type="submit" className="tinyButton">
                  Save Bulk Edit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
