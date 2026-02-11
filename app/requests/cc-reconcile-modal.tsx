"use client";

import { useMemo, useState } from "react";
import { addRequestReceipt, reconcileRequestToPendingCc } from "@/app/requests/actions";
import { formatCurrency } from "@/lib/format";
import type { PurchaseRow } from "@/lib/db";

export function CcReconcileModal({ purchase }: { purchase: PurchaseRow }) {
  const [open, setOpen] = useState(false);
  const title = useMemo(() => `${purchase.projectName} | ${purchase.title}`, [purchase.projectName, purchase.title]);

  if (!(purchase.requestType === "expense" && purchase.isCreditCard)) {
    return <span>-</span>;
  }

  return (
    <>
      <button type="button" className="tinyButton" onClick={() => setOpen(true)}>
        CC Reconcile
      </button>
      {open ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Credit card reconcile">
          <div className="modalPanel">
            <h2>Credit Card Reconcile</h2>
            <p className="heroSubtitle">{title}</p>
            <p>
              Requested: <strong>{formatCurrency(purchase.requestedAmount)}</strong> | Receipts:{" "}
              <strong>{formatCurrency(purchase.receiptTotal)}</strong> ({purchase.receiptCount}) | Pending CC:{" "}
              <strong>{formatCurrency(purchase.pendingCcAmount)}</strong>
            </p>

            <article className="panel" style={{ marginBottom: "0.75rem" }}>
              <h3>Add Receipt</h3>
              <form action={addRequestReceipt} className="requestForm" encType="multipart/form-data">
                <input type="hidden" name="purchaseId" value={purchase.id} />
                <label>
                  Amount
                  <input name="amountReceived" type="number" step="0.01" min="0.01" placeholder="0.00" required />
                </label>
                <label>
                  Note
                  <input name="note" placeholder="Receipt note" />
                </label>
                <label>
                  Receipt URL (optional)
                  <input name="receiptUrl" placeholder="https://..." />
                </label>
                <label>
                  Upload File (optional)
                  <input name="receiptFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" />
                </label>
                <button type="submit" className="tinyButton">
                  Add Receipt
                </button>
              </form>
            </article>

            <article className="panel">
              <h3>Reconcile</h3>
              <p>Moves this request to Pending CC using the total of all attached receipt amounts.</p>
              <form action={reconcileRequestToPendingCc} className="inlineEditForm">
                <input type="hidden" name="purchaseId" value={purchase.id} />
                <button type="submit" className="tinyButton">
                  Reconcile to Pending CC
                </button>
              </form>
            </article>

            <div className="modalActions">
              <button type="button" className="tinyButton" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
