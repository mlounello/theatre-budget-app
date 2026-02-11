import { formatCurrency } from "@/lib/format";
import { getRequestsData } from "@/lib/db";
import { addRequestReceipt, reconcileRequestToPendingCc, updatePurchaseStatus } from "@/app/requests/actions";
import { CreateRequestForm } from "@/app/requests/create-request-form";

const statuses = ["requested", "encumbered", "pending_cc", "posted", "cancelled"] as const;

export default async function RequestsPage() {
  const { purchases, budgetLineOptions, accountCodeOptions, canManageSplits } = await getRequestsData();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Buyer Queue</p>
        <h1>Purchase Requests</h1>
        <p className="heroSubtitle">
          Buyers submit estimated/requested amounts. PM/Admin move items to Encumbered, Pending CC, or Posted.
        </p>
      </header>

      <article className="panel requestFormPanel">
        <h2>Create Request</h2>
        <CreateRequestForm
          budgetLineOptions={budgetLineOptions}
          accountCodeOptions={accountCodeOptions}
          canManageSplits={canManageSplits}
        />
      </article>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Code</th>
              <th>Reference</th>
              <th>Title</th>
              <th>Status</th>
              <th>Estimated</th>
              <th>Requested</th>
              <th>ENC</th>
              <th>Pending CC</th>
              <th>Posted</th>
              <th>Receipts</th>
              <th>Update Status</th>
              <th>CC Reconcile</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={13}>No purchases yet. Create your first request above.</td>
              </tr>
            ) : null}
            {purchases.map((purchase) => (
              <tr key={purchase.id}>
                <td>{purchase.projectName}</td>
                <td>{purchase.budgetCode}</td>
                <td>{purchase.referenceNumber ?? "-"}</td>
                <td>{purchase.title}</td>
                <td>
                  <span className={`statusChip status-${purchase.status}`}>{purchase.status}</span>
                </td>
                <td>{formatCurrency(purchase.estimatedAmount)}</td>
                <td>{formatCurrency(purchase.requestedAmount)}</td>
                <td>{formatCurrency(purchase.encumberedAmount)}</td>
                <td>{formatCurrency(purchase.pendingCcAmount)}</td>
                <td>{formatCurrency(purchase.postedAmount)}</td>
                <td>
                  <strong>{formatCurrency(purchase.receiptTotal)}</strong>
                  <div>{purchase.receiptCount} receipts</div>
                </td>
                <td>
                  <form action={updatePurchaseStatus} className="inlineStatusForm">
                    <input type="hidden" name="purchaseId" value={purchase.id} />
                    <select name="status" defaultValue={purchase.status}>
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <input
                      name="statusAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount"
                      defaultValue={
                        purchase.status === "encumbered"
                          ? purchase.encumberedAmount
                          : purchase.status === "pending_cc"
                            ? purchase.pendingCcAmount
                            : purchase.status === "posted"
                              ? purchase.postedAmount
                              : purchase.requestedAmount
                      }
                    />
                    <button type="submit" className="tinyButton">
                      Save
                    </button>
                  </form>
                </td>
                <td>
                  <form
                    action={addRequestReceipt}
                    className="inlineStatusForm"
                    style={{ marginBottom: "0.4rem" }}
                    encType="multipart/form-data"
                  >
                    <input type="hidden" name="purchaseId" value={purchase.id} />
                    <input name="amountReceived" type="number" step="0.01" min="0.01" placeholder="Receipt $" required />
                    <input name="note" placeholder="Receipt note" />
                    <input name="receiptUrl" placeholder="Receipt URL (optional)" />
                    <input name="receiptFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" />
                    <button type="submit" className="tinyButton">
                      Add Receipt
                    </button>
                  </form>
                  <form action={reconcileRequestToPendingCc} className="inlineStatusForm">
                    <input type="hidden" name="purchaseId" value={purchase.id} />
                    <button type="submit" className="tinyButton">
                      Reconcile to Pending CC
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
