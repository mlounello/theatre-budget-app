import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";
import { getMyBudgetData } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

function labelForType(value: string): string {
  if (value === "request") return "Budget Hold";
  if (value === "budget_transfer") return "Budget Transfer";
  if (value === "contract_payment") return "Contract Payment";
  if (value === "expense") return "Expense";
  if (value === "contract") return "Contract";
  return "Requisition";
}

function labelForStatus(value: string): string {
  if (value === "partial_received") return "Partially Received";
  if (value === "fully_received") return "Fully Received";
  if (value === "invoice_sent") return "Invoice Sent";
  if (value === "invoice_received") return "Invoice Received";
  if (value === "pending_cc") return "Pending CC";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function MyBudgetPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");

  const { cards, openRequisitions } = await getMyBudgetData();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">My Budget</p>
        <h1>Assigned Budget Board</h1>
        <p className="heroSubtitle">Project and category scoped view with obligations and open planning impact.</p>
      </header>

      <article className="panel">
        <h2>Open Requisition Follow-Up</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Title</th>
                <th>Req #</th>
                <th>PO #</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {openRequisitions.length === 0 ? (
                <tr>
                  <td colSpan={7}>No open requisitions in your scope.</td>
                </tr>
              ) : null}
              {openRequisitions.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.projectName}
                    {row.season ? ` (${row.season})` : ""}
                  </td>
                  <td>{row.title}</td>
                  <td>{row.requisitionNumber ?? "-"}</td>
                  <td>{row.poNumber ?? "-"}</td>
                  <td>{row.vendorName ?? "-"}</td>
                  <td>
                    <span className={`statusChip status-${row.procurementStatus}`}>{labelForStatus(row.procurementStatus)}</span>
                  </td>
                  <td>{formatCurrency(row.orderValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {cards.length === 0 ? (
        <article className="panel">
          <h2>No Assigned Rows</h2>
          <p>No budget rows are visible for your account yet.</p>
        </article>
      ) : null}

      <div className="gridCards">
        {cards.map((card) => (
          <article key={`${card.projectId}:${card.productionCategoryId ?? "none"}`} className="projectCard">
            <div className="projectCardHeader">
              <h2>
                {card.projectName}
                {card.season ? ` (${card.season})` : ""} - {card.productionCategoryName}
              </h2>
              <p>
                {card.fiscalYearName ?? "No Fiscal Year"} | {card.orgCode ?? "-"} | {card.organizationName ?? "No Organization"}
              </p>
            </div>
            <dl className="metricGrid">
              <div>
                <dt>Allocated</dt>
                <dd>{formatCurrency(card.allocatedTotal)}</dd>
              </div>
              <div>
                <dt>YTD</dt>
                <dd>{formatCurrency(card.ytdTotal)}</dd>
              </div>
              <div>
                <dt>ENC</dt>
                <dd>{formatCurrency(card.encTotal)}</dd>
              </div>
              <div>
                <dt>Held</dt>
                <dd>{formatCurrency(card.heldTotal)}</dd>
              </div>
              <div>
                <dt>Pending CC</dt>
                <dd>{formatCurrency(card.pendingCcTotal)}</dd>
              </div>
              <div>
                <dt>Obligated</dt>
                <dd>{formatCurrency(card.obligatedTotal)}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd className={card.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(card.remainingTrue)}</dd>
              </div>
              <div>
                <dt>Remaining if Requested Approved</dt>
                <dd className={card.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                  {formatCurrency(card.remainingIfRequestedApproved)}
                </dd>
              </div>
            </dl>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Vendor</th>
                    <th>Req/Ref #</th>
                    <th>PO #</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {card.entries.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No line items yet.</td>
                    </tr>
                  ) : null}
                  {card.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{labelForType(entry.requestType)}</td>
                      <td>{entry.title}</td>
                      <td>{entry.vendorName ?? "-"}</td>
                      <td>{entry.requisitionNumber ?? "-"}</td>
                      <td>{entry.poNumber ?? "-"}</td>
                      <td>
                        <span className={`statusChip status-${entry.procurementStatus}`}>{labelForStatus(entry.procurementStatus)}</span>
                      </td>
                      <td>{formatCurrency(entry.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
