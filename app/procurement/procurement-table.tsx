"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addProcurementReceiptAction,
  deleteProcurementReceiptAction,
  updateProcurementAction
} from "@/app/procurement/actions";
import { formatCurrency } from "@/lib/format";
import type { ProcurementReceiptRow, ProcurementRow, VendorOption } from "@/lib/db";

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

function procurementLabel(value: string, isCreditCard: boolean): string {
  const list = isCreditCard ? CC_PROCUREMENT_STATUSES : PROCUREMENT_STATUSES;
  const found = list.find((status) => status.value === value);
  return found?.label ?? value;
}

type SortKey =
  | "projectName"
  | "budgetCode"
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
  "projectName",
  "budgetCode",
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

function sortRows(rows: ProcurementRow[], receipts: ProcurementReceiptRow[], key: SortKey, direction: SortDirection): ProcurementRow[] {
  const receiptMap = new Map<string, number>();
  for (const purchase of rows) {
    const total = receipts.filter((receipt) => receipt.purchaseId === purchase.id).reduce((sum, receipt) => sum + receipt.amountReceived, 0);
    receiptMap.set(purchase.id, total);
  }

  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aOrderValue =
      a.estimatedAmount > 0 ? a.estimatedAmount : a.requestedAmount > 0 ? a.requestedAmount : a.encumberedAmount > 0 ? a.encumberedAmount : a.pendingCcAmount > 0 ? a.pendingCcAmount : a.postedAmount;
    const bOrderValue =
      b.estimatedAmount > 0 ? b.estimatedAmount : b.requestedAmount > 0 ? b.requestedAmount : b.encumberedAmount > 0 ? b.encumberedAmount : b.pendingCcAmount > 0 ? b.pendingCcAmount : b.postedAmount;
    const aVal =
      key === "orderValue"
        ? aOrderValue
        : key === "receiptTotal"
          ? (receiptMap.get(a.id) ?? 0)
          : key === "projectName"
            ? asString(a.projectName)
            : key === "budgetCode"
              ? asString(a.budgetCode)
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
            : key === "budgetCode"
              ? asString(b.budgetCode)
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
  vendors,
  budgetLineOptions,
  canManageProcurement
}: {
  purchases: ProcurementRow[];
  receipts: ProcurementReceiptRow[];
  vendors: VendorOption[];
  budgetLineOptions: Array<{ id: string; projectId: string; label: string }>;
  canManageProcurement: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const sortFromUrl = searchParams.get("pr_sort");
  const dirFromUrl = searchParams.get("pr_dir");
  const [sortKey, setSortKey] = useState<SortKey>(
    sortFromUrl && SORT_KEYS.includes(sortFromUrl as SortKey) ? (sortFromUrl as SortKey) : "projectName"
  );
  const [direction, setDirection] = useState<SortDirection>(dirFromUrl === "desc" ? "desc" : "asc");
  const editingPurchase = useMemo(() => purchases.find((purchase) => purchase.id === editingId) ?? null, [purchases, editingId]);
  const sortedPurchases = useMemo(() => sortRows(purchases, receipts, sortKey, direction), [purchases, receipts, sortKey, direction]);

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

  return (
    <>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Project" sortKey="projectName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Budget Line" sortKey="budgetCode" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Title" sortKey="title" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Req #" sortKey="requisitionNumber" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="PO #" sortKey="poNumber" activeKey={sortKey} direction={direction} onToggle={onToggle} />
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
                <td colSpan={11}>No procurement records yet.</td>
              </tr>
            ) : null}
            {sortedPurchases.map((purchase) => {
              const relatedReceipts = receipts.filter((receipt) => receipt.purchaseId === purchase.id);
              const receiptTotal = relatedReceipts.reduce((sum, receipt) => sum + receipt.amountReceived, 0);
              const orderValueDisplay =
                purchase.estimatedAmount > 0
                  ? purchase.estimatedAmount
                  : purchase.requestedAmount > 0
                    ? purchase.requestedAmount
                    : purchase.encumberedAmount > 0
                      ? purchase.encumberedAmount
                      : purchase.pendingCcAmount > 0
                        ? purchase.pendingCcAmount
                        : purchase.postedAmount;
              return (
                <tr key={purchase.id}>
                  <td>
                    {purchase.projectName}
                    {purchase.season ? <div>{purchase.season}</div> : null}
                  </td>
                  <td>
                    {purchase.budgetTracked
                      ? `${purchase.budgetCode ?? "-"} | ${purchase.category ?? "-"}`
                      : "Off-budget procurement"}
                  </td>
                  <td>{purchase.title}</td>
                  <td>{purchase.requisitionNumber ?? "-"}</td>
                  <td>{purchase.poNumber ?? "-"}</td>
                  <td>{purchase.vendorName ?? "-"}</td>
                  <td>{formatCurrency(orderValueDisplay)}</td>
                  <td>
                    <span className={`statusChip status-${purchase.procurementStatus}`}>
                      {procurementLabel(purchase.procurementStatus, purchase.requestType === "expense" && purchase.isCreditCard)}
                    </span>
                  </td>
                  <td>
                    <span className={`statusChip status-${purchase.budgetStatus}`}>{purchase.budgetStatus}</span>
                  </td>
                  <td>{formatCurrency(receiptTotal)}</td>
                  <td>
                    {canManageProcurement ? (
                      <button type="button" className="tinyButton" onClick={() => setEditingId(purchase.id)}>
                        Edit
                      </button>
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
                Budget Line
                <select name="budgetLineId" defaultValue={editingPurchase.budgetLineId ?? ""}>
                  <option value="">No budget line</option>
                  {budgetLineOptions
                    .filter((line) => line.projectId === editingPurchase.projectId)
                    .map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Procurement Status
                <select name="procurementStatus" defaultValue={editingPurchase.procurementStatus}>
                  {(editingPurchase.requestType === "expense" && editingPurchase.isCreditCard
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
                  min="0"
                  step="0.01"
                  defaultValue={
                    editingPurchase.estimatedAmount > 0
                      ? editingPurchase.estimatedAmount
                      : editingPurchase.requestedAmount > 0
                        ? editingPurchase.requestedAmount
                        : editingPurchase.encumberedAmount > 0
                          ? editingPurchase.encumberedAmount
                          : editingPurchase.pendingCcAmount > 0
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
              <h2>Receipts</h2>
              <form action={addProcurementReceiptAction} className="requestForm">
                <input type="hidden" name="purchaseId" value={editingPurchase.id} />
                <label>
                  Note
                  <input name="note" placeholder="Package received / partial qty, etc." />
                </label>
                <label>
                  Amount Received
                  <input name="amountReceived" type="number" min="0" step="0.01" />
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
    </>
  );
}
