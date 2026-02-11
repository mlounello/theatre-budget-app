import { formatCurrency } from "@/lib/format";
import { getRequestsData } from "@/lib/db";
import { updatePurchaseStatus } from "@/app/requests/actions";
import { CreateRequestForm } from "@/app/requests/create-request-form";
import { CcReconcileModal } from "@/app/requests/cc-reconcile-modal";
import { RequestRowActions } from "@/app/requests/request-row-actions";

const statuses = ["requested", "encumbered", "pending_cc", "posted", "cancelled"] as const;

export default async function RequestsPage() {
  const { purchases, receipts, budgetLineOptions, accountCodeOptions, canManageSplits } = await getRequestsData();

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
              <th>Type</th>
              <th>Status</th>
              <th>CC Workflow</th>
              <th>Estimated</th>
              <th>Requested</th>
              <th>ENC</th>
              <th>Pending CC</th>
              <th>Posted</th>
              <th>Receipts</th>
              <th>Update Status</th>
              <th>CC Reconcile</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={16}>No purchases yet. Create your first request above.</td>
              </tr>
            ) : null}
            {purchases.map((purchase) => (
              <tr key={purchase.id}>
                <td>{purchase.projectName}</td>
                <td>{purchase.budgetCode}</td>
                <td>{purchase.referenceNumber ?? "-"}</td>
                <td>{purchase.title}</td>
                <td>
                  {purchase.requestType}
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
                  <CcReconcileModal purchase={purchase} receipts={receipts} />
                </td>
                <td>
                  <RequestRowActions purchase={purchase} budgetLineOptions={budgetLineOptions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
