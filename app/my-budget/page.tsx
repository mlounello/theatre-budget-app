import { createPlanningRequestAction } from "@/app/my-budget/actions";
import { formatCurrency } from "@/lib/format";
import { getMyBoardData } from "@/lib/db";

export default async function MyBudgetPage() {
  const { profile, rows } = await getMyBoardData();

  const formOptions = new Map<string, { projectId: string; projectName: string; categoryId: string; categoryName: string }>();
  for (const row of rows) {
    if (!row.productionCategoryId) continue;
    const key = `${row.projectId}|${row.productionCategoryId}`;
    if (!formOptions.has(key)) {
      formOptions.set(key, {
        projectId: row.projectId,
        projectName: row.projectName,
        categoryId: row.productionCategoryId,
        categoryName: row.productionCategoryName
      });
    }
  }

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">My Budget</p>
        <h1>Assigned Budget Board</h1>
        <p className="heroSubtitle">
          Viewer shows obligated + planning impact. Buyer adds planning requests and sees status detail.
        </p>
      </header>

      {profile.canAddRequests ? (
        <article className="panel panelFull">
          <h2>Add Planning Request</h2>
          <p>Create a budget planning line. This counts in open requests, not true obligated.</p>
          <form action={createPlanningRequestAction} className="requestForm">
            <label>
              Project
              <select name="projectId" required defaultValue="">
                <option value="">Select project</option>
                {Array.from(new Map(Array.from(formOptions.values()).map((o) => [o.projectId, o])).values()).map((option) => (
                  <option key={option.projectId} value={option.projectId}>
                    {option.projectName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Department
              <select name="productionCategoryId" required defaultValue="">
                <option value="">Select department</option>
                {Array.from(new Map(Array.from(formOptions.values()).map((o) => [o.categoryId, o])).values()).map((option) => (
                  <option key={option.categoryId} value={option.categoryId}>
                    {option.categoryName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input name="title" required placeholder="Item description" />
            </label>
            <label>
              Vendor (Optional)
              <input name="vendorName" placeholder="Vendor name" />
            </label>
            <label>
              Req/PO # (Optional)
              <input name="requisitionNumber" placeholder="REQ or PO #" />
            </label>
            <label>
              Amount
              <input name="amount" type="number" step="0.01" required />
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Planning Request
            </button>
          </form>
        </article>
      ) : null}

      {rows.length === 0 ? (
        <article className="panel panelFull">
          <h2>No Assigned Rows</h2>
          <p>No budget rows are visible for your account yet.</p>
        </article>
      ) : null}

      {rows.map((row) => (
        <article key={row.key} className="panel panelFull">
          <h2>
            {row.projectName}
            {row.season ? ` (${row.season})` : ""} - {row.productionCategoryName}
          </h2>
          <p className="heroSubtitle">
            {row.fiscalYearName ?? "No Fiscal Year"} | {row.organizationLabel ?? "No Organization"}
          </p>
          <div className="statsGrid">
            <div className="statCard">
              <p>Starting Allotment</p>
              <strong>{formatCurrency(row.startingAllotment)}</strong>
            </div>
            <div className="statCard">
              <p>Obligated (True Orders)</p>
              <strong>{formatCurrency(row.obligatedTotal)}</strong>
            </div>
            <div className="statCard">
              <p>Open Requests</p>
              <strong>{formatCurrency(row.openRequestTotal)}</strong>
            </div>
            <div className="statCard">
              <p>Remaining (True)</p>
              <strong className={row.remainingTrue < 0 ? "valueNegative" : "valuePositive"}>
                {formatCurrency(row.remainingTrue)}
              </strong>
            </div>
            <div className="statCard">
              <p>Remaining if Open Approved</p>
              <strong className={row.remainingIfRequestsApproved < 0 ? "valueNegative" : "valuePositive"}>
                {formatCurrency(row.remainingIfRequestsApproved)}
              </strong>
            </div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Vendor</th>
                  <th>PO #</th>
                  <th>Status</th>
                  {profile.role === "buyer" || profile.role === "project_manager" || profile.role === "admin" ? (
                    <th>Procurement</th>
                  ) : null}
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {row.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.lineType === "planning_request" ? "Budget Planning Request" : "True Order"}</td>
                    <td>{line.title}</td>
                    <td>{line.vendorName ?? "-"}</td>
                    <td>{line.poNumber ?? "-"}</td>
                    <td>{line.budgetStatus}</td>
                    {profile.role === "buyer" || profile.role === "project_manager" || profile.role === "admin" ? (
                      <td>{line.procurementStatus ?? "-"}</td>
                    ) : null}
                    <td>{formatCurrency(line.amount)}</td>
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
