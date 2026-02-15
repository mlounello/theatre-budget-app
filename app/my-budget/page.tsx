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
  if (access.role === "procurement_tracker") redirect("/procurement-tracker");
  if (searchParams) await searchParams;

  const { cards } = await getMyBudgetData();
  const projectGroups = new Map<
    string,
    {
      projectId: string;
      projectName: string;
      season: string | null;
      fiscalYearName: string | null;
      orgCode: string | null;
      organizationName: string | null;
      rows: Array<{
        id: string;
        category: string;
        type: string;
        title: string;
        vendorName: string | null;
        requestNumber: string | null;
        poNumber: string | null;
        procurementStatus: string;
        budgetStatus: string;
        amount: number;
      }>;
    }
  >();

  for (const card of cards) {
    const key = card.projectId;
    const group =
      projectGroups.get(key) ??
      {
        projectId: card.projectId,
        projectName: card.projectName,
        season: card.season,
        fiscalYearName: card.fiscalYearName,
        orgCode: card.orgCode,
        organizationName: card.organizationName,
        rows: []
      };

    for (const entry of card.entries) {
      group.rows.push({
        id: entry.id,
        category: card.productionCategoryName,
        type: labelForType(entry.requestType),
        title: entry.title,
        vendorName: entry.vendorName,
        requestNumber: entry.requisitionNumber ?? entry.referenceNumber ?? null,
        poNumber: entry.poNumber,
        procurementStatus: entry.procurementStatus,
        budgetStatus: entry.status,
        amount: entry.amount
      });
    }
    projectGroups.set(key, group);
  }

  const groupedProjects = Array.from(projectGroups.values()).map((group) => ({
    ...group,
    rows: group.rows.sort((a, b) => a.title.localeCompare(b.title))
  }));

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">My Budget</p>
        <h1>Department Actuals and Running List</h1>
        <p className="heroSubtitle">
          Scoped department-level totals first, then full running lists grouped by project.
        </p>
      </header>

      <article className="panel">
        <h2>Actuals by Production Department</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>FY</th>
                <th>Org</th>
                <th>Project</th>
                <th>Department</th>
                <th>Allocated</th>
                <th>Requested</th>
                <th>Held</th>
                <th>ENC</th>
                <th>Pending CC</th>
                <th>Posted</th>
                <th>Obligated</th>
                <th>Remaining</th>
                <th className="compactHeaderCell">Remaining if Requested Approved</th>
              </tr>
            </thead>
            <tbody>
              {cards.length === 0 ? (
                <tr>
                  <td colSpan={13}>No scoped department totals yet.</td>
                </tr>
              ) : null}
              {cards.map((card) => (
                <tr key={`${card.projectId}:${card.productionCategoryId ?? card.productionCategoryName}`}>
                  <td>{card.fiscalYearName ?? "-"}</td>
                  <td>{card.orgCode ?? "-"}</td>
                  <td>
                    {card.projectName}
                    {card.season ? ` (${card.season})` : ""}
                  </td>
                  <td>{card.productionCategoryName}</td>
                  <td>{formatCurrency(card.allocatedTotal)}</td>
                  <td>{formatCurrency(card.requestedOpenTotal)}</td>
                  <td>{formatCurrency(card.heldTotal)}</td>
                  <td>{formatCurrency(card.encTotal)}</td>
                  <td>{formatCurrency(card.pendingCcTotal)}</td>
                  <td>{formatCurrency(card.ytdTotal)}</td>
                  <td>{formatCurrency(card.obligatedTotal)}</td>
                  <td className={card.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(card.remainingTrue)}</td>
                  <td className={card.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                    {formatCurrency(card.remainingIfRequestedApproved)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {groupedProjects.map((project) => (
        <article className="panel" key={project.projectId}>
          <h2>
            {project.projectName}
            {project.season ? ` (${project.season})` : ""}
          </h2>
          <p className="heroSubtitle">
            {project.fiscalYearName ?? "No FY"} | {project.orgCode ?? "-"} | {project.organizationName ?? "No Organization"}
          </p>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
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
                {project.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>No line items in this project scope yet.</td>
                  </tr>
                ) : null}
                {project.rows.map((row) => (
                  <tr key={`${project.projectId}:${row.id}`}>
                    <td>{row.category}</td>
                    <td>{row.type}</td>
                    <td>{row.title}</td>
                    <td>{row.vendorName ?? "-"}</td>
                    <td>{row.requestNumber ?? "-"}</td>
                    <td>{row.poNumber ?? "-"}</td>
                    <td>
                      <span className={`statusChip status-${row.procurementStatus}`}>{labelForStatus(row.procurementStatus)}</span>
                    </td>
                    <td>
                      <span className={`statusChip status-${row.budgetStatus}`}>{labelForStatus(row.budgetStatus)}</span>
                    </td>
                    <td>{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </section>
  );
}
