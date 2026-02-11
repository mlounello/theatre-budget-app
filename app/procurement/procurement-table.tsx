"use client";

import { useMemo, useState } from "react";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPurchase = useMemo(() => purchases.find((purchase) => purchase.id === editingId) ?? null, [purchases, editingId]);

  return (
    <>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Budget Line</th>
              <th>Title</th>
              <th>Req #</th>
              <th>PO #</th>
              <th>Vendor</th>
              <th>Order Value</th>
              <th>Procurement</th>
              <th>Budget Status</th>
              <th>Receipt Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={11}>No procurement records yet.</td>
              </tr>
            ) : null}
            {purchases.map((purchase) => {
              const relatedReceipts = receipts.filter((receipt) => receipt.purchaseId === purchase.id);
              const receiptTotal = relatedReceipts.reduce((sum, receipt) => sum + receipt.amountReceived, 0);
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
                  <td>{formatCurrency(purchase.requestedAmount)}</td>
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
                  defaultValue={editingPurchase.requestedAmount}
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
