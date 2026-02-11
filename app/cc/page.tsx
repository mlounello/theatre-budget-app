import {
  addStatementLineAction,
  confirmStatementLineMatchAction,
  createCreditCardAction,
  createStatementMonthAction,
  deleteCreditCardAction,
  deleteStatementMonthAction,
  updateCreditCardAction,
  updateStatementMonthAction
} from "@/app/cc/actions";
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

type StatementLineRow = {
  id: string;
  statementMonthId: string;
  projectBudgetLineId: string;
  projectLabel: string;
  budgetCode: string;
  category: string;
  lineName: string;
  amount: number;
  note: string | null;
  matchedPurchaseIds: string[];
};

type PendingPurchaseRow = {
  id: string;
  projectId: string;
  budgetLineId: string;
  title: string;
  referenceNumber: string | null;
  pendingCcAmount: number;
  creditCardId: string | null;
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
    linesResponse,
    pendingPurchasesResponse,
    budgetLinesResponse,
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
      .from("cc_statement_lines")
      .select("id, statement_month_id, project_budget_line_id, amount, note, matched_purchase_ids, project_budget_lines(project_id, budget_code, category, line_name, projects(name, season))")
      .order("created_at", { ascending: false }),
    supabase
      .from("purchases")
      .select("id, project_id, budget_line_id, title, reference_number, pending_cc_amount, credit_card_id")
      .eq("status", "pending_cc")
      .order("created_at", { ascending: true }),
    supabase
      .from("project_budget_lines")
      .select("id, project_id, budget_code, category, line_name, active")
      .eq("active", true)
      .order("budget_code", { ascending: true })
    ,
    supabase.from("project_memberships").select("project_id, role")
  ]);

  if (cardsResponse.error) throw cardsResponse.error;
  if (monthsResponse.error) throw monthsResponse.error;
  if (linesResponse.error) throw linesResponse.error;
  if (pendingPurchasesResponse.error) throw pendingPurchasesResponse.error;
  if (budgetLinesResponse.error) throw budgetLinesResponse.error;
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

  const statementLines: StatementLineRow[] = (linesResponse.data ?? []).map((row) => {
    const budgetLine = row.project_budget_lines as
      | { project_id?: string; budget_code?: string; category?: string; line_name?: string; projects?: { name?: string; season?: string | null } | null }
      | null;
    const project = budgetLine?.projects;
    return {
      id: row.id as string,
      statementMonthId: row.statement_month_id as string,
      projectBudgetLineId: row.project_budget_line_id as string,
      projectLabel: `${project?.name ?? "Unknown Project"}${project?.season ? ` (${project.season})` : ""}`,
      budgetCode: budgetLine?.budget_code ?? "-",
      category: budgetLine?.category ?? "-",
      lineName: budgetLine?.line_name ?? "-",
      amount: Number(row.amount ?? 0),
      note: (row.note as string | null) ?? null,
      matchedPurchaseIds: ((row.matched_purchase_ids as string[] | null) ?? []).map((id) => String(id))
    };
  });

  const pendingPurchases: PendingPurchaseRow[] = (pendingPurchasesResponse.data ?? []).map((row) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    budgetLineId: row.budget_line_id as string,
    title: row.title as string,
    referenceNumber: (row.reference_number as string | null) ?? null,
    pendingCcAmount: Number(row.pending_cc_amount ?? 0),
    creditCardId: (row.credit_card_id as string | null) ?? null
  }));

  const projectNameById = new Map(
    projects.map((project) => [project.id, `${project.name}${project.season ? ` (${project.season})` : ""}`])
  );

  const budgetLines = (budgetLinesResponse.data ?? []).map((row) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    label: `${projectNameById.get(row.project_id as string) ?? "Unknown Project"} | ${row.budget_code as string} | ${row.category as string} | ${row.line_name as string}`
  }));

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
          <form action={createStatementMonthAction} className="requestForm">
            <label>
              Credit Card
              <select name="creditCardId" required>
                <option value="">Select card</option>
                {cards
                  .filter((card) => card.active)
                  .map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.nickname} {card.maskedNumber ? `(${card.maskedNumber})` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Statement Month
              <input type="month" name="statementMonth" required />
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Statement Month
            </button>
            {manageableProjects.length === 0 && !hasGlobalAdmin ? (
              <p className="errorNote">You need Admin or Project Manager access to manage statements.</p>
            ) : null}
          </form>
        </article>
      </div>

      <article className="panel panelFull">
        <h2>Statement Months and Lines</h2>
        {statementMonths.length === 0 ? <p>No statement months yet.</p> : null}

        {statementMonths.map((month) => {
          const monthLines = statementLines.filter((line) => line.statementMonthId === month.id);
          return (
            <details key={month.id} className="treeNode" open>
              <summary>
                <strong>{month.statementMonth.slice(0, 7)}</strong> | {month.creditCardName} |{" "}
                {month.postedAt ? "Posted" : "Open"}
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

              <form action={addStatementLineAction} className="inlineEditForm">
                <input type="hidden" name="statementMonthId" value={month.id} />
                <select name="projectBudgetLineId" required>
                  <option value="">Budget line</option>
                  {budgetLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.label}
                    </option>
                  ))}
                </select>
                <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required />
                <input name="note" placeholder="Optional note" />
                <button type="submit" className="tinyButton">
                  Add Statement Line
                </button>
              </form>

              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Budget Line</th>
                      <th>Amount</th>
                      <th>Note</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthLines.length === 0 ? (
                      <tr>
                        <td colSpan={4}>No statement lines yet.</td>
                      </tr>
                    ) : null}
                    {monthLines.map((line) => {
                      const candidates = pendingPurchases.filter(
                        (purchase) =>
                          purchase.budgetLineId === line.projectBudgetLineId &&
                          (purchase.creditCardId === month.creditCardId || purchase.creditCardId === null)
                      );

                      const exactCandidates = candidates.filter(
                        (purchase) => Math.abs(purchase.pendingCcAmount - line.amount) < 0.01
                      );

                      return (
                        <tr key={line.id}>
                          <td>
                            {line.projectLabel} | {line.budgetCode} | {line.category} | {line.lineName}
                          </td>
                          <td>{formatCurrency(line.amount)}</td>
                          <td>{line.note ?? "-"}</td>
                          <td>
                            {line.matchedPurchaseIds.length > 0 ? (
                              <span className="statusChip status-posted">Matched ({line.matchedPurchaseIds.length})</span>
                            ) : (
                              <form action={confirmStatementLineMatchAction} className="requestForm">
                                <input type="hidden" name="statementLineId" value={line.id} />
                                <div className="checkboxStack">
                                  {(exactCandidates.length > 0 ? exactCandidates : candidates).map((purchase) => (
                                    <label key={purchase.id} className="checkboxLabel">
                                      <input
                                        type="checkbox"
                                        name="purchaseId"
                                        value={purchase.id}
                                        defaultChecked={exactCandidates.length === 1 && exactCandidates[0]?.id === purchase.id}
                                      />
                                      {purchase.referenceNumber ?? purchase.id.slice(0, 8)} | {purchase.title} |{" "}
                                      {formatCurrency(purchase.pendingCcAmount)}
                                    </label>
                                  ))}
                                  {candidates.length === 0 ? <p>No pending candidates for this line/card.</p> : null}
                                </div>
                                {candidates.length > 0 ? (
                                  <button type="submit" className="tinyButton">
                                    Confirm Statement Paid
                                  </button>
                                ) : null}
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
