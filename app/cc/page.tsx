import {
  assignReceiptsToStatementAction,
  createCreditCardAction,
  submitStatementMonthAction,
  unassignReceiptFromStatementAction
} from "@/app/cc/actions";
import { CcAdminTables } from "@/app/cc/cc-admin-tables";
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

type PendingReceiptRow = {
  id: string;
  purchaseId: string;
  amount: number;
  note: string | null;
  receiptDate: string;
  requestTitle: string;
  requestNumber: string | null;
  purchasePendingCcAmount: number;
  purchaseCreditCardId: string | null;
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
      .from("purchase_receipts")
      .select(
        "id, purchase_id, amount_received, note, created_at, cc_statement_month_id, purchases!inner(id, title, reference_number, requisition_number, pending_cc_amount, credit_card_id, status, request_type, is_credit_card, projects(name, season), project_budget_lines(budget_code, category, line_name))"
      )
      .eq("purchases.status", "pending_cc")
      .eq("purchases.request_type", "expense")
      .eq("purchases.is_credit_card", true)
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

  const pendingReceipts: PendingReceiptRow[] = (pendingPurchasesResponse.data ?? []).map((row) => {
    const purchase = row.purchases as
      | {
          id?: string;
          title?: string;
          reference_number?: string | null;
          requisition_number?: string | null;
          pending_cc_amount?: number | string | null;
          credit_card_id?: string | null;
          projects?: { name?: string; season?: string | null } | null;
          project_budget_lines?: { budget_code?: string; category?: string; line_name?: string } | null;
        }
      | null;
    const project = purchase?.projects;
    const budgetLine = purchase?.project_budget_lines;
    const reqOrRef = (purchase?.requisition_number as string | null) ?? (purchase?.reference_number as string | null) ?? null;
    return {
      id: row.id as string,
      purchaseId: (row.purchase_id as string) ?? ((purchase?.id as string | undefined) ?? ""),
      amount: Number(row.amount_received ?? 0),
      note: (row.note as string | null) ?? null,
      receiptDate: (row.created_at as string) ?? "",
      requestTitle: purchase?.title ?? "Request",
      requestNumber: reqOrRef,
      purchasePendingCcAmount: Number(purchase?.pending_cc_amount ?? 0),
      purchaseCreditCardId: (purchase?.credit_card_id as string | null) ?? null,
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
        <p className="heroSubtitle">Create monthly statements, assign receipts, then submit statement paid.</p>
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

          <CcAdminTables cards={cards} statementMonths={statementMonths} />
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
        <p className="heroSubtitle">Use the bulk table above to edit/delete statement months. Expand a month below to assign or reconcile receipts.</p>
        {statementMonths.length === 0 ? <p>No statement months yet.</p> : null}

        {statementMonths.map((month) => {
          const assignedReceipts = pendingReceipts.filter((receipt) => receipt.statementMonthId === month.id);
          const unassignedCandidates = pendingReceipts.filter(
            (receipt) =>
              !receipt.statementMonthId &&
              (receipt.purchaseCreditCardId === month.creditCardId || receipt.purchaseCreditCardId === null)
          );
          const assignedTotal = assignedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
          return (
            <details key={month.id} className="treeNode" open>
              <summary>
                <strong>{month.statementMonth.slice(0, 7)}</strong> | {month.creditCardName} |{" "}
                {month.postedAt ? "Statement Paid" : "Open"}
              </summary>

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
                    {assignedReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No receipts assigned to this statement month.</td>
                      </tr>
                    ) : null}
                    {assignedReceipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td>{receipt.projectLabel}</td>
                        <td>{receipt.budgetLineLabel}</td>
                        <td>{receipt.requestNumber ?? "-"}</td>
                        <td>{receipt.requestTitle}</td>
                        <td>{formatCurrency(receipt.amount)}</td>
                        <td>
                          {!month.postedAt ? (
                            <form action={unassignReceiptFromStatementAction} className="inlineEditForm">
                              <input type="hidden" name="statementMonthId" value={month.id} />
                              <input type="hidden" name="receiptId" value={receipt.id} />
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
                  <form action={assignReceiptsToStatementAction} className="requestForm">
                    <input type="hidden" name="statementMonthId" value={month.id} />
                    <div className="checkboxStack">
                      {unassignedCandidates.map((receipt) => (
                        <label key={receipt.id} className="checkboxLabel">
                          <input type="checkbox" name="receiptId" value={receipt.id} />
                          {receipt.projectLabel} | {receipt.budgetLineLabel} | {receipt.requestNumber ?? receipt.id.slice(0, 8)} |{" "}
                          {receipt.requestTitle} | {formatCurrency(receipt.amount)}
                        </label>
                      ))}
                      {unassignedCandidates.length === 0 ? <p>No unassigned Pending CC receipts for this card.</p> : null}
                    </div>
                    {unassignedCandidates.length > 0 ? (
                      <button type="submit" className="tinyButton">
                        Add Selected Receipts
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
                <p className="successNote">Statement submitted and linked receipts marked as Statement Paid.</p>
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
