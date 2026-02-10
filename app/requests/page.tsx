import { formatCurrency } from "@/lib/format";
import { getRequestsData } from "@/lib/db";
import { createRequest, updatePurchaseStatus } from "@/app/requests/actions";

const statuses = ["requested", "encumbered", "pending_cc", "posted", "cancelled"] as const;

export default async function RequestsPage() {
  const { purchases, budgetLineOptions } = await getRequestsData();

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
        <form className="requestForm" action={createRequest}>
          <label>
            Budget Line
            <select name="budgetLineId" required>
              <option value="">Select budget line</option>
              {budgetLineOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input name="title" required placeholder="Ex: Scenic hardware" />
          </label>
          <label>
            Reference #
            <input name="referenceNumber" placeholder="EP/EC/J code" />
          </label>
          <label>
            Estimated
            <input name="estimatedAmount" type="number" step="0.01" min="0" />
          </label>
          <label>
            Requested
            <input name="requestedAmount" type="number" step="0.01" min="0" />
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Create Request
          </button>
        </form>
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
              <th>Update Status</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 ? (
              <tr>
                <td colSpan={11}>No purchases yet. Create your first request above.</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
