"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addProcurementReceivingDocAction,
  addProcurementReceiptAction,
  bulkDeleteProcurementAction,
  bulkUpdateProcurementAction,
  deleteProcurementReceivingDocAction,
  deleteProcurementAction,
  deleteProcurementReceiptAction,
  updateProcurementAction
} from "@/app/procurement/actions";
import { formatCurrency } from "@/lib/format";
import type {
  AccountCodeOption,
  OrganizationOption,
  ProcurementProjectOption,
  ProcurementReceivingDocRow,
  ProcurementReceiptRow,
  ProcurementRow,
  ProductionCategoryOption,
  VendorOption
} from "@/lib/db";

const PROCUREMENT_STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "ordered", label: "Ordered" },
  { value: "partial_received", label: "Partial Received" },
  { value: "fully_received", label: "Fully Received" },
  { value: "invoice_sent", label: "Invoice Sent" },
  { value: "invoice_received", label: "Invoice Received" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" }
] as const;

const CC_PROCUREMENT_STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "receipts_uploaded", label: "Receipts Uploaded" },
  { value: "statement_paid", label: "Statement Paid" },
  { value: "posted_to_account", label: "Posted To Account" },
  { value: "cancelled", label: "Cancelled" }
] as const;

function procurementLabel(value: string, isCreditCard: boolean, requestType: ProcurementRow["requestType"]): string {
  if (requestType === "request") return "Budget Hold";
  if (requestType === "budget_transfer") return "Budget Transfer";
  if (requestType === "contract_payment") return value === "paid" ? "Paid" : "Unpaid";
  const list = isCreditCard ? CC_PROCUREMENT_STATUSES : PROCUREMENT_STATUSES;
  const found = list.find((status) => status.value === value);
  return found?.label ?? value;
}

type SortKey =
  | "createdAt"
  | "projectName"
  | "organizationName"
  | "productionCategoryName"
  | "bannerAccountCode"
  | "title"
  | "requisitionNumber"
  | "poNumber"
  | "vendorName"
  | "orderValue"
  | "procurementStatus"
  | "budgetStatus"
  | "receiptTotal";

type SortDirection = "asc" | "desc";
const SORT_KEYS: SortKey[] = [
  "createdAt",
  "projectName",
  "organizationName",
  "productionCategoryName",
  "bannerAccountCode",
  "title",
  "requisitionNumber",
  "poNumber",
  "vendorName",
  "orderValue",
  "procurementStatus",
  "budgetStatus",
  "receiptTotal"
];

function asString(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function extractSortablePoNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\d+/g);
  if (!match || match.length === 0) return null;
  const numeric = Number(match.join(""));
  return Number.isFinite(numeric) ? numeric : null;
}

function sortRows(rows: ProcurementRow[], receipts: ProcurementReceiptRow[], key: SortKey, direction: SortDirection): ProcurementRow[] {
  const receiptMap = new Map<string, number>();
  for (const purchase of rows) {
    const total = receipts.filter((receipt) => receipt.purchaseId === purchase.id).reduce((sum, receipt) => sum + receipt.amountReceived, 0);
    receiptMap.set(purchase.id, total);
  }

  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aOrderValue =
      a.estimatedAmount !== 0
        ? a.estimatedAmount
        : a.requestedAmount !== 0
          ? a.requestedAmount
          : a.encumberedAmount !== 0
            ? a.encumberedAmount
            : a.pendingCcAmount !== 0
              ? a.pendingCcAmount
              : a.postedAmount;
    const bOrderValue =
      b.estimatedAmount !== 0
        ? b.estimatedAmount
        : b.requestedAmount !== 0
          ? b.requestedAmount
          : b.encumberedAmount !== 0
            ? b.encumberedAmount
            : b.pendingCcAmount !== 0
              ? b.pendingCcAmount
              : b.postedAmount;
    const aVal =
      key === "orderValue"
        ? aOrderValue
        : key === "receiptTotal"
          ? (receiptMap.get(a.id) ?? 0)
            : key === "projectName"
              ? asString(a.projectName)
              : key === "createdAt"
                ? asString(a.createdAt)
              : key === "organizationName"
                ? asString(a.organizationName)
            : key === "productionCategoryName"
              ? asString(a.productionCategoryName)
              : key === "bannerAccountCode"
                ? asString(a.bannerAccountCode)
              : key === "title"
                ? asString(a.title)
                : key === "requisitionNumber"
                  ? asString(a.requisitionNumber)
                  : key === "poNumber"
                    ? asString(a.poNumber)
                    : key === "vendorName"
                      ? asString(a.vendorName)
                      : key === "procurementStatus"
                        ? asString(a.procurementStatus)
                        : asString(a.budgetStatus);
    const bVal =
      key === "orderValue"
        ? bOrderValue
        : key === "receiptTotal"
          ? (receiptMap.get(b.id) ?? 0)
            : key === "projectName"
              ? asString(b.projectName)
              : key === "createdAt"
                ? asString(b.createdAt)
              : key === "organizationName"
                ? asString(b.organizationName)
              : key === "productionCategoryName"
                ? asString(b.productionCategoryName)
              : key === "bannerAccountCode"
                ? asString(b.bannerAccountCode)
              : key === "title"
                ? asString(b.title)
                : key === "requisitionNumber"
                  ? asString(b.requisitionNumber)
                  : key === "poNumber"
                    ? asString(b.poNumber)
                    : key === "vendorName"
                      ? asString(b.vendorName)
                      : key === "procurementStatus"
                        ? asString(b.procurementStatus)
                        : asString(b.budgetStatus);

    if (key === "poNumber") {
      const aPo = extractSortablePoNumber(a.poNumber);
      const bPo = extractSortablePoNumber(b.poNumber);
      if (aPo !== null && bPo !== null) return (aPo - bPo) * dir;
      if (aPo !== null) return -1 * dir;
      if (bPo !== null) return 1 * dir;
    }

    if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
    return String(aVal).localeCompare(String(bVal)) * dir;
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

export function ProcurementTable({
  purchases,
  receipts,
  receivingDocs,
  vendors,
  projectOptions,
  organizationOptions,
  accountCodeOptions,
  productionCategoryOptions,
  canManageProcurement
}: {
  purchases: ProcurementRow[];
  receipts: ProcurementReceiptRow[];
  receivingDocs: ProcurementReceivingDocRow[];
  vendors: VendorOption[];
  projectOptions: ProcurementProjectOption[];
  organizationOptions: OrganizationOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
  canManageProcurement: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const sortFromUrl = searchParams.get("pr_sort");
  const dirFromUrl = searchParams.get("pr_dir");
  const [sortKey, setSortKey] = useState<SortKey>(
    sortFromUrl && SORT_KEYS.includes(sortFromUrl as SortKey) ? (sortFromUrl as SortKey) : "createdAt"
  );
  const [direction, setDirection] = useState<SortDirection>(
    dirFromUrl === "asc" || dirFromUrl === "desc" ? dirFromUrl : "desc"
  );
  const [projectFilter, setProjectFilter] = useState(searchParams.get("pr_f_project") ?? "");
  const [procurementStatusFilter, setProcurementStatusFilter] = useState(searchParams.get("pr_f_proc_status") ?? "");
  const [budgetStatusFilter, setBudgetStatusFilter] = useState(searchParams.get("pr_f_budget_status") ?? "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("pr_f_type") ?? "");
  const [queryFilter, setQueryFilter] = useState(searchParams.get("pr_f_q") ?? "");
  const editingPurchase = useMemo(() => purchases.find((purchase) => purchase.id === editingId) ?? null, [purchases, editingId]);
  const [editProjectId, setEditProjectId] = useState("");
  const editingProject = useMemo(() => projectOptions.find((project) => project.id === editProjectId) ?? null, [projectOptions, editProjectId]);
  const editIsExternalProject = Boolean(editingProject?.isExternal);
  const [editOrganizationId, setEditOrganizationId] = useState("");
  const [editProductionCategoryId, setEditProductionCategoryId] = useState("");
  const [editBannerAccountCodeId, setEditBannerAccountCodeId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const CONTRACT_PAYMENT_PROCUREMENT_STATUSES = [
    { value: "requested", label: "Unpaid" },
    { value: "paid", label: "Paid" }
  ] as const;
  const filteredPurchases = useMemo(() => {
    const q = queryFilter.trim().toLowerCase();
    return purchases.filter((purchase) => {
      if (projectFilter && purchase.projectId !== projectFilter) return false;
      if (procurementStatusFilter && purchase.procurementStatus !== procurementStatusFilter) return false;
      if (budgetStatusFilter && purchase.budgetStatus !== budgetStatusFilter) return false;
      if (typeFilter && purchase.requestType !== typeFilter) return false;
      if (!q) return true;
      const haystack =
        `${purchase.projectName} ${purchase.organizationName ?? ""} ${purchase.orgCode ?? ""} ${purchase.productionCategoryName ?? ""} ${purchase.bannerAccountCode ?? ""} ${purchase.title} ${purchase.requisitionNumber ?? ""} ${purchase.poNumber ?? ""} ${purchase.vendorName ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [budgetStatusFilter, procurementStatusFilter, projectFilter, purchases, queryFilter, typeFilter]);

  const sortedPurchases = useMemo(
    () => sortRows(filteredPurchases, receipts, sortKey, direction),
    [filteredPurchases, receipts, sortKey, direction]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVisibleCount = useMemo(
    () => sortedPurchases.filter((purchase) => selectedSet.has(purchase.id)).length,
    [selectedSet, sortedPurchases]
  );
  const allVisibleSelected = sortedPurchases.length > 0 && selectedVisibleCount === sortedPurchases.length;
  const selectedIdsJson = JSON.stringify(selectedIds);
  useEffect(() => {
    if (!editingPurchase) return;
    setEditProjectId(editingPurchase.projectId);
    setEditOrganizationId(editingPurchase.organizationId ?? "");
    setEditProductionCategoryId(editingPurchase.productionCategoryId ?? "");
    setEditBannerAccountCodeId(editingPurchase.bannerAccountCodeId ?? "");
  }, [editingPurchase]);

  function onToggle(key: SortKey): void {
    const nextDirection: SortDirection = sortKey === key ? (direction === "asc" ? "desc" : "asc") : "asc";
    const params = new URLSearchParams(searchParams.toString());
    params.set("pr_sort", key);
    params.set("pr_dir", nextDirection);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    if (sortKey === key) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  function toggleRowSelection(id: string): void {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }

  function toggleSelectAllVisible(): void {
    setSelectedIds((prev) => {
      const visibleIds = sortedPurchases.map((purchase) => purchase.id);
      if (visibleIds.length === 0) return prev;
      const prevSet = new Set(prev);
      const allVisible = visibleIds.every((id) => prevSet.has(id));
      if (allVisible) return prev.filter((id) => !visibleIds.includes(id));
      return [...new Set([...prev, ...visibleIds])];
    });
  }

  return (
    <>
      <div className="bulkToolbar">
        <p className="bulkMeta">
          Selected: {selectedIds.length} total ({selectedVisibleCount} visible)
        </p>
        <div className="bulkActions">
          <button type="button" className="tinyButton" disabled={selectedIds.length === 0} onClick={() => setBulkEditOpen(true)}>
            Bulk Edit
          </button>
          <form
            action={bulkDeleteProcurementAction}
            onSubmit={(event) => {
              if (!window.confirm(`Delete ${selectedIds.length} selected procurement row(s)?`)) {
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
          Procurement
          <select value={procurementStatusFilter} onChange={(event) => setProcurementStatusFilter(event.target.value)}>
            <option value="">All</option>
            {Array.from(new Set(purchases.map((purchase) => purchase.procurementStatus))).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Budget Status
          <select value={budgetStatusFilter} onChange={(event) => setBudgetStatusFilter(event.target.value)}>
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
            <option value="contract_payment">Contract Payment</option>
          </select>
        </label>
        <label>
          Search
          <input value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} placeholder="Req, PO, vendor, title..." />
        </label>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th className="rowSelectHeader">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              </th>
              <SortTh label="Project" sortKey="projectName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Org" sortKey="organizationName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
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
              <SortTh label="Title" sortKey="title" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Req #" sortKey="requisitionNumber" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="PO #" sortKey="poNumber" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <th>Receiving Doc #</th>
              <SortTh label="Vendor" sortKey="vendorName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Order Value" sortKey="orderValue" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh
                label="Procurement"
                sortKey="procurementStatus"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              <SortTh label="Budget Status" sortKey="budgetStatus" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Receipt Total" sortKey="receiptTotal" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPurchases.length === 0 ? (
              <tr>
                <td colSpan={14}>No procurement records yet.</td>
              </tr>
            ) : null}
            {sortedPurchases.map((purchase) => {
              const relatedReceipts = receipts.filter((receipt) => receipt.purchaseId === purchase.id);
              const receiptTotal = relatedReceipts.reduce((sum, receipt) => sum + receipt.amountReceived, 0);
              const orderValueDisplay =
                purchase.estimatedAmount !== 0
                  ? purchase.estimatedAmount
                  : purchase.requestedAmount !== 0
                    ? purchase.requestedAmount
                    : purchase.encumberedAmount !== 0
                      ? purchase.encumberedAmount
                      : purchase.pendingCcAmount !== 0
                        ? purchase.pendingCcAmount
                        : purchase.postedAmount;
              return (
                <tr key={purchase.id}>
                  <td className="rowSelectCell">
                    <input type="checkbox" checked={selectedSet.has(purchase.id)} onChange={() => toggleRowSelection(purchase.id)} />
                  </td>
                  <td>
                    {purchase.projectName}
                    {purchase.season ? <div>{purchase.season}</div> : null}
                  </td>
                  <td>{purchase.orgCode ? `${purchase.orgCode} | ${purchase.organizationName ?? ""}` : purchase.organizationName ?? "-"}</td>
                  <td>{purchase.productionCategoryName ?? purchase.category ?? "-"}</td>
                  <td>{purchase.bannerAccountCode ?? purchase.budgetCode ?? "-"}</td>
                  <td>{purchase.title}</td>
                  <td>{purchase.requisitionNumber ?? "-"}</td>
                  <td>{purchase.poNumber ?? "-"}</td>
                  <td>
                    {receivingDocs
                      .filter((doc) => doc.purchaseId === purchase.id)
                      .map((doc) => doc.docCode)
                      .join(", ") || "-"}
                  </td>
                  <td>{purchase.vendorName ?? "-"}</td>
                  <td>{formatCurrency(orderValueDisplay)}</td>
                  <td>
                    <span className={`statusChip status-${purchase.procurementStatus}`}>
                      {procurementLabel(
                        purchase.procurementStatus,
                        purchase.requestType === "expense" && purchase.isCreditCard,
                        purchase.requestType
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={`statusChip status-${purchase.budgetStatus}`}>{purchase.budgetStatus}</span>
                  </td>
                  <td>{formatCurrency(receiptTotal)}</td>
                  <td>
                    {canManageProcurement ? (
                      <div className="actionCell">
                        <button type="button" className="tinyButton" onClick={() => setEditingId(purchase.id)}>
                          Edit
                        </button>
                        <form
                          action={deleteProcurementAction}
                          onSubmit={(event) => {
                            if (!window.confirm("Delete this procurement row?")) event.preventDefault();
                          }}
                        >
                          <input type="hidden" name="id" value={purchase.id} />
                          <button type="submit" className="tinyButton dangerButton">
                            Trash
                          </button>
                        </form>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingPurchase ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit procurement record">
          <div className="modalPanel">
            <h2>Edit Procurement Record</h2>
            <form action={updateProcurementAction} className="requestForm">
              <input type="hidden" name="id" value={editingPurchase.id} />
              <label>
                <input name="budgetTracked" type="checkbox" defaultChecked={editingPurchase.budgetTracked} />
                Track in budget
              </label>
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
                Organization (External Procurement only)
                <select
                  name="organizationId"
                  value={editOrganizationId}
                  onChange={(event) => setEditOrganizationId(event.target.value)}
                  disabled={!editIsExternalProject}
                  required={editIsExternalProject}
                >
                  <option value="">Select organization</option>
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.label}
                    </option>
                  ))}
                </select>
                {!editIsExternalProject ? (
                  <span className="helperText">For budget-tracked projects, organization comes from the project.</span>
                ) : null}
              </label>
              <input type="hidden" name="budgetLineId" value="" />
              <label>
                Department (Production Category)
                <select
                  name="productionCategoryId"
                  value={editProductionCategoryId}
                  onChange={(event) => setEditProductionCategoryId(event.target.value)}
                  required={!editIsExternalProject}
                >
                  <option value="">Select department</option>
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
                Procurement Status
                <select name="procurementStatus" defaultValue={editingPurchase.procurementStatus}>
                  {(editingPurchase.requestType === "contract_payment"
                    ? CONTRACT_PAYMENT_PROCUREMENT_STATUSES
                    : editingPurchase.requestType === "expense" && editingPurchase.isCreditCard
                      ? CC_PROCUREMENT_STATUSES
                      : PROCUREMENT_STATUSES
                  ).map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reference #
                <input name="referenceNumber" defaultValue={editingPurchase.referenceNumber ?? ""} />
              </label>
              <label>
                Requisition #
                <input name="requisitionNumber" defaultValue={editingPurchase.requisitionNumber ?? ""} />
              </label>
              <label>
                PO #
                <input name="poNumber" defaultValue={editingPurchase.poNumber ?? ""} />
              </label>
              <label>
                Invoice #
                <input name="invoiceNumber" defaultValue={editingPurchase.invoiceNumber ?? ""} />
              </label>
              <label>
                Vendor
                <select name="vendorId" defaultValue={editingPurchase.vendorId ?? ""}>
                  <option value="">No vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Order Value
                <input
                  name="orderValue"
                  type="number"
                  step="0.01"
                  defaultValue={
                    editingPurchase.estimatedAmount !== 0
                      ? editingPurchase.estimatedAmount
                      : editingPurchase.requestedAmount !== 0
                        ? editingPurchase.requestedAmount
                        : editingPurchase.encumberedAmount !== 0
                          ? editingPurchase.encumberedAmount
                          : editingPurchase.pendingCcAmount !== 0
                            ? editingPurchase.pendingCcAmount
                            : editingPurchase.postedAmount
                  }
                />
              </label>
              <label>
                Ordered On
                <input name="orderedOn" type="date" defaultValue={editingPurchase.orderedOn ?? ""} />
              </label>
              <label>
                Received On
                <input name="receivedOn" type="date" defaultValue={editingPurchase.receivedOn ?? ""} />
              </label>
              <label>
                Paid On
                <input name="paidOn" type="date" defaultValue={editingPurchase.paidOn ?? ""} />
              </label>
              <label>
                Notes
                <input name="notes" defaultValue={editingPurchase.notes ?? ""} />
              </label>
              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Procurement
                </button>
              </div>
            </form>

            <article className="panel">
              <h2>Receiving Docs</h2>
              <form action={addProcurementReceivingDocAction} className="requestForm">
                <input type="hidden" name="purchaseId" value={editingPurchase.id} />
                <label>
                  Receiving Doc #
                  <input name="docCode" placeholder="e.g. RCV123456" required />
                </label>
                <label>
                  Received On
                  <input name="receivedOn" type="date" />
                </label>
                <label>
                  Note
                  <input name="note" placeholder="Optional note" />
                </label>
                <button type="submit" className="tinyButton">
                  Add Receiving Doc
                </button>
              </form>

              <ul>
                {receivingDocs
                  .filter((doc) => doc.purchaseId === editingPurchase.id)
                  .map((doc) => (
                    <li key={doc.id}>
                      {doc.docCode}
                      {doc.receivedOn ? ` | ${doc.receivedOn}` : ""}
                      {doc.note ? ` | ${doc.note}` : ""}
                      <form action={deleteProcurementReceivingDocAction} className="inlineEditForm">
                        <input type="hidden" name="id" value={doc.id} />
                        <button type="submit" className="tinyButton dangerButton">
                          Trash
                        </button>
                      </form>
                    </li>
                  ))}
                {receivingDocs.filter((doc) => doc.purchaseId === editingPurchase.id).length === 0 ? <li>(none)</li> : null}
              </ul>
            </article>

            <article className="panel">
              <h2>Receipts</h2>
              <form action={addProcurementReceiptAction} className="requestForm">
                <input type="hidden" name="purchaseId" value={editingPurchase.id} />
                <label>
                  Note
                  <input name="note" placeholder="Package received / partial qty, etc." />
                </label>
                <label>
                  Amount Received
                  <input name="amountReceived" type="number" step="0.01" />
                </label>
                <label>
                  Attachment URL
                  <input name="attachmentUrl" placeholder="Optional URL" />
                </label>
                <label className="checkboxLabel">
                  <input name="fullyReceived" type="checkbox" />
                  Fully received
                </label>
                <button type="submit" className="tinyButton">
                  Add Receipt Log
                </button>
              </form>

              <ul>
                {receipts
                  .filter((receipt) => receipt.purchaseId === editingPurchase.id)
                  .map((receipt) => (
                    <li key={receipt.id}>
                      {receipt.note ?? "Receipt"} | {formatCurrency(receipt.amountReceived)} | {receipt.createdAt.slice(0, 10)}
                      {receipt.fullyReceived ? " | Full" : ""}
                      <form action={deleteProcurementReceiptAction} className="inlineEditForm">
                        <input type="hidden" name="id" value={receipt.id} />
                        <button type="submit" className="tinyButton dangerButton">
                          Trash
                        </button>
                      </form>
                    </li>
                  ))}
                {receipts.filter((receipt) => receipt.purchaseId === editingPurchase.id).length === 0 ? <li>(none)</li> : null}
              </ul>
            </article>
          </div>
        </div>
      ) : null}

      {bulkEditOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Bulk edit procurement rows">
          <div className="modalPanel">
            <h2>Bulk Edit Procurement Rows</h2>
            <p className="heroSubtitle">Only checked fields are applied to all selected rows.</p>
            <form action={bulkUpdateProcurementAction} className="requestForm">
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
                <input name="applyOrganization" type="checkbox" />
                Apply Organization
              </label>
              <label>
                Organization
                <select name="organizationId">
                  <option value="">Select organization</option>
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.label}
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
                <input name="applyProcurementStatus" type="checkbox" />
                Apply Procurement Status
              </label>
              <label>
                Procurement Status
                <select name="procurementStatus" defaultValue="requested">
                  {PROCUREMENT_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                  {CC_PROCUREMENT_STATUSES.map((status) => (
                    <option key={`cc-${status.value}`} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyVendor" type="checkbox" />
                Apply Vendor
              </label>
              <label>
                Vendor
                <select name="vendorId">
                  <option value="">No vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyOrderValue" type="checkbox" />
                Apply Order Value
              </label>
              <label>
                Order Value
                <input name="orderValue" type="number" step="0.01" />
              </label>

              <label className="checkboxLabel">
                <input name="applyReferenceNumber" type="checkbox" />
                Apply Reference #
              </label>
              <label>
                Reference #
                <input name="referenceNumber" />
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
                <input name="applyPoNumber" type="checkbox" />
                Apply PO #
              </label>
              <label>
                PO #
                <input name="poNumber" />
              </label>

              <label className="checkboxLabel">
                <input name="applyInvoiceNumber" type="checkbox" />
                Apply Invoice #
              </label>
              <label>
                Invoice #
                <input name="invoiceNumber" />
              </label>

              <label className="checkboxLabel">
                <input name="applyNotes" type="checkbox" />
                Apply Notes
              </label>
              <label>
                Notes
                <input name="notes" />
              </label>

              <label className="checkboxLabel">
                <input name="applyOrderedOn" type="checkbox" />
                Apply Ordered On
              </label>
              <label>
                Ordered On
                <input name="orderedOn" type="date" />
              </label>

              <label className="checkboxLabel">
                <input name="applyReceivedOn" type="checkbox" />
                Apply Received On
              </label>
              <label>
                Received On
                <input name="receivedOn" type="date" />
              </label>

              <label className="checkboxLabel">
                <input name="applyPaidOn" type="checkbox" />
                Apply Paid On
              </label>
              <label>
                Paid On
                <input name="paidOn" type="date" />
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
