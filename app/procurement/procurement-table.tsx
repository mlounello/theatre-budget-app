"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addProcurementReceivingDocAction,
  addProcurementReceiptAction,
  bulkDeleteProcurementAction,
  bulkUpdateProcurementAction,
  deleteProcurementReceivingDocAction,
  deleteProcurementAction,
  deleteProcurementReceiptAction,
  updateProcurementAction,
  type ActionState
} from "@/app/procurement/actions";
import { formatCurrency } from "@/lib/format";
import { SideDrawer } from "@/components/ui/side-drawer";
import { BulkSelectionToolbar } from "@/components/ui/toolbars";
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
  { value: "partial_received", label: "Partially Received" },
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
const NEW_VENDOR_VALUE = "__new_vendor__";
const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function procurementLabel(value: string, isCreditCard: boolean, requestType: ProcurementRow["requestType"]): string {
  if (requestType === "request") return "Budget Hold";
  if (requestType === "budget_transfer") return "Budget Transfer";
  if (requestType === "contract_payment") return value === "paid" ? "Paid" : "Unpaid";
  const list = isCreditCard ? CC_PROCUREMENT_STATUSES : PROCUREMENT_STATUSES;
  const found = list.find((status) => status.value === value);
  return found?.label ?? value;
}

function budgetStatusLabel(value: ProcurementRow["budgetStatus"]): string {
  const labels: Record<string, string> = {
    requested: "Requested",
    held: "Held",
    encumbered: "Encumbered",
    pending_cc: "Pending Card",
    posted: "Posted",
    cancelled: "Cancelled"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

type OptionalColumn = "department" | "account" | "receiving" | "budgetStatus" | "receiptTotal";
const OPTIONAL_COLUMNS: Array<{ key: OptionalColumn; label: string }> = [
  { key: "department", label: "Department" },
  { key: "account", label: "Account" },
  { key: "receiving", label: "Receiving Docs" },
  { key: "budgetStatus", label: "Budget Status" },
  { key: "receiptTotal", label: "Receipt Total" }
];

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
  const editingPurchase = useMemo(() => purchases.find((purchase) => purchase.id === editingId) ?? null, [purchases, editingId]);
  const [editProjectId, setEditProjectId] = useState("");
  const [editOrganizationId, setEditOrganizationId] = useState("");
  const editingProject = useMemo(() => projectOptions.find((project) => project.id === editProjectId) ?? null, [projectOptions, editProjectId]);
  const editIsExternalProject = Boolean(editingProject?.isExternal);
  const editingOrganization = useMemo(
    () => organizationOptions.find((organization) => organization.id === editOrganizationId) ?? null,
    [organizationOptions, editOrganizationId]
  );
  const editAllowsProjectless = Boolean(editingOrganization && !editingOrganization.projectTrackingRequired);
  const [editProductionCategoryId, setEditProductionCategoryId] = useState("");
  const [editBannerAccountCodeId, setEditBannerAccountCodeId] = useState("");
  const [editVendorId, setEditVendorId] = useState("");
  const [editNewVendorName, setEditNewVendorName] = useState("");
  const [editBudgetTracked, setEditBudgetTracked] = useState(false);
  const [editProcurementStatus, setEditProcurementStatus] = useState("requested");
  const [editReferenceNumber, setEditReferenceNumber] = useState("");
  const [editRequisitionNumber, setEditRequisitionNumber] = useState("");
  const [editPoNumber, setEditPoNumber] = useState("");
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editOrderValue, setEditOrderValue] = useState("");
  const [editOrderedOn, setEditOrderedOn] = useState("");
  const [editReceivedOn, setEditReceivedOn] = useState("");
  const [editPaidOn, setEditPaidOn] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const lastEditIdRef = useRef<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingBulkDeleteIds, setPendingBulkDeleteIds] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<OptionalColumn[]>(["department", "account"]);
  const CONTRACT_PAYMENT_PROCUREMENT_STATUSES = [
    { value: "requested", label: "Unpaid" },
    { value: "paid", label: "Paid" }
  ] as const;
  const sortedPurchases = useMemo(
    () => sortRows(purchases, receipts, sortKey, direction),
    [purchases, receipts, sortKey, direction]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVisibleCount = useMemo(
    () => sortedPurchases.filter((purchase) => selectedSet.has(purchase.id)).length,
    [selectedSet, sortedPurchases]
  );
  const allVisibleSelected = sortedPurchases.length > 0 && selectedVisibleCount === sortedPurchases.length;
  const selectedIdsJson = JSON.stringify(selectedIds);

  const [updateState, updateAction] = useActionState(updateProcurementAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteProcurementAction, initialState);
  const [bulkUpdateState, bulkUpdateAction] = useActionState(bulkUpdateProcurementAction, initialState);
  const [bulkDeleteState, bulkDeleteAction] = useActionState(bulkDeleteProcurementAction, initialState);
  const [addReceivingState, addReceivingAction] = useActionState(addProcurementReceivingDocAction, initialState);
  const [deleteReceivingState, deleteReceivingAction] = useActionState(deleteProcurementReceivingDocAction, initialState);
  const [addReceiptState, addReceiptAction] = useActionState(addProcurementReceiptAction, initialState);
  const [deleteReceiptState, deleteReceiptAction] = useActionState(deleteProcurementReceiptAction, initialState);

  const openEdit = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pr_edit", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setEditingId(id);
    },
    [pathname, router, searchParams]
  );

  const closeEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pr_edit");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setEditingId(null);
  }, [pathname, router, searchParams]);

  const openBulkEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pr_bulk", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setBulkEditOpen(true);
  }, [pathname, router, searchParams]);

  const closeBulkEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pr_bulk");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setBulkEditOpen(false);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const editFromUrl = searchParams.get("pr_edit");
    setEditingId(editFromUrl ? editFromUrl : null);
    setBulkEditOpen(searchParams.get("pr_bulk") === "1");
  }, [searchParams]);

  useEffect(() => {
    if (!editingPurchase) {
      lastEditIdRef.current = null;
      return;
    }
    if (lastEditIdRef.current === editingPurchase.id) return;
    lastEditIdRef.current = editingPurchase.id;
    const resolvedOrderValue =
      editingPurchase.estimatedAmount !== 0
        ? editingPurchase.estimatedAmount
        : editingPurchase.requestedAmount !== 0
          ? editingPurchase.requestedAmount
          : editingPurchase.encumberedAmount !== 0
            ? editingPurchase.encumberedAmount
            : editingPurchase.pendingCcAmount !== 0
              ? editingPurchase.pendingCcAmount
              : editingPurchase.postedAmount;
    setEditProjectId(editingPurchase.projectId ?? "");
    setEditOrganizationId(editingPurchase.organizationId ?? "");
    setEditProductionCategoryId(editingPurchase.productionCategoryId ?? "");
    setEditBannerAccountCodeId(editingPurchase.bannerAccountCodeId ?? "");
    setEditVendorId(editingPurchase.vendorId ?? "");
    setEditNewVendorName("");
    setEditBudgetTracked(Boolean(editingPurchase.budgetTracked));
    setEditProcurementStatus(editingPurchase.procurementStatus);
    setEditReferenceNumber(editingPurchase.referenceNumber ?? "");
    setEditRequisitionNumber(editingPurchase.requisitionNumber ?? "");
    setEditPoNumber(editingPurchase.poNumber ?? "");
    setEditInvoiceNumber(editingPurchase.invoiceNumber ?? "");
    setEditOrderValue(String(resolvedOrderValue ?? ""));
    setEditOrderedOn(editingPurchase.orderedOn ?? "");
    setEditReceivedOn(editingPurchase.receivedOn ?? "");
    setEditPaidOn(editingPurchase.paidOn ?? "");
    setEditNotes(editingPurchase.notes ?? "");
  }, [editingPurchase]);

  useEffect(() => {
    if (!deleteState.ok || !deleteState.message) return;
    if (pendingDeleteId && editingId === pendingDeleteId) {
      closeEdit();
    }
  }, [deleteState, pendingDeleteId, editingId, closeEdit]);

  useEffect(() => {
    if (!bulkDeleteState.ok || !bulkDeleteState.message) return;
    setSelectedIds([]);
    if (editingId && pendingBulkDeleteIds.includes(editingId)) {
      closeEdit();
    }
  }, [bulkDeleteState, pendingBulkDeleteIds, editingId, closeEdit]);

  useEffect(() => {
    if (!bulkUpdateState.ok || !bulkUpdateState.message) return;
    setBulkEditOpen(true);
  }, [bulkUpdateState]);

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
      <p className="helperText procurementBoundaryNote">Expense Claims are managed in Credit Cards; this table retains the PO, requisition, receiving, invoice, and payment workflow.</p>
      {deleteState.message ? (
        <p className={deleteState.ok ? "successNote" : "errorNote"} key={deleteState.timestamp}>
          {deleteState.message}
        </p>
      ) : null}
      {bulkDeleteState.message ? (
        <p className={bulkDeleteState.ok ? "successNote" : "errorNote"} key={bulkDeleteState.timestamp}>
          {bulkDeleteState.message}
        </p>
      ) : null}

      <BulkSelectionToolbar selectedCount={selectedIds.length} totalCount={sortedPurchases.length} label="orders" sticky>
          <button type="button" className="tinyButton" disabled={selectedIds.length === 0} onClick={openBulkEdit}>
            Bulk Edit
          </button>
          <form
            action={bulkDeleteAction}
            onSubmit={(event) => {
              if (!window.confirm(`Delete ${selectedIds.length} selected procurement row(s)?`)) {
                event.preventDefault();
                return;
              }
              setPendingBulkDeleteIds([...selectedIds]);
            }}
          >
            <input type="hidden" name="selectedIdsJson" value={selectedIdsJson} />
            <button type="submit" className="tinyButton dangerButton" disabled={selectedIds.length === 0}>
              Bulk Delete
            </button>
          </form>
      </BulkSelectionToolbar>

      <div className="procurementTableTools">
        <p className="helperText">Showing {sortedPurchases.length} orders on this page.</p>
        <details className="columnChooser">
          <summary>Columns</summary>
          <div>
            {OPTIONAL_COLUMNS.map((column) => (
              <label key={column.key} className="checkboxLabel">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column.key)}
                  onChange={(event) => setVisibleColumns((current) =>
                    event.target.checked
                      ? [...current, column.key]
                      : current.filter((key) => key !== column.key)
                  )}
                />
                {column.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th className="rowSelectHeader">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all orders on this page" />
              </th>
              <SortTh label="Order" sortKey="title" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Vendor" sortKey="vendorName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <th>Requisition / PO</th>
              <SortTh label="Order Value" sortKey="orderValue" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh
                label="Procurement"
                sortKey="procurementStatus"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              {visibleColumns.includes("department") ? <SortTh label="Department" sortKey="productionCategoryName" activeKey={sortKey} direction={direction} onToggle={onToggle} /> : null}
              {visibleColumns.includes("account") ? <SortTh label="Account" sortKey="bannerAccountCode" activeKey={sortKey} direction={direction} onToggle={onToggle} /> : null}
              {visibleColumns.includes("receiving") ? <th>Receiving Docs</th> : null}
              {visibleColumns.includes("budgetStatus") ? <SortTh label="Budget Status" sortKey="budgetStatus" activeKey={sortKey} direction={direction} onToggle={onToggle} /> : null}
              {visibleColumns.includes("receiptTotal") ? <SortTh label="Receipt Total" sortKey="receiptTotal" activeKey={sortKey} direction={direction} onToggle={onToggle} /> : null}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPurchases.length === 0 ? (
              <tr>
                <td colSpan={7 + visibleColumns.length}>No orders match this queue and filter.</td>
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
                    <input type="checkbox" checked={selectedSet.has(purchase.id)} onChange={() => toggleRowSelection(purchase.id)} aria-label={`Select ${purchase.title}`} />
                  </td>
                  <td className="procurementOrderCell">
                    <strong>{purchase.title}</strong>
                    <span>{purchase.projectName}{purchase.season ? ` · ${purchase.season}` : ""}</span>
                    <span>{purchase.orgCode ? `${purchase.orgCode} | ${purchase.organizationName ?? ""}` : purchase.organizationName ?? "-"}</span>
                  </td>
                  <td>{purchase.vendorName ?? "-"}</td>
                  <td className="procurementIdentifiers">
                    <span><b>Req</b> {purchase.requisitionNumber ?? "—"}</span>
                    <span><b>PO</b> {purchase.poNumber ?? "—"}</span>
                  </td>
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
                  {visibleColumns.includes("department") ? <td>{purchase.productionCategoryName ?? purchase.category ?? "-"}</td> : null}
                  {visibleColumns.includes("account") ? <td>{purchase.bannerAccountCode ?? purchase.budgetCode ?? "-"}</td> : null}
                  {visibleColumns.includes("receiving") ? (
                    <td>{receivingDocs.filter((doc) => doc.purchaseId === purchase.id).map((doc) => doc.docCode).join(", ") || "-"}</td>
                  ) : null}
                  {visibleColumns.includes("budgetStatus") ? (
                    <td><span className={`statusChip status-${purchase.budgetStatus}`}>{budgetStatusLabel(purchase.budgetStatus)}</span></td>
                  ) : null}
                  {visibleColumns.includes("receiptTotal") ? <td>{formatCurrency(receiptTotal)}</td> : null}
                  <td>
                    {canManageProcurement ? (
                      <div className="actionCell">
                        <button type="button" className="tinyButton" onClick={() => openEdit(purchase.id)}>
                          Edit
                        </button>
                        <form
                          action={deleteAction}
                          onSubmit={(event) => {
                            if (!window.confirm("Delete this procurement row?")) {
                              event.preventDefault();
                              return;
                            }
                            setPendingDeleteId(purchase.id);
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
        <SideDrawer
          open
          onClose={closeEdit}
          eyebrow="Procurement order"
          title={editingPurchase.title}
          description={`${editingPurchase.projectName} · ${procurementLabel(editingPurchase.procurementStatus, editingPurchase.requestType === "expense" && editingPurchase.isCreditCard, editingPurchase.requestType)}`}
          closeLabel="Close procurement order"
        >
            {updateState.message ? (
              <p className={updateState.ok ? "successNote" : "errorNote"} key={updateState.timestamp}>
                {updateState.message}
              </p>
            ) : null}
            <form action={updateAction} className="requestForm">
              <input type="hidden" name="id" value={editingPurchase.id} />
              <label>
                <input
                  name="budgetTracked"
                  type="checkbox"
                  checked={editBudgetTracked}
                  onChange={(event) => setEditBudgetTracked(event.target.checked)}
                />
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
                  required={!editAllowsProjectless}
                >
                  <option value="">{editAllowsProjectless ? "No project — organization budget" : "Select project"}</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Organization
                <select
                  name="organizationId"
                  value={editOrganizationId}
                  onChange={(event) => setEditOrganizationId(event.target.value)}
                  disabled={Boolean(editProjectId) && !editIsExternalProject}
                  required={editIsExternalProject || !editProjectId}
                >
                  <option value="">Select organization</option>
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.label}
                    </option>
                  ))}
                </select>
                {editProjectId && !editIsExternalProject ? (
                  <span className="helperText">For budget-tracked projects, organization comes from the project.</span>
                ) : !editProjectId ? (
                  <span className="helperText">Projectless purchases are allowed only for organizations marked as non-theatre budgets.</span>
                ) : null}
              </label>
              <input type="hidden" name="budgetLineId" value="" />
              <label>
                Department (Production Category)
                <select
                  name="productionCategoryId"
                  value={editProductionCategoryId}
                  onChange={(event) => setEditProductionCategoryId(event.target.value)}
                  required={Boolean(editProjectId) && !editIsExternalProject}
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
                  required={!editProjectId}
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
                <select
                  name="procurementStatus"
                  value={editProcurementStatus}
                  onChange={(event) => setEditProcurementStatus(event.target.value)}
                >
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
                <input
                  name="referenceNumber"
                  value={editReferenceNumber}
                  onChange={(event) => setEditReferenceNumber(event.target.value)}
                />
              </label>
              <label>
                Requisition #
                <input
                  name="requisitionNumber"
                  value={editRequisitionNumber}
                  onChange={(event) => setEditRequisitionNumber(event.target.value)}
                />
              </label>
              <label>
                PO #
                <input name="poNumber" value={editPoNumber} onChange={(event) => setEditPoNumber(event.target.value)} />
              </label>
              <label>
                Invoice #
                <input
                  name="invoiceNumber"
                  value={editInvoiceNumber}
                  onChange={(event) => setEditInvoiceNumber(event.target.value)}
                />
              </label>
              <label>
                Vendor
                <select name="vendorId" value={editVendorId} onChange={(event) => setEditVendorId(event.target.value)}>
                  <option value="">No vendor</option>
                  <option value={NEW_VENDOR_VALUE}>+ Add new vendor...</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              {editVendorId === NEW_VENDOR_VALUE ? (
                <label>
                  New Vendor Name
                  <input
                    name="newVendorName"
                    value={editNewVendorName}
                    onChange={(event) => setEditNewVendorName(event.target.value)}
                    placeholder="Ex: Home Depot"
                    required
                  />
                </label>
              ) : null}
              <label>
                Order Value
                <input
                  name="orderValue"
                  type="number"
                  step="0.01"
                  value={editOrderValue}
                  onChange={(event) => setEditOrderValue(event.target.value)}
                />
              </label>
              <label>
                Ordered On
                <input
                  name="orderedOn"
                  type="date"
                  value={editOrderedOn}
                  onChange={(event) => setEditOrderedOn(event.target.value)}
                />
              </label>
              <label>
                Received On
                <input
                  name="receivedOn"
                  type="date"
                  value={editReceivedOn}
                  onChange={(event) => setEditReceivedOn(event.target.value)}
                />
              </label>
              <label>
                Paid On
                <input
                  name="paidOn"
                  type="date"
                  value={editPaidOn}
                  onChange={(event) => setEditPaidOn(event.target.value)}
                />
              </label>
              <label>
                Notes
                <input name="notes" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} />
              </label>
              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Procurement
                </button>
              </div>
            </form>

            <article className="panel">
              <h2>Receiving Docs</h2>
              {addReceivingState.message ? (
                <p className={addReceivingState.ok ? "successNote" : "errorNote"} key={addReceivingState.timestamp}>
                  {addReceivingState.message}
                </p>
              ) : null}
              {deleteReceivingState.message ? (
                <p className={deleteReceivingState.ok ? "successNote" : "errorNote"} key={deleteReceivingState.timestamp}>
                  {deleteReceivingState.message}
                </p>
              ) : null}
              <form action={addReceivingAction} className="requestForm">
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
                      <form action={deleteReceivingAction} className="inlineEditForm">
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
              {addReceiptState.message ? (
                <p className={addReceiptState.ok ? "successNote" : "errorNote"} key={addReceiptState.timestamp}>
                  {addReceiptState.message}
                </p>
              ) : null}
              {deleteReceiptState.message ? (
                <p className={deleteReceiptState.ok ? "successNote" : "errorNote"} key={deleteReceiptState.timestamp}>
                  {deleteReceiptState.message}
                </p>
              ) : null}
              <form action={addReceiptAction} className="requestForm">
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
                      <form action={deleteReceiptAction} className="inlineEditForm">
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
        </SideDrawer>
      ) : null}

      {bulkEditOpen ? (
        <SideDrawer
          open
          onClose={closeBulkEdit}
          eyebrow="Bulk action"
          title="Bulk Edit Procurement Rows"
          description="Only checked fields are applied to all selected rows."
          closeLabel="Close bulk edit panel"
        >
            {bulkUpdateState.message ? (
              <p className={bulkUpdateState.ok ? "successNote" : "errorNote"} key={bulkUpdateState.timestamp}>
                {bulkUpdateState.message}
              </p>
            ) : null}
            <form action={bulkUpdateAction} className="requestForm">
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
                <button type="button" className="tinyButton" onClick={closeBulkEdit}>
                  Close
                </button>
                <button type="submit" className="tinyButton">
                  Save Bulk Edit
                </button>
              </div>
            </form>
        </SideDrawer>
      ) : null}
    </>
  );
}
