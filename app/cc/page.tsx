import {
  assignReceiptsToStatementAction,
  createReimbursementRequestAction,
  createCreditCardAction,
  postStatementMonthToBannerAction,
  reopenStatementMonthAction,
  submitStatementMonthAction,
  unpostStatementMonthFromBannerAction,
  unassignReceiptFromStatementAction
} from "@/app/cc/actions";
import { CcAdminTables } from "@/app/cc/cc-admin-tables";
import { CreateStatementMonthForm } from "@/app/cc/create-statement-month-form";
import { getAccountCodeOptions, getCcPendingRows, getProductionCategoryOptions, getSettingsProjects } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type StatementMonthRow = {
  id: string;
  creditCardId: string;
  creditCardName: string;
  statementMonth: string;
  postedAt: string | null;
  postedToBannerAt: string | null;
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
  purchaseStatus: string;
  purchaseRequestType: string;
  purchaseIsCreditCard: boolean;
  statementMonthId: string | null;
  projectLabel: string;
  budgetLineLabel: string;
};

export default async function CreditCardPage({
  searchParams
}: {
  searchParams?: Promise<{
    ok?: string;
    error?: string;
    cc_month_card?: string;
    cc_month_state?: string;
    cc_month_q?: string;
    cc_pending_project?: string;
    cc_pending_card?: string;
    cc_pending_q?: string;
  }>;
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
    receiptsResponse,
    membershipsResponse,
    accountCodeOptions,
    productionCategoryOptions
  ] = await Promise.all([
    getCcPendingRows(),
    getSettingsProjects(),
    supabase.from("credit_cards").select("id, nickname, masked_number, active").order("nickname", { ascending: true }),
    supabase
      .from("cc_statement_months")
      .select("id, credit_card_id, statement_month, posted_at, posted_to_banner_at, credit_cards(nickname)")
      .order("statement_month", { ascending: false }),
    supabase
      .from("purchase_receipts")
      .select(
        "id, purchase_id, amount_received, note, created_at, cc_statement_month_id, purchases!inner(id, title, reference_number, requisition_number, pending_cc_amount, credit_card_id, status, request_type, is_credit_card, projects(name, season), project_budget_lines(budget_code, category, line_name))"
      )
      .order("created_at", { ascending: true }),
    supabase.from("project_memberships").select("project_id, role"),
    getAccountCodeOptions(),
    getProductionCategoryOptions()
  ]);

  if (cardsResponse.error) throw cardsResponse.error;
  if (monthsResponse.error) throw monthsResponse.error;
  if (receiptsResponse.error) throw receiptsResponse.error;
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
      postedAt: (row.posted_at as string | null) ?? null,
      postedToBannerAt: (row.posted_to_banner_at as string | null) ?? null
    };
  });

  const selectedMonthCard = (resolvedSearchParams?.cc_month_card ?? "").trim();
  const selectedMonthState = (resolvedSearchParams?.cc_month_state ?? "").trim();
  const selectedMonthQuery = (resolvedSearchParams?.cc_month_q ?? "").trim().toLowerCase();

  const filteredStatementMonths = statementMonths.filter((month) => {
    if (selectedMonthCard && month.creditCardId !== selectedMonthCard) return false;
    if (selectedMonthState === "open" && month.postedAt) return false;
    if (selectedMonthState === "statement_paid" && (!month.postedAt || month.postedToBannerAt)) return false;
    if (selectedMonthState === "posted_to_banner" && !month.postedToBannerAt) return false;
    if (selectedMonthQuery) {
      const hay = `${month.creditCardName} ${month.statementMonth.slice(0, 7)} ${month.postedAt ? "statement paid" : "open"} ${
        month.postedToBannerAt ? "posted to banner" : ""
      }`.toLowerCase();
      if (!hay.includes(selectedMonthQuery)) return false;
    }
    return true;
  });

  const pendingReceipts: PendingReceiptRow[] = (receiptsResponse.data ?? []).map((row) => {
    const purchase = row.purchases as
      | {
          id?: string;
          title?: string;
          reference_number?: string | null;
          requisition_number?: string | null;
          pending_cc_amount?: number | string | null;
          credit_card_id?: string | null;
          status?: string;
          request_type?: string;
          is_credit_card?: boolean | null;
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
      purchaseStatus: (purchase?.status as string | undefined) ?? "",
      purchaseRequestType: (purchase?.request_type as string | undefined) ?? "",
      purchaseIsCreditCard: Boolean(purchase?.is_credit_card as boolean | null | undefined),
      statementMonthId: (row.cc_statement_month_id as string | null) ?? null,
      projectLabel: `${project?.name ?? "Unknown Project"}${project?.season ? ` (${project.season})` : ""}`,
      budgetLineLabel: `${budgetLine?.budget_code ?? "-"} | ${budgetLine?.category ?? "-"} | ${budgetLine?.line_name ?? "-"}`
    };
  });

  const projectNameById = new Map(
    projects.map((project) => [project.id, `${project.name}${project.season ? ` (${project.season})` : ""}`])
  );
  const selectedPendingProject = (resolvedSearchParams?.cc_pending_project ?? "").trim();
  const selectedPendingCard = (resolvedSearchParams?.cc_pending_card ?? "").trim();
  const selectedPendingQuery = (resolvedSearchParams?.cc_pending_q ?? "").trim().toLowerCase();
  const filteredPendingRows = rows
    .filter((row) => {
      if (selectedPendingProject && row.projectId !== selectedPendingProject) return false;
      if (selectedPendingCard && (row.creditCardName ?? "") !== selectedPendingCard) return false;
      if (!selectedPendingQuery) return true;
      const hay = `${projectNameById.get(row.projectId) ?? row.projectId} ${row.budgetCode} ${row.creditCardName ?? "Unassigned"}`.toLowerCase();
      return hay.includes(selectedPendingQuery);
    })
    .sort((a, b) => b.pendingCcTotal - a.pendingCcTotal);

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

        {manageableProjects.length > 0 || hasGlobalAdmin ? (
          <article className="panel">
            <h2>Add Reimbursement</h2>
            <form action={createReimbursementRequestAction} className="requestForm">
              <label>
                Project
                <select name="projectId" required>
                  <option value="">Select project</option>
                  {manageableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.season ? ` (${project.season})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department
                <select name="productionCategoryId" required>
                  <option value="">Select department</option>
                  {productionCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Banner Code
                <select name="bannerAccountCodeId" defaultValue="">
                  <option value="">Unassigned</option>
                  {accountCodeOptions.map((accountCode) => (
                    <option key={accountCode.id} value={accountCode.id}>
                      {accountCode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input name="title" required placeholder="Reimbursement request title" />
              </label>
              <label>
                Reference (optional)
                <input name="referenceNumber" placeholder="Receipt / claim reference" />
              </label>
              <label>
                Amount
                <input name="amount" type="number" step="0.01" required />
              </label>
              <button type="submit" className="buttonLink buttonPrimary">
                Save Reimbursement
              </button>
            </form>
          </article>
        ) : null}
      </div>

      <article className="panel panelFull">
        <h2>Statement Months</h2>
        <p className="heroSubtitle">
          Use the bulk table above to edit/delete statement months. Expand a month below to assign receipts, mark statement paid, then
          post to Banner.
        </p>
        <form method="get" className="requestForm inlineFilterForm" style={{ marginBottom: "0.6rem" }}>
          <label>
            Card
            <select name="cc_month_card" defaultValue={selectedMonthCard}>
              <option value="">All cards</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.nickname}
                </option>
              ))}
            </select>
          </label>
          <label>
            State
            <select name="cc_month_state" defaultValue={selectedMonthState}>
              <option value="">All states</option>
              <option value="open">Open</option>
              <option value="statement_paid">Statement Paid</option>
              <option value="posted_to_banner">Posted To Banner</option>
            </select>
          </label>
          <label>
            Search
            <input name="cc_month_q" defaultValue={selectedMonthQuery} placeholder="Card or month" />
          </label>
          <button type="submit" className="tinyButton">
            Filter
          </button>
        </form>
        {filteredStatementMonths.length === 0 ? <p>No statement months match the current filter.</p> : null}

        {filteredStatementMonths.map((month) => {
          const assignedReceipts = pendingReceipts.filter((receipt) => receipt.statementMonthId === month.id);
          const unassignedCandidates = pendingReceipts.filter(
            (receipt) =>
              !receipt.statementMonthId &&
              receipt.purchaseStatus === "pending_cc" &&
              receipt.purchaseRequestType === "expense" &&
              receipt.purchaseIsCreditCard &&
              (receipt.purchaseCreditCardId === month.creditCardId || receipt.purchaseCreditCardId === null)
          );
          const assignedTotal = assignedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
          return (
            <details key={month.id} className="treeNode" open>
              <summary>
                <strong>{month.statementMonth.slice(0, 7)}</strong> | {month.creditCardName} |{" "}
                {month.postedToBannerAt ? "Posted To Banner" : month.postedAt ? "Statement Paid" : "Open"}
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
                <>
                  <p className="successNote">Statement submitted and linked receipts marked as Statement Paid.</p>
                  {!month.postedToBannerAt ? (
                    <form action={postStatementMonthToBannerAction} className="inlineEditForm" style={{ marginTop: "0.5rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="buttonLink buttonPrimary">
                        Post To Banner (Move Pending CC To YTD)
                      </button>
                    </form>
                  ) : (
                    <p className="successNote">Posted to Banner: {month.postedToBannerAt.slice(0, 10)}</p>
                  )}
                  {!month.postedToBannerAt ? (
                    <form action={reopenStatementMonthAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="tinyButton">
                        Reopen Statement Month
                      </button>
                    </form>
                  ) : (
                    <form action={unpostStatementMonthFromBannerAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="tinyButton dangerButton">
                        Unpost From Banner
                      </button>
                    </form>
                  )}
                </>
              )}
            </details>
          );
        })}
      </article>

      <article className="panel panelFull">
        <h2>Current Pending CC by Budget Code</h2>
        <p className="heroSubtitle">Live pending balances still waiting to be posted.</p>
        <form method="get" className="requestForm inlineFilterForm" style={{ marginTop: "0.6rem" }}>
          <label>
            Project
            <select name="cc_pending_project" defaultValue={selectedPendingProject}>
              <option value="">All projects</option>
              {Array.from(new Map(rows.map((row) => [row.projectId, projectNameById.get(row.projectId) ?? row.projectId])).entries()).map(
                ([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                )
              )}
            </select>
          </label>
          <label>
            Card
            <select name="cc_pending_card" defaultValue={selectedPendingCard}>
              <option value="">All cards</option>
              {Array.from(new Set(rows.map((row) => row.creditCardName ?? "Unassigned"))).map((cardName) => (
                <option key={cardName} value={cardName}>
                  {cardName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input name="cc_pending_q" defaultValue={selectedPendingQuery} placeholder="Project or budget code" />
          </label>
          <button type="submit" className="tinyButton">
            Filter
          </button>
        </form>
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
            {filteredPendingRows.length === 0 ? (
              <tr>
                <td colSpan={4}>No pending credit card balances.</td>
              </tr>
            ) : null}
            {filteredPendingRows.map((row, idx) => (
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
