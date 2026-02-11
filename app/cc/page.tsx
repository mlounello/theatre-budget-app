import {
  assignPurchasesToStatementAction,
  createCreditCardAction,
  deleteCreditCardAction,
  deleteStatementMonthAction,
  submitStatementMonthAction,
  unassignPurchaseFromStatementAction,
  updateCreditCardAction,
  updateStatementMonthAction
} from "@/app/cc/actions";
import { CreateStatementMonthForm } from "@/app/cc/create-statement-month-form";
import { getCcPendingRows, getSettingsProjects } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type StatementMonthRow = {
  id: string;
  creditCardId: string;
  creditCardName: string;
  statementMonth: string;
  postedAt: string | null;
};

type PendingPurchaseRow = {
  id: string;
  projectId: string;
  budgetLineId: string;
  title: string;
  referenceNumber: string | null;
  pendingCcAmount: number;
  creditCardId: string | null;
  statementMonthId: string | null;
  projectLabel: string;
  budgetLineLabel: string;
};

export default async function CreditCardPage({
  searchParams
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;

  const supabase = await getSupabaseServerClient();
  const [
    rows,
    projects,
    cardsResponse,
    monthsResponse,
    pendingPurchasesResponse,
    membershipsResponse
  ] = await Promise.all([
    getCcPendingRows(),
    getSettingsProjects(),
    supabase.from("credit_cards").select("id, nickname, masked_number, active").order("nickname", { ascending: true }),
    supabase
      .from("cc_statement_months")
      .select("id, credit_card_id, statement_month, posted_at, credit_cards(nickname)")
      .order("statement_month", { ascending: false }),
    supabase
      .from("purchases")
      .select("id, project_id, budget_line_id, title, reference_number, requisition_number, pending_cc_amount, credit_card_id, cc_statement_month_id, projects(name, season), project_budget_lines(budget_code, category, line_name)")
      .eq("status", "pending_cc")
      .order("created_at", { ascending: true }),
    supabase.from("project_memberships").select("project_id, role")
  ]);

  if (cardsResponse.error) throw cardsResponse.error;
  if (monthsResponse.error) throw monthsResponse.error;
  if (pendingPurchasesResponse.error) throw pendingPurchasesResponse.error;
  if (membershipsResponse.error) throw membershipsResponse.error;

  const membershipRows = membershipsResponse.data ?? [];
  const hasGlobalAdmin = membershipRows.some((row) => (row.role as string) === "admin");
  const manageableProjectIds = new Set(
    membershipRows
      .filter((row) => (row.role as string) === "project_manager")
      .map((row) => row.project_id as string)
  );

  const manageableProjects = hasGlobalAdmin ? projects : projects.filter((project) => manageableProjectIds.has(project.id));

  const cards = (cardsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    nickname: row.nickname as string,
    maskedNumber: (row.masked_number as string | null) ?? null,
    active: Boolean(row.active as boolean | null)
  }));

  const statementMonths: StatementMonthRow[] = (monthsResponse.data ?? []).map((row) => {
    const card = row.credit_cards as { nickname?: string } | null;
    return {
      id: row.id as string,
      creditCardId: row.credit_card_id as string,
      creditCardName: card?.nickname ?? "Unknown Card",
      statementMonth: row.statement_month as string,
      postedAt: (row.posted_at as string | null) ?? null
    };
  });

  const pendingPurchases: PendingPurchaseRow[] = (pendingPurchasesResponse.data ?? []).map((row) => {
    const project = row.projects as { name?: string; season?: string | null } | null;
    const budgetLine = row.project_budget_lines as { budget_code?: string; category?: string; line_name?: string } | null;
    const reqOrRef = (row.requisition_number as string | null) ?? (row.reference_number as string | null) ?? null;
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      budgetLineId: row.budget_line_id as string,
      title: row.title as string,
      referenceNumber: reqOrRef,
      pendingCcAmount: Number(row.pending_cc_amount ?? 0),
      creditCardId: (row.credit_card_id as string | null) ?? null,
      statementMonthId: (row.cc_statement_month_id as string | null) ?? null,
      projectLabel: `${project?.name ?? "Unknown Project"}${project?.season ? ` (${project.season})` : ""}`,
      budgetLineLabel: `${budgetLine?.budget_code ?? "-"} | ${budgetLine?.category ?? "-"} | ${budgetLine?.line_name ?? "-"}`
    };
  });

  const projectNameById = new Map(
    projects.map((project) => [project.id, `${project.name}${project.season ? ` (${project.season})` : ""}`])
  );

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Credit Cards</p>
        <h1>Statement Reconciliation</h1>
        <p className="heroSubtitle">Create monthly statements, add statement lines, then match and post pending purchases.</p>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
      </header>

      <div className="panelGrid">
        <article className="panel">
          <h2>Credit Cards</h2>
          <form action={createCreditCardAction} className="requestForm">
            <label>
              Card Nickname
              <input name="nickname" required placeholder="Theatre Card A" />
            </label>
            <label>
              Masked Number
              <input name="maskedNumber" placeholder="****1234" />
            </label>
            <label className="checkboxLabel">
              <input name="active" type="checkbox" defaultChecked />
              Active
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Card
            </button>
          </form>

          <div className="tableWrap" style={{ marginTop: "0.75rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Nickname</th>
                  <th>Masked</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cards.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No cards yet.</td>
                  </tr>
                ) : null}
                {cards.map((card) => (
                  <tr key={card.id}>
                    <td>{card.nickname}</td>
                    <td>{card.maskedNumber ?? "-"}</td>
                    <td>{card.active ? "Yes" : "No"}</td>
                    <td>
                      <details>
                        <summary className="tinyButton" style={{ display: "inline-block", listStyle: "none", cursor: "pointer" }}>
                          Edit
                        </summary>
                        <form action={updateCreditCardAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                          <input type="hidden" name="id" value={card.id} />
                          <input name="nickname" defaultValue={card.nickname} required />
                          <input name="maskedNumber" defaultValue={card.maskedNumber ?? ""} placeholder="****1234" />
                          <label className="checkboxLabel">
                            <input name="active" type="checkbox" defaultChecked={card.active} />
                            Active
                          </label>
                          <button type="submit" className="tinyButton">
                            Save
                          </button>
                        </form>
                      </details>
                      <form action={deleteCreditCardAction} className="inlineEditForm">
                        <input type="hidden" name="id" value={card.id} />
                        <button type="submit" className="tinyButton dangerButton">
                          Trash
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <h2>Open Statement Month</h2>
          <CreateStatementMonthForm cards={cards} />
          {manageableProjects.length === 0 && !hasGlobalAdmin ? (
            <p className="errorNote">You need Admin or Project Manager access to manage statements.</p>
          ) : null}
        </article>
      </div>

      <article className="panel panelFull">
        <h2>Statement Months</h2>
        {statementMonths.length === 0 ? <p>No statement months yet.</p> : null}

        {statementMonths.map((month) => {
          const assignedPurchases = pendingPurchases.filter((purchase) => purchase.statementMonthId === month.id);
          const unassignedCandidates = pendingPurchases.filter(
            (purchase) =>
              !purchase.statementMonthId &&
              (purchase.creditCardId === month.creditCardId || purchase.creditCardId === null)
          );
          const assignedTotal = assignedPurchases.reduce((sum, purchase) => sum + purchase.pendingCcAmount, 0);
          return (
            <details key={month.id} className="treeNode" open>
              <summary>
                <strong>{month.statementMonth.slice(0, 7)}</strong> | {month.creditCardName} |{" "}
                {month.postedAt ? "Statement Paid" : "Open"}
              </summary>

              <form action={updateStatementMonthAction} className="inlineEditForm" style={{ marginBottom: "0.45rem" }}>
                <input type="hidden" name="id" value={month.id} />
                <input type="month" name="statementMonth" defaultValue={month.statementMonth.slice(0, 7)} required />
                <select name="creditCardId" defaultValue={month.creditCardId} required>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.nickname} {card.maskedNumber ? `(${card.maskedNumber})` : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" className="tinyButton">
                  Save Month
                </button>
              </form>

              <form action={deleteStatementMonthAction} className="inlineEditForm" style={{ marginBottom: "0.45rem" }}>
                <input type="hidden" name="id" value={month.id} />
                <button type="submit" className="tinyButton dangerButton">
                  Trash Statement Month
                </button>
              </form>

              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Budget Line</th>
                      <th>Req/Ref #</th>
                      <th>Title</th>
                      <th>Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedPurchases.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No purchases assigned to this statement month.</td>
                      </tr>
                    ) : null}
                    {assignedPurchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td>{purchase.projectLabel}</td>
                        <td>{purchase.budgetLineLabel}</td>
                        <td>{purchase.referenceNumber ?? "-"}</td>
                        <td>{purchase.title}</td>
                        <td>{formatCurrency(purchase.pendingCcAmount)}</td>
                        <td>
                          {!month.postedAt ? (
                            <form action={unassignPurchaseFromStatementAction} className="inlineEditForm">
                              <input type="hidden" name="statementMonthId" value={month.id} />
                              <input type="hidden" name="purchaseId" value={purchase.id} />
                              <button type="submit" className="tinyButton dangerButton">
                                Remove
                              </button>
                            </form>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="heroSubtitle">Assigned Total: {formatCurrency(assignedTotal)}</p>

              {!month.postedAt ? (
                <>
                  <form action={assignPurchasesToStatementAction} className="requestForm">
                    <input type="hidden" name="statementMonthId" value={month.id} />
                    <div className="checkboxStack">
                      {unassignedCandidates.map((purchase) => (
                        <label key={purchase.id} className="checkboxLabel">
                          <input type="checkbox" name="purchaseId" value={purchase.id} />
                          {purchase.projectLabel} | {purchase.budgetLineLabel} | {purchase.referenceNumber ?? purchase.id.slice(0, 8)} |{" "}
                          {purchase.title} | {formatCurrency(purchase.pendingCcAmount)}
                        </label>
                      ))}
                      {unassignedCandidates.length === 0 ? <p>No unassigned Pending CC purchases for this card.</p> : null}
                    </div>
                    {unassignedCandidates.length > 0 ? (
                      <button type="submit" className="tinyButton">
                        Add Selected Purchases
                      </button>
                    ) : null}
                  </form>

                  <form action={submitStatementMonthAction} className="inlineEditForm" style={{ marginTop: "0.6rem" }}>
                    <input type="hidden" name="statementMonthId" value={month.id} />
                    <button type="submit" className="buttonLink buttonPrimary">
                      Submit Statement (Mark Statement Paid)
                    </button>
                  </form>
                </>
              ) : (
                <p className="successNote">Statement submitted and linked purchases marked as Statement Paid.</p>
              )}
            </details>
          );
        })}
      </article>

      <article className="panel panelFull">
        <h2>Current Pending CC by Budget Code</h2>
        <p className="heroSubtitle">Live pending balances still waiting to be posted.</p>
      </article>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Budget Code</th>
              <th>Card</th>
              <th>Pending CC Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>No pending credit card balances.</td>
              </tr>
            ) : null}
            {rows.map((row, idx) => (
              <tr key={`${row.projectId}-${row.budgetCode}-${row.creditCardName ?? "na"}-${idx}`}>
                <td>{projectNameById.get(row.projectId) ?? row.projectId}</td>
                <td>{row.budgetCode}</td>
                <td>{row.creditCardName ?? "Unassigned"}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
