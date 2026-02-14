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

export default async function MyBudgetPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedProjectId = (resolvedSearchParams?.projectId ?? "").trim();

  const { cards } = await getMyBudgetData();
  const projectChoices = Array.from(new Map(cards.map((card) => [card.projectId, card.projectName])).entries()).map(([id, name]) => ({
    id,
    name
  }));

  const filteredCards = selectedProjectId ? cards.filter((card) => card.projectId === selectedProjectId) : cards;
  const flattenedRows = filteredCards.flatMap((card) =>
    card.entries.map((entry) => ({
      ...entry,
      projectId: card.projectId,
      projectName: card.projectName,
      season: card.season,
      category: card.productionCategoryName,
      fiscalYearName: card.fiscalYearName,
      orgCode: card.orgCode,
      organizationName: card.organizationName
    }))
  );

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">My Budget</p>
        <h1>Project Running List</h1>
        <p className="heroSubtitle">Full scoped running list of requests/orders for reconciliation and budget tracking.</p>
      </header>

      <article className="panel requestFormPanel">
        <h2>View Project</h2>
        <form method="get" className="requestForm">
          <label>
            Project
            <select name="projectId" defaultValue={selectedProjectId}>
              <option value="">All scoped projects</option>
              {projectChoices.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Apply
          </button>
        </form>
      </article>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Department</th>
              <th>Type</th>
              <th>Title</th>
              <th>Vendor</th>
              <th>Req/Ref #</th>
              <th>PO #</th>
              <th>Procurement Status</th>
              <th>Budget Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {flattenedRows.length === 0 ? (
              <tr>
                <td colSpan={10}>No line items in this scope yet.</td>
              </tr>
            ) : null}
            {flattenedRows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.projectName}
                  {row.season ? ` (${row.season})` : ""}
                  <div style={{ opacity: 0.8 }}>
                    {row.fiscalYearName ?? "No FY"} | {row.orgCode ?? "-"} | {row.organizationName ?? "No Org"}
                  </div>
                </td>
                <td>{row.category}</td>
                <td>{labelForType(row.requestType)}</td>
                <td>{row.title}</td>
                <td>{row.vendorName ?? "-"}</td>
                <td>{row.requisitionNumber ?? row.referenceNumber ?? "-"}</td>
                <td>{row.poNumber ?? "-"}</td>
                <td>
                  <span className={`statusChip status-${row.procurementStatus}`}>{labelForStatus(row.procurementStatus)}</span>
                </td>
                <td>
                  <span className={`statusChip status-${row.status}`}>{labelForStatus(row.status)}</span>
                </td>
                <td>{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
